# API contracts inventory

## Contract policy

- REST/Fastify is the primary ContainerHub transport. Drax identity and HTTP clients remain authoritative infrastructure.
- Keep GraphQL only where current compatibility requires it; do not recreate legacy Apollo organization.
- OpenAPI schemas document routes and the shared Ajv 2020-12 compiler enforces Fastify request validation and coercion.
- Docker error details must not leak secrets; destructive commands must retain meaningful not-found/conflict/validation semantics.

## Current implemented contracts

### Authentication

- Protected REST routes accept either `Authorization: Bearer <JWT>` for the browser session or `X-API-Key: <user API key>` for automation. An API key is an opaque Drax HMAC-backed secret, not a JWT exchange token.
- UUID-like Drax API keys are also accepted in `Authorization: Bearer <API key>` for the existing Docker DevOps client; ContainerHub promotes that value to the native API-key middleware without changing JWT handling.
- Both credentials build the same Drax identity/RBAC context, so route permissions and audit actor metadata remain unchanged.
- API-key deletion/revocation takes effect after the Drax API-key cache TTL; it is not documented as instantaneous. The terminal WebSocket continues to require its one-use ticket, created through an authenticated terminal-session request.

### Docker DevOps consumer compatibility

Docker DevOps continues to read `Environment.dockerApiToken` and send it as `Authorization: Bearer *** For ContainerHub the stored value is a Drax user API-key secret, not a migrated Docker Fortes JWT. The functional API contract requires only changing the Environment's `dockerApiUrl` and `dockerApiToken`; rollout also requires the security-only logging correction described below.

This compatibility keeps Docker DevOps's existing credential storage: `dockerApiToken` is a plaintext Mongoose field, is exposed by its GraphQL `Environment` type and is rendered by its Environment UI. The integration therefore requires HTTPS (or an equivalently isolated private transport), restricted Environment/MongoDB administration and an API-key IP allow-list where the topology provides stable backend addresses. Before rollout, Docker DevOps must also include the logging correction that removes serialization of the `Environment` document, service mutation payload and update response; historical logs created before that correction require restricted access, retention review and API-key rotation if exposure cannot be excluded.

The Docker Fortes token is not copied because its JWT claims and role resolution differ from Drax. Reusing a human Docker DevOps session JWT would additionally require request-token propagation and would not cover background jobs. Shared JWT/SSO federation is outside this provider replacement.

The dedicated integration role requires exactly:

- `DOCKER_VIEW`
- `DOCKER_CONFIGURATION_VIEW`
- `DOCKER_CREATE`
- `DOCKER_UPDATE`
- `DOCKER_REMOVE`
- `DOCKER_NODES_FETCH`
- `DOCKER_NETWORK_VIEW`

`DOCKER_CONFIGURATION_VIEW` reveals configuration values on the legacy Docker service contracts and the full task inspection. Without it, service environment/label values and sensitive task inspection values remain `[REDACTED]`. Native `/api/services` and GraphQL remain redacted.

### Services

| Contract | Permission | Shape/notes | Status |
|---|---|---|---|
| `GET /api/services` | `DOCKER_VIEW` | Full normalized service array | DONE |
| `GET /api/services/paginate` | `DOCKER_VIEW` | Query `page,limit,orderBy,order,search,stack,filters`; returns `{page,limit,total,items}` | DONE |
| `GET /api/docker/service` and `/:idOrName` | `DOCKER_VIEW`; `DOCKER_CONFIGURATION_VIEW` to reveal config values | List/inspect/find; env and labels redacted by default | DONE |
| `POST /api/docker/service` | `DOCKER_CREATE` | Inspected response, task networks/aliases, labeled stack network, health-check, resources and legacy policies; legacy `command: null` uses the image default | DONE |
| `PUT /api/docker/service/:service` | `DOCKER_UPDATE` | Live versioned update through the shared create/update mapper with durable audit; legacy `command: null` clears an explicit command and restores the image default | DONE |
| restart/remove single backend | `DOCKER_RESTART` / `DOCKER_REMOVE` | Existing single-service commands with durable audit | DONE |
| `POST /api/docker/service/restart` / `POST /api/docker/service/remove` | `DOCKER_RESTART` / `DOCKER_REMOVE` | Non-empty `serviceIds`; sequential per-service success/error results without aborting the batch | DONE |
| restart/remove selected UI | operation-specific | Shared one-or-many selection; separate confirmation, result feedback and refresh | DONE |
| service stats/tag | `DOCKER_VIEW` | Raw stats plus normalized metrics/tag; no end-user statistics UI | PARTIAL |

### Tasks, logs and terminal

| Contract | Permission | Shape/notes | Status |
|---|---|---|---|
| `GET /api/docker/tasks/:serviceIdentifier` | `DOCKER_VIEW` | Normalized task array | DONE |
| `GET /api/docker/task/:taskId/inspect` | `DOCKER_VIEW`; `DOCKER_CONFIGURATION_VIEW` to reveal the full payload | Docker task inspection; recursively redacted by default | DONE |
| `GET /api/docker/task/:taskId/logs?tail=` | `DOCKER_LOGS` | Snapshot, tail 1..2000 | DONE |
| `WS /api/docker/task/:taskId/logs/stream` | `DOCKER_LOGS` | JWT via bearer subprotocol; one filter-start frame | DONE |
| `GET /api/docker/logs/:stack/:service` | `DOCKER_LOGS` | Snapshot from the first normalized running task; `null` when none is running | DONE |
| task/service stats | `DOCKER_VIEW` | `{task, stats, metrics}`; local daemon or task-node agent; remote/invalid sample failure 503; polling chart UI implemented; distinct-worker/browser proof pending | PARTIAL |
| terminal ticket + local-daemon `WS /api/docker/terminal` | `DOCKER_TERMINAL` | One-use 60s ticket, origin/shell/size/time limits | DONE |
| terminal against a remote worker | `DOCKER_TERMINAL` | Task-selected binary agent relay with node/task/container checks; distinct-worker browser proof pending | PARTIAL |

Log filter semantics: `tail`, non-negative `since`, `timestamps`, include/exclude string arrays. Exclusions win. Include entries are AND groups; comma-separated terms within a group are OR. `*` is wildcard; malformed regex falls back to substring.

### Nodes, networks, ghosts and filesystem

| Contract | Permission | Status/notes |
|---|---|---|
| `GET /api/docker/nodes` normalized snapshot | `DOCKER_NODES_FETCH` | DONE |
| `GET /api/docker/version` | `DOCKER_VIEW` | DONE; `{Version,ApiVersion}` only |
| `GET /api/docker/cluster` | `DOCKER_VIEW` | DONE; `{nodesQuantity,servicesQuantity,tasksQuantity}`; unfiltered list lengths, including all retained historical tasks; failed Docker reads fail the request rather than returning partial totals |
| Network list/detail | `DOCKER_NETWORK_VIEW` | DONE |
| Network create/get-or-create | `DOCKER_NETWORK_CREATE` (+ view for get-or-create) | PARTIAL |
| Network replace/remove backend | update/remove | DONE |
| Network mutation audit/safety parity | update/remove | PARTIAL |
| `GET /api/docker/ghostContainers` local running-container reconciliation | `DOCKER_VIEW` | DONE |
| Cluster-wide ghost collection through `GET /api/docker/ghostContainers` | `DOCKER_VIEW` | PARTIAL; manager-local plus worker-agent inventories; `503` instead of an incomplete list when any remote scan fails; second-worker API/browser proof pending |
| `POST /api/docker/folders` local confined contract | `DOCKER_UPDATE` | DONE |
| All-node folder provisioning | `DOCKER_UPDATE` | PARTIAL |
| `POST /api/docker/files` local confined/awaited contract | `DOCKER_UPDATE` | DONE |

Ghost reconciliation follows Docker Engine API v1.51 [`ContainerList`](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Container/operation/ContainerList) (`all=false` returns running containers) and [`TaskList`](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Task/operation/TaskList) (`Status.State`, `Status.ContainerStatus.ContainerID`, and `NodeID`).

### Integrations

| Contract | Permission | Status/notes |
|---|---|---|
| `GET /api/gitlab/project` and `/:id/tags`; permission choice unresolved | `DOCKER_VIEW` | DONE |
| `GET /api/registry/image` and `/tags`; unauthenticated/basic Registry v2 | `DOCKER_VIEW` | DONE |

### Identity and diagnostics

- Drax User/Role/Tenant routes are registered; corresponding frontend management routes are not.
- Registration/recovery/avatar routes may exist transitively but are not operationally complete without email, multipart and file/base URL configuration.
- `GET /api/services/health` requires `DOCKER_VIEW`; legacy public `/status` parity is absent.
- `/documentation` exposes generated OpenAPI.
- Compiled GraphQL compatibility loads `.resolvers.js`; source development loads `.resolvers.ts`. Both GraphQL Tools packages are direct backend dependencies and the production build asserts the service resolvers are present.

## Legacy contracts that require migration or decision

| Capability | Legacy contract | Target decision |
|---|---|---|
| Cluster topology | GraphQL node/task aggregate | CLU-01 totals migrated; CLU-02 topology and selectable polling remain missing |
| Task inspect | GraphQL JSON | Implemented as protected `GET /api/docker/task/:taskId/inspect`; preserves structure with recursive redaction by default and reveals the full payload with `DOCKER_CONFIGURATION_VIEW` |
| Agent health | `GET /api/docker/nodes` includes nullable `agentHealthy` | Backend-to-agent `/health` matches the returned node ID; transport is HTTP by default and supports optional mTLS when all certificate variables are configured |
| Agent containers | GraphQL backed by HTTP agent | Implemented `GET /containers/running`: `{nodeId, containers}`; node ID and consumed fields validated; 2s deadline and 8 MiB response limit. Authenticated remote ghost reconciliation passed on `debianvm` |
| Derived stats | REST task/service `metrics` | CPU percentage/core count, total memory bytes, cumulative disk/network bytes; authenticated remote API and four-chart browser proof passed on `debianvm` |
| Monitoring configuration/history | GraphQL creation/list/actions; unused edit helper | MON-01 configuration REST plus MON-02 protected sample history below; real Docker/database/browser and distinct-worker proof pending |
| Task lifecycle history | GraphQL list | Define event semantics and retention first |
| Operational audit | Dracul GraphQL | Drax `/api/audits` read API with authenticated RBAC; service/network mutations remain the durable writers |
| Settings/customization | Dracul generic APIs | Add only accepted product-specific contracts |
| LDAP | Dracul LDAP fallback/group mapping | Deferred until Drax implements native LDAP support; no parallel ContainerHub adapter |
| Existing local users/refresh token | Dracul bcrypt users and persisted refresh tokens | Prove shared-Mongo local-user login; assess refresh-token compatibility separately from LDAP |

## MON-01 configuration REST

Base: `/api/monitoring-configurations`. All routes require authentication.

| Operation | Permission | Contract |
|---|---|---|
| `GET /` | `DOCKER_VIEW` | Drax `{items,total,page,limit}`; query `page` >=1, `limit` 1..100, `search` case-insensitive service name, `order` asc/desc, `orderBy` serviceName/status/collectionInterval/createdAt. No arbitrary field/filter expressions. |
| `GET /:id` | `DOCKER_VIEW` | Persisted configuration; absent ID returns 404. |
| `GET /statuses` | `DOCKER_VIEW` | Query `serviceIds` comma-separated; returns existing `{serviceId,status}` entries without deriving them from a paginated list. |
| `POST /` | `DOCKER_MONITORING_CREATE` | `{serviceIds,type,collectionInterval,collectionType,since?,until?,holdingTime?}`; names/stack resolved from current Docker service inventory, not accepted from the browser. Returns `{created,skipped}`; an existing configuration is never overwritten/reactivated. |
| `POST /:id/pause`, `POST /:id/resume` | `DOCKER_MONITORING_PAUSE` | Empty body; returns configuration with `paused` / `monitoring`. Idempotent desired-state changes, not proof that a collector is running. |
| `DELETE /:id` | `DOCKER_MONITORING_DELETE` | Drax deletion response; deletes configuration only, never the Docker service. |

Configuration fields: `_id`, `serviceId`, `serviceName`, nullable `serviceStack`, `type`, `status`, `collectionInterval`, `collectionType`, nullable `since/until/holdingTime`, `createdAt/updatedAt`.
Intervals: `15s/30s/45s/60s`; replica scope: `replic/global`; modes: `calendar/permanent`. Calendar uses date-only `YYYY-MM-DD` with `since < until`; permanent requires a positive integer retention in days. Inactive-mode fields persist as null. Status is stored intent (`monitoring/paused`), while collector execution remains internal rather than introducing a third persisted status.

Malformed input returns 400; missing selected Docker services return 404 before creating any configuration. Service uniqueness is database-enforced. Batch creation remains sequential (not transactional); an unexpected storage failure is returned, and retry skips configurations already saved. No general update endpoint or edit UI: legacy's update helper had no consumer.

## MON-02 sample history

`GET /api/monitoring-configurations/:id/samples` requires `DOCKER_VIEW` and returns `{items}` newest-first. Optional `since`/`until` are dates and `limit` is 1..1000 with default 500. Deleting a configuration also deletes its samples. The collector prevents overlapping scans, re-discovers replacement tasks, stores normalized metrics keyed by configuration/task/sample time and applies bounded holding-time retention. Repository checks pass; current real Docker/database/browser and distinct-worker proof is still pending.

OpenAPI currently provides route/auth metadata for these operations; the request/response contract above is not a claim of fully generated operation schemas.

## Known contract defects and incompatibilities

1. Current Drax access-token model does not implement legacy persisted refresh-token behavior.
2. GitLab/Registry use `{items,totalItems}`/catalog shapes rather than the Drax pagination contract; this is acceptable for their custom read-only pages unless common pagination is needed.

Service network, resource, restart and rollout placement follows Docker Engine API v1.51 [`ServiceCreate`](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Service/operation/ServiceCreate) and [`ServiceUpdate`](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/Service/operation/ServiceUpdate). Networks belong under `TaskTemplate.Networks`; top-level `ServiceSpec.Networks` is deprecated since API v1.44.

Docker version fields follow Docker Engine API v1.51 [`SystemVersion`](https://docs.docker.com/reference/api/engine/version/v1.51/#tag/System/operation/SystemVersion).

## STAT-01 normalized metrics

`GET /api/docker/task/:taskid/stats` returns `{task, stats, metrics}`. Both service variants
(`GET /api/docker/service/id/:serviceId/stats` and `GET /api/docker/service/:serviceName/stats`)
return an array of the same envelope. Existing raw `task`/`stats` fields are retained.
Tasks without a container retain their entry with `stats: null, metrics: null`.

| Metric | Meaning |
|---|---|
| `sampledAt` | Daemon sample's `read`, or null when absent |
| `cpuUsage.cpuPercentage` | CPU/system deltas times online cores times 100; null for missing/reset counters or a nonpositive system delta |
| `cpuUsage.cpuCoreQuantity` | Online cores, falling back to the per-CPU array length; null when absent |
| `memoryUsage.memoryTotalUsage` / `memoryLimitUsage` | Total usage (including cache) / limit in bytes, preserving legacy chart semantics; null when absent |
| `ioUsage.readIoBytes` / `writeIoBytes` | Cumulative bytes summed across all devices, matching read/write case-insensitively; null when counters are absent, zero for a reported empty list |
| `networksUsage[]` | One `{network, rxBytes, txBytes}` per reported interface; cumulative bytes, not bytes/second; empty when none are reported |

CPU calculation, fallback and cgroup field differences follow the official
[Docker Engine v1.47 ContainerStats contract](https://docs.docker.com/reference/api/engine/version/v1.47/#tag/Container/operation/ContainerStats)
([versioned source, inspected](https://github.com/moby/moby/blob/v27.5.1/docs/api/v1.47.yaml#L7693-L7722)).
The normalizer validates consumed numbers as finite/nonnegative. Malformed samples return 503;
missing measurements remain nullable instead of inventing zero usage. One remote failure rejects
the service request rather than returning an apparently complete partial snapshot.

Verification: current full backend discovery executes 80 tests (79 pass, one opt-in live-terminal skip), frontend executes 23 passing tests, agent executes 6 passing tests, and all three builds pass. A temporary global agent deployment then returned 200 stats for the exact container of a task pinned to `debianvm`; authenticated Chromium rendered its four normalized charts. STAT-01 and STAT-02 are DONE.
