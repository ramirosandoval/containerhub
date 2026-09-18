# ContainerHub

Docker Swarm management panel. Replaces the legacy `docker-fortes` panel
(scaffolded on Dracul/Apollo 2 / Vue 2) with a Drax-based stack
(TS / Fastify 5 / graphql-yoga 5 / Vue 3 / Vuetify 3).

## Layout

```
packages/
  containerhub-agent/   Per-node Docker health process with mandatory mTLS
  containerhub-back/    Fastify + graphql-yoga + Mongoose + Drax identity
  containerhub-front/   Vite + Vue 3 + Vuetify 3 + Apollo Client 3
```

The backend shares Mongo with the legacy app. Coexistence: legacy on
port 9999, containerhub on 9998, Mongo DB `incartainer`.

## First run

```bash
sh setup.sh
cp packages/containerhub-back/.env.example packages/containerhub-back/.env
# set every required value described below
npm run dev:back       # http://localhost:9998
npm run dev:front      # http://localhost:5173
```

## Docker Swarm local test

The root [`Dockerfile`](Dockerfile) builds the backend and frontend, then
packages both in one `containerhub` image. The Node.js backend serves the
compiled SPA from `/app/public`; there is no separate frontend container.
The agent remains a separate image because Swarm runs one agent task on each
Linux worker so it can access that node's Docker socket.

[`docker-compose.yml`](docker-compose.yml) is the Swarm stack definition used
by `docker stack deploy`; this project does not use Docker Compose to run the
application. It defines the application on a manager, the global worker agent,
an isolated SQLite volume, the internal mTLS overlay network and the required
external secrets. Run these commands from a Swarm manager.

### 1. Initialize agent mTLS

The repository helper creates or verifies the overlay network, CA,
certificates and five agent secrets. Private keys stay outside the repository.

```bash
packages/containerhub-agent/deploy-remote-worker-proof.sh init
```

See [`packages/containerhub-agent/TLS.md`](packages/containerhub-agent/TLS.md)
for certificate ownership, rotation and manual setup.

### 2. Create test login secrets

Choose the initial administrator password interactively; neither secret is
stored in the stack file.

```bash
openssl rand -hex 32 | docker secret create containerhub-test-jwt -
openssl rand -hex 32 | docker secret create containerhub-test-api-key -
read -rsp 'ContainerHub test administrator password: ' CONTAINERHUB_TEST_PASSWORD; echo
printf %s "$CONTAINERHUB_TEST_PASSWORD" | docker secret create containerhub-test-bootstrap-password -
unset CONTAINERHUB_TEST_PASSWORD
```

The default test username is `containerhub-test`. Override the non-secret
bootstrap fields with `CONTAINERHUB_BOOTSTRAP_USERNAME`,
`CONTAINERHUB_BOOTSTRAP_NAME`, `CONTAINERHUB_BOOTSTRAP_EMAIL` and
`CONTAINERHUB_BOOTSTRAP_PHONE` before deployment when needed.

### 3. Build the images

Build the unified application and agent images directly with Docker:

```bash
docker build --target application -t containerhub:swarm-test .
docker build -f packages/containerhub-agent/Dockerfile -t containerhub-agent:swarm-test .
```

`docker stack deploy` does not build or copy local images between nodes. Before
deployment, make both images available on every eligible node by pushing them
to a registry or preloading them with `docker save`/`docker load`. With a
registry, set the image names before building:

```bash
export CONTAINERHUB_IMAGE=registry.example/containerhub:swarm-test
export CONTAINERHUB_AGENT_IMAGE=registry.example/containerhub-agent:swarm-test
docker build --target application -t "$CONTAINERHUB_IMAGE" .
docker build -f packages/containerhub-agent/Dockerfile -t "$CONTAINERHUB_AGENT_IMAGE" .
docker push "$CONTAINERHUB_IMAGE"
docker push "$CONTAINERHUB_AGENT_IMAGE"
```

For a single-manager test without a registry, the application image only needs
to be present on that manager; the agent image must be preloaded on every Linux
worker.

### 4. Deploy and test

The default browser origin and published URL are
`http://127.0.0.1:9998`. When opening ContainerHub through another hostname or
IP, export the exact browser origin before deploying so terminal WebSockets are
accepted. You can also customize the exposed port using `CONTAINERHUB_PORT`.

```bash
export CONTAINERHUB_ORIGIN=http://127.0.0.1:9998
export CONTAINERHUB_PORT=9998
export CONTAINERHUB_STORAGE_ROOT=/storage
docker stack deploy --resolve-image never -c docker-compose.yml containerhub-test
docker stack services containerhub-test
```

Create `$CONTAINERHUB_STORAGE_ROOT` with the required ownership on every
manager and worker before deployment. The stack mounts that same absolute path
into the application and each global agent; provisioning a manager-only path
does not make a worker bind mount usable.

Use `--with-registry-auth` instead of `--resolve-image never` when the images
are hosted in an authenticated registry. Open `$CONTAINERHUB_ORIGIN`, sign in
with the configured bootstrap user, and verify the Nodes page. To exercise the
remote path, place a disposable service on a worker and use its task actions
for statistics or terminal access.

### 5. Clean up

```bash
docker stack rm containerhub-test
until [ -z "$(docker ps -aq --filter label=com.docker.stack.namespace=containerhub-test)" ]; do sleep 1; done
docker secret rm containerhub-test-jwt containerhub-test-bootstrap-password
docker volume rm containerhub-test_containerhub-data
```

Keep the agent mTLS network and secrets when they will be reused. Their removal
and certificate rotation are documented in the TLS manual.

### Backend environment contract

ContainerHub uses the current Drax environment names directly:

| Variable | Required | Purpose |
|---|---:|---|
| `DRAX_DB_ENGINE` | yes | Drax persistence engine: `mongo` or `sqlite` |
| `DRAX_MONGO_URI` | when engine is `mongo` | MongoDB connection URI |
| `DRAX_SQLITE_FILE` | when engine is `sqlite` | SQLite database file |
| `DRAX_JWT_SECRET` | yes | Secret used by Drax to sign and verify access tokens |
| `DRAX_APIKEY_SECRET` | yes | Independent secret used by Drax to HMAC-protect user API keys |
| `DRAX_JWT_EXPIRATION` | no | Access-token lifetime; Drax defaults to `1h` |
| `DRAX_JWT_ISSUER` | no | Access-token issuer; Drax defaults to `DRAX` |
| `DRAX_PORT` | no | Backend port; ContainerHub defaults to `9998` |
| `TERMINAL_ALLOWED_ORIGIN` | in production | Exact browser origin allowed to open terminal WebSockets, for example `https://containerhub.example.com` |
| `CONTAINERHUB_BOOTSTRAP_ENABLED` | no | Explicit initial-user opt-in: `true` or `false`; omitted defaults to `false` |
| `CONTAINERHUB_BOOTSTRAP_NAME` | when bootstrap is enabled | Initial user's display name |
| `CONTAINERHUB_BOOTSTRAP_USERNAME` | when bootstrap is enabled | Initial user's login name |
| `CONTAINERHUB_BOOTSTRAP_PASSWORD` | when bootstrap is enabled | Initial user's password; no default or example value is provided |
| `CONTAINERHUB_BOOTSTRAP_EMAIL` | when bootstrap is enabled | Initial user's email required by Drax |
| `CONTAINERHUB_BOOTSTRAP_PHONE` | when bootstrap is enabled | Initial user's phone required by the Drax create-user contract |

Startup fails before database connection or bootstrap work when a required
value is missing. `DRAX_JWT_SECRET` and `DRAX_APIKEY_SECRET` deliberately have
no runtime fallback and must differ. The migration/coexistence deployment uses `mongo` and the shared
`incartainer` database; SQLite remains the alternative engine supported by
the current Drax identity repositories.

### API authentication

Browser sessions continue to send `Authorization: Bearer <JWT>`. Automation may
send `X-API-Key: <user API key>` instead; it is not a JWT and is shown only when
created. Both credentials flow through the same Drax RBAC checks. Deleting an
API key revokes it after the configured Drax API-key cache TTL (10 seconds by
Drax default when it is unset). Terminal
WebSockets continue to use the one-time terminal ticket created by either
authenticated request.

Initial privileged-user creation is disabled unless
`CONTAINERHUB_BOOTSTRAP_ENABLED=true`. With that opt-in, all five bootstrap
identity values are mandatory and startup fails before connecting to the
database when any is blank or absent. ContainerHub fixes this user as active
with the existing `Admin` role. The bootstrap password is never logged; Drax
logs the username when it creates the user.

Drax `CreateUserIfNotExist` looks up the username first. If it already exists,
the stored password and profile are returned unchanged, so repeated startup is
idempotent and does not reset credentials. After the first successful startup,
set `CONTAINERHUB_BOOTSTRAP_ENABLED=false` and remove the five bootstrap values
from the runtime environment. Re-enabling bootstrap with a different username
would create another privileged user.

### Node agent

`packages/containerhub-agent` builds a global Swarm process whose `/health`
response verifies the Docker daemon mounted on that node. It requires a CA and
server certificate/key, rejects clients without a certificate signed by that
CA, and reports the Swarm `NODE_ID` injected by `stack.yml`. The backend enables
the Nodes-page health column only when its CA and client certificate/key are all
configured; otherwise the column shows the unconfigured state.

The same mTLS connection serves `/containers/running`. Ghost detection lists
the manager's local containers directly and queries this endpoint on every other
node, then reconciles all containers against the manager's task snapshot. The
existing `DOCKER_VIEW` endpoint returns `503` if any remote node is unavailable,
unconfigured, or returns an invalid inventory; it never returns partial success.
Health/inventory responses have a two-second deadline and an 8 MiB ceiling. The node ID
is checked before consuming its inventory. Authenticated deployment and browser proof
have exercised the mTLS agent against a distinct worker.

Task/service stats now resolve the task's `NodeID`: local tasks use the manager
daemon, other tasks use `GET /containers/:containerId/stats` on that node's
agent. The existing raw `{task, stats}` contract is unchanged. Remote failures
return `503`, never a manager fallback. Stats have a ten-second deadline because
[Docker collects two sampling cycles](https://docs.docker.com/reference/api/engine/version/v1.47/#tag/Container/operation/ContainerStats)
with `stream=false`; the 8 MiB response ceiling and node/container checks remain.

Terminal keeps its existing user ticket and Origin checks. Remote tasks use a
binary mTLS WebSocket to the same agent port; the manager resolves the target,
and the agent verifies its node plus the running container's task/node labels
before exec. Shells remain `sh`/`bash`, with bounded resize/input/output and
session teardown. Task inspect and polling statistics pages now consume the
protected REST endpoints. Distributed proof has exercised these paths with a
task placed on a distinct worker; all-node host provisioning remains pending.

Certificate issuance and Docker secret creation are deployment-owned. The
agent is not published on a host port: the backend discovers each global task
through Swarm DNS on their shared overlay network and confirms its `NODE_ID`.
See [`packages/containerhub-agent/TLS.md`](packages/containerhub-agent/TLS.md)
for certificate issuance, Docker secrets, network wiring and deployment.

## Migration plan

Pages migrate one by one from `docker-fortes` (Vue 2) to
`containerhub-front` (Vue 3), starting with the Services page.
Until all pages are migrated, both stacks run side by side and the
DNS routes by URL prefix.

The shared mTLS agent, remote ghost reconciliation, stats/charts and keyboard-driven
terminal passed authenticated proof with a task on a distinct worker. The next
migration slice is RBAC-03 users/roles administration, starting with the ID-05
shared-Mongo existing-user login proof. LDAP is deferred until Drax provides native
LDAP support.
