# Permission inventory and migration policy

## Current ContainerHub Docker permissions

| Permission | Current use |
|---|---|
| `DOCKER_VIEW` | Services, stacks, ghost page, service/task/stats reads, GitLab and Registry |
| `DOCKER_CREATE` | Service create |
| `DOCKER_UPDATE` | Service update and local folder/file provisioning |
| `DOCKER_RESTART` | Service restart, single/bulk |
| `DOCKER_REMOVE` | Service remove, single/bulk |
| `DOCKER_LOGS` | Task and service log HTTP/WebSocket |
| `DOCKER_TERMINAL` | Terminal ticket and UI route |
| `DOCKER_NODES_FETCH` | Nodes API/page |
| `DOCKER_NETWORK_VIEW` | Network list/detail/page |
| `DOCKER_NETWORK_CREATE` | Network create/get-or-create |
| `DOCKER_NETWORK_UPDATE` | Network destructive replacement |
| `DOCKER_NETWORK_REMOVE` | Network delete |

Evidence: `packages/containerhub-back/src/modules/services/permissions/DockerPermissions.ts`, `ServiceRoutes.ts`, `TerminalRoutes.ts`, frontend router/navigation.

## Legacy Docker permissions

Legacy defines the same broad service permissions, `DOCKER_CONSOLE`, network permissions including unused/inconsistent `DOCKER_NETWORK_RESTART`, monitoring create/pause/delete, and `DOCKER_NODES_FETCH`.

Important observed enforcement:

- GraphQL service mutations generally enforce operation-specific permissions.
- Legacy frontend Docker routes generally require only `DOCKER_VIEW`; visible action controls do not consistently apply finer permissions.
- Legacy log and terminal WebSocket upgrades have no traced authentication/RBAC.
- Legacy network delete, ghost-container REST and task-stat/list REST paths contain missing route-local guards.
- These are security defects, not compatibility requirements. ContainerHub's stricter enforcement is intentional.

Evidence: `docker-fortes/apps/backend/src/modules/docker/permissions/dockerPermissions.js`, `graphql/resolvers/DockerResolvers.js`, Docker route files and `HttpServer.js`.

## Legacy product roles

Legacy seeds Sudo, Implementaciones, Infraestructura, Desarrollo, Dirección, PM, QA and Soporte, plus framework roles. The exact bundles are product policy. Current ContainerHub seeds only `Admin` and assigns it only Docker permissions.

Required decision before identity administration or LDAP migration:

1. Which legacy roles still exist?
2. Which Drax `user:*`, `role:*`, `tenant:*` permissions should each receive?
3. Do legacy groups still carry business meaning?
4. Is Drax tenancy part of this product or merely framework capability?
5. How do LDAP groups map after role names/permissions change?

## Domain decisions still required

| Capability | Legacy permission | Current state | Required decision |
|---|---|---|---|
| Task inspect | `DOCKER_VIEW` | Missing | Raw vs redacted output and whether broad view is sufficient |
| Cluster/version | `DOCKER_VIEW` | Missing | Reuse view or define narrower diagnostics permission |
| Monitoring read | `DOCKER_VIEW` | Missing | Whether historical operational data needs its own read permission |
| Monitoring mutations | `DOCKER_MONITORING_CREATE/PAUSE/DELETE` | Missing | Preserve names/semantics if feature survives |
| GitLab | Authenticated GraphQL; unguarded REST | `DOCKER_VIEW` | Keep Docker coupling or add integration-read permission |
| Registry | Authenticated GraphQL; unguarded REST | `DOCKER_VIEW` | Keep Docker coupling or add integration-read permission |
| Ghost detection | `DOCKER_VIEW` UI; unguarded REST | `DOCKER_VIEW` | Keep read-only; any future delete requires a new explicit permission |
| Host provisioning | `DOCKER_UPDATE` | `DOCKER_UPDATE` | Confirm whether filesystem writes deserve a separate high-risk permission |
| Audit read | `AUDIT_SHOW` | Missing | Define product audit permission if retained |
| Settings | `SETTINGS_SHOW/UPDATE` | Missing | Add only if editable settings survive |
| Customization | Granular create/update/colors/logo/language | Missing | Add only if branding survives |

## Drax identity permissions

Current Drax uses `user:*`, `role:*`, and `tenant:*` permission families and enforces them in controllers. Registering User/Role/Tenant routes does not grant access. The seeded Admin currently lacks these permissions.

## Migration policy

- Backend authorization is authoritative; frontend route/button checks are discoverability and UX only.
- Every destructive or data-exposing capability needs an explicit permission in its API, route, menu and action control.
- Never infer permission parity from similar names.
- Never preserve an unguarded legacy route for compatibility.
- Test at least allowed, authenticated-denied and unauthenticated cases for each new slice.
