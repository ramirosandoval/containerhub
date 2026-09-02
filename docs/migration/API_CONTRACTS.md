# API contracts inventory

## Contract policy

- REST/Fastify is the primary ContainerHub transport. Drax identity and HTTP clients remain authoritative infrastructure.
- Keep GraphQL only where current compatibility requires it; do not recreate legacy Apollo organization.
- OpenAPI schemas currently document routes but Fastify runtime validation is globally bypassed. Manual validation is therefore part of the actual contract until that architecture is corrected.
- Docker error details must not leak secrets; destructive commands must retain meaningful not-found/conflict/validation semantics.

## Current implemented contracts

### Services

| Contract | Permission | Shape/notes | Status |
|---|---|---|---|
| `GET /api/services` | `DOCKER_VIEW` | Full normalized service array | DONE |
| `GET /api/services/paginate` | `DOCKER_VIEW` | Query `page,limit,orderBy,order,search,stack,filters`; returns `{page,limit,total,items}` | DONE |
| `GET /api/docker/service/:idOrName` | `DOCKER_VIEW` | Inspect/find | DONE |
| `POST /api/docker/service` | `DOCKER_CREATE` | Partial legacy input compatibility; requires Docker probe | PARTIAL |
| `PUT /api/docker/service/:service` | `DOCKER_UPDATE` | Versioned update; policies/network/health parity incomplete | PARTIAL |
| restart/remove single and bulk backend | operation-specific | Sequential fail-fast commands | DONE |
| restart/remove single and bulk UI | operation-specific | No controls, confirmation or feedback | PARTIAL |
| service stats/tag | `DOCKER_VIEW` | Raw stats/tag; no end-user statistics UI | PARTIAL |

### Tasks, logs and terminal

| Contract | Permission | Shape/notes | Status |
|---|---|---|---|
| `GET /api/docker/tasks/:serviceIdentifier` | `DOCKER_VIEW` | Normalized task array | DONE |
| `GET /api/docker/task/:taskId` | undecided | Raw/redacted inspect | MISSING |
| `GET /api/docker/task/:taskId/logs?tail=` | `DOCKER_LOGS` | Snapshot, tail 1..2000 | DONE |
| `WS /api/docker/task/:taskId/logs/stream` | `DOCKER_LOGS` | JWT via bearer subprotocol; one filter-start frame | DONE |
| `GET /api/docker/logs/:stack/:service` | `DOCKER_LOGS` | Snapshot from the first normalized running task; `null` when none is running | DONE |
| task/service stats | `DOCKER_VIEW` | Raw Docker stats; no normalized DTO or UI | PARTIAL |
| terminal ticket + local-daemon `WS /api/docker/terminal` | `DOCKER_TERMINAL` | One-use 60s ticket, origin/shell/size/time limits | DONE |
| terminal against a remote worker | `DOCKER_TERMINAL` | No proven distributed execution transport | PARTIAL |

Log filter semantics: `tail`, non-negative `since`, `timestamps`, include/exclude string arrays. Exclusions win. Include entries are AND groups; comma-separated terms within a group are OR. `*` is wildcard; malformed regex falls back to substring.

### Nodes, networks, ghosts and filesystem

| Contract | Permission | Status/notes |
|---|---|---|
| `GET /api/docker/nodes` normalized snapshot | `DOCKER_NODES_FETCH` | DONE |
| Network list/detail | `DOCKER_NETWORK_VIEW` | DONE |
| Network create/get-or-create | `DOCKER_NETWORK_CREATE` (+ view for get-or-create) | PARTIAL |
| Network replace/remove backend | update/remove | DONE |
| Network mutation audit/safety parity | update/remove | PARTIAL |
| `GET /api/docker/ghostContainers` transport/page contract | `DOCKER_VIEW` | DONE |
| Ghost detection behavior | `DOCKER_VIEW` | PARTIAL |
| `POST /api/docker/folders` local confined contract | `DOCKER_UPDATE` | DONE |
| All-node folder provisioning | `DOCKER_UPDATE` | PARTIAL |
| `POST /api/docker/files` local confined/awaited contract | `DOCKER_UPDATE` | DONE |

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

## Legacy contracts that require migration or decision

| Capability | Legacy contract | Target decision |
|---|---|---|
| Docker version | GraphQL `fetchDockerVersion` | Add protected minimal REST only if retained |
| Cluster totals/topology | GraphQL aggregate queries | Define active vs historical task count and avoid N+1 |
| Task inspect | GraphQL JSON | Define redacted DTO/permission before endpoint |
| Agent health/containers | GraphQL backed by HTTP agent | Depends on shared remote-node architecture |
| Derived stats | GraphQL/REST normalized metrics | Define stable normalized DTO before UI |
| Monitoring configuration/history | GraphQL CRUD/actions | Full persisted Drax entity plus custom action/history APIs if retained |
| Task lifecycle history | GraphQL list | Define event semantics and retention first |
| Operational audit | Dracul GraphQL | Choose Drax-compatible persisted sink/read API |
| Settings/customization | Dracul generic APIs | Add only accepted product-specific contracts |
| LDAP/refresh token | Dracul auth behavior | Explicit compatibility/product decision |

## Known contract defects and incompatibilities

1. Current ghost endpoint name/response does not match ghost semantics.
2. Service create/update network and health-check option placement is not live-proven.
3. Runtime Fastify validation is disabled despite OpenAPI schemas.
4. GraphQL resolver loading searches `.resolvers.ts`; compiled production files are `.resolvers.js`.
5. `@graphql-tools/load-files` and `@graphql-tools/merge` are direct imports but only transitively installed.
6. Current Drax access-token model does not implement legacy persisted refresh-token behavior.
7. GitLab/Registry use `{items,totalItems}`/catalog shapes rather than the Drax pagination contract; this is acceptable for their custom read-only pages unless common pagination is needed.
