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

RBAC-02 approved scope: migrate only the Docker portion of the legacy product bundles. Admin remains unchanged; no identity administration permissions are added to Sudo or any other role.

| Seeded role | Docker permissions |
|---|---|
| Sudo, Implementaciones, Desarrollo | `DOCKER_VIEW`, `DOCKER_REMOVE`, `DOCKER_LOGS`, `DOCKER_TERMINAL`, `DOCKER_RESTART`, `DOCKER_CREATE`, `DOCKER_UPDATE` |
| Infraestructura, Direccion, PM, QA | `DOCKER_VIEW`, `DOCKER_REMOVE`, `DOCKER_LOGS`, `DOCKER_TERMINAL` |
| Soporte | None: its only legacy grant was `SECURITY_GROUP_SHOW`, not a Docker grant |
| Admin | All currently registered Docker permissions, unchanged |

`DOCKER_CONSOLE` is replaced by `DOCKER_TERMINAL`; the migrated role keeps only the current terminal permission. Existing legacy role names and IDs, including lowercase `admin` and `sudo`, remain unchanged so user references stay valid. ContainerHub separately seeds the current `Admin` and `Sudo` roles. Product bundles do not gain node/network permissions absent from their original seeds. Bootstrap still assigns Admin only when explicitly enabled; this does not import legacy users or reassign existing users.

Evidence: legacy `apps/backend/src/init/custom/roles/init*Role.js` and `init/InitService.js:54`; target `packages/containerhub-back/src/setup/SetupContainerHub.ts`; installed `node_modules/@drax/identity-back/src/schemas/RoleSchema.ts` and `setup/CreateOrUpdateRole.ts`. Normal role writes remain validated by Drax; the startup permission migration writes existing persisted roles through the same repository so legacy lowercase names are not rejected. Sudo/Admin are readonly and refreshed in place; existing editable roles are preserved, including administrator permission changes. This follows the installed legacy guard at `docker-fortes/apps/backend/node_modules/@dracul/user-backend/src/services/InitService.js:209-211` (also present in the [published Dracul 1.46.0 initializer](https://unpkg.com/@dracul/user-backend@1.46.0/lib/services/InitService.js)).

Verification: `packages/containerhub-back/src/setup/__tests__/LegacyDockerRoles.test.ts` runs real setup against temporary SQLite, seeds lowercase `admin`/`sudo` through the repository, checks stable IDs and exact `DOCKER_CONSOLE` → `DOCKER_TERMINAL` replacement over repeated startup, evaluates Drax permissions, exercises the actual health route with JWT/RBAC using Fastify injection (allowed 200, authenticated-denied 403, anonymous 401), and verifies a revoked QA grant stays revoked after restart. A disposable database on the deployed MongoDB engine reproduced the lowercase records and confirmed both migrated without renaming; the Swarm service then started against the shared `containerhub` database and served UI 200 and protected API 401. Existing-user login and browser terminal use remain unverified.

Required decisions before identity administration; LDAP itself is deferred until Drax implements it:

1. Whether the remaining non-Docker legacy grants survive (RBAC-02 remains partial for these).
2. Which Drax `user:*`, `role:*`, `tenant:*` permissions should each receive? None are granted by this slice.
3. Do legacy groups still carry business meaning?
4. Is Drax tenancy part of this product or merely framework capability?
5. How do LDAP groups map after role names/permissions change?

## Domain decisions still required

| Capability | Legacy permission | Current state | Required decision |
|---|---|---|---|
| Task inspect | `DOCKER_VIEW` | Protected redacted REST/page implemented | Authenticated browser rerun remains before DONE |
| Cluster/version | `DOCKER_VIEW` | Aggregate summary and version migrated | Reuses legacy view permission; topology remains CLU-02 |
| Monitoring read | `DOCKER_VIEW` | MON-01 configuration and MON-02 sample-history API/pages enforced | Real collector/database/browser proof remains for MON-02 |
| Monitoring mutations | `DOCKER_MONITORING_CREATE/PAUSE/DELETE` | MON-01 API/buttons enforced; resume uses PAUSE | Registered and granted to Admin; other existing role bundles unchanged |
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
