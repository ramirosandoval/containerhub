# ContainerHub

Docker Swarm management panel. Replaces the legacy `docker-fortes` panel
(scaffolded on Dracul/Apollo 2 / Vue 2) with a Drax-based stack
(TS / Fastify 5 / graphql-yoga 5 / Vue 3 / Vuetify 3).

## Layout

```
packages/
  containerhub-agent/   Per-worker Docker agent (HTTP/WS on the default private overlay)
  containerhub-back/    Fastify + graphql-yoga + Mongoose + Drax identity
  containerhub-front/   Vite + Vue 3 + Vuetify 3 + Apollo Client 3
```

The Swarm stack defaults to Mongo DB `containerhub`; the legacy app uses
`incartainer`. They can run side by side on ports 9998 and 9999, respectively,
but sharing a Mongo server does not by itself establish shared-user login.

## First run

```bash
sh setup.sh
cp packages/containerhub-back/.env.example packages/containerhub-back/.env
# set every required value described below
npm run dev:back       # http://localhost:9998
npm run dev:front      # http://localhost:5173
```

## Docker Swarm

The root [`Dockerfile`](Dockerfile) packages the backend and compiled SPA in
one image, reused by the application and monitoring services. The worker agent
has its own image. [`docker-compose.yml`](docker-compose.yml) defines all three
services for `docker stack deploy` (not `docker compose up`): application and
monitoring on a manager, one agent on each Linux worker, Mongo as the configured
database, and an external Docker secret for Vault access. The default agent
transport is HTTP/WS on a private overlay; **mTLS is not required or enabled**.

Follow **one deployment guide**: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
It covers building and distributing both images, preparing Vault, the Mongo
network and host paths, selecting the database and browser origin, preflight,
deployment, and verification. Do not apply this partial stack definition to
the existing shared `dockerway` stack. The separate
[`agent TLS manual`](packages/containerhub-agent/TLS.md) is an optional setup,
not a prerequisite for the default stack.

### Backend environment contract

ContainerHub uses the current Drax environment names directly:

| Variable | Required | Purpose |
|---|---:|---|
| `DRAX_DB_ENGINE` | yes | Drax persistence engine: `mongo` or `sqlite` |
| `DRAX_MONGO_URI` | when engine is `mongo` | MongoDB connection URI |
| `DRAX_SQLITE_FILE` | when engine is `sqlite` | SQLite database file |
| `DRAX_JWT_SECRET` | yes | Secret used by Drax to sign and verify access tokens |
| `DRAX_APIKEY_SECRET` | yes | Independent secret used by Drax to HMAC-protect user API keys |
| `CONTAINERHUB_VAULT_URL` | for the Swarm stack | Vault API base URL reachable from the application tasks |
| `CONTAINERHUB_VAULT_CLIENT_ID` | when Vault is configured | Vault client identifier; the stack defaults to `containerhub` |
| `CONTAINERHUB_VAULT_CLIENT_KEY_FILE` | when Vault is configured | In-container path containing the Vault client key; the Swarm stack sets `/run/secrets/containerhub-vault-client-key` |
| `CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID` | when bootstrap is enabled | Optional Vault identifier loaded into `CONTAINERHUB_BOOTSTRAP_PASSWORD` |
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
no runtime fallback and must differ. The Swarm stack maps
`CONTAINERHUB_MONGO_URI` to `DRAX_MONGO_URI` and defaults to the `containerhub`
database, **not** the legacy `incartainer` database. Select a different URI
only after validating identity/schema compatibility. SQLite remains an
alternative for development, not the configuration of this Swarm stack.

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

`packages/containerhub-agent` runs globally on Linux workers. Its `/health`
checks the local Docker daemon and reports the Swarm `NODE_ID`; the backend
matches that ID to the requested worker. The default stack uses HTTP/WS on an
overlay network with no published agent port. This is not client authentication
or transport encryption. The code also supports optional mTLS, but the default
stack mounts no agent certificates; see the separate TLS manual only if that
deployment mode is explicitly selected.

The same agent serves `/containers/running`. Ghost detection scans the manager
locally and other nodes via the agent; it returns `503` rather than partial
inventory if a remote node is unavailable. Agent health/inventory requests have
a two-second deadline and an 8 MiB response ceiling.

Task/service stats resolve the task's `NodeID`: local tasks use the manager
daemon; remote tasks use `GET /containers/:containerId/stats` on that worker's
agent. Remote failures return `503`, never a manager fallback.

Terminal keeps its user ticket and Origin checks. Remote tasks use a binary
WebSocket to the same agent port; the manager resolves the target,
and the agent verifies its node plus the running container's task/node labels
before exec. Shells remain `sh`/`bash`, with bounded resize/input/output and
session teardown. The agent is not published on a host port: the backend
discovers its tasks through Swarm DNS on the shared overlay and checks `NODE_ID`.
Earlier distributed proof used optional mTLS; it is not proof that the current
HTTP/WS stack has been verified on a live worker.

## Migration plan

Pages migrate one by one from `docker-fortes` (Vue 2) to
`containerhub-front` (Vue 3), starting with the Services page.
Until all pages are migrated, both stacks run side by side and the
DNS routes by URL prefix.

Remote ghost reconciliation, stats/charts and terminal have prior distributed
proof with an mTLS agent. The current default stack is HTTP/WS; verify remote
behavior with a ready worker before claiming deployment parity. Shared-Mongo
existing-user login is a separate migration check, not a consequence of the
default `containerhub` database. LDAP remains deferred.
