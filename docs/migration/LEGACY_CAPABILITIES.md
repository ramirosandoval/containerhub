# Legacy capability inventory

## Scope and evidence

- Behavioral source: `~/dockerway/docker-fortes` (read-only).
- Target: `~/dockerway/containerhub`.
- Framework references requested as `drax-scaffold` and `drax-modules` were not present. The repositories found and audited read-only are `~/dockerway/scaffold` and `~/dockerway/modules`.
- This inventory is based on static source tracing. It does not claim live Docker, MongoDB, GitLab, Registry, LDAP, email, multi-node, or browser verification.
- Status is recorded separately in `DOMAIN_MATRIX.tsv` and `MIGRATION_STATUS.tsv`.

## Target architecture established in Phase 0

ContainerHub is an npm-workspace TypeScript application with Fastify/GraphQL Yoga on the backend and Vue 3/Vuetify/Pinia on the frontend. Drax owns identity, RBAC, HTTP clients, common errors, menu/gallery/profile components, CRUD state and ordinary CRUD UI.

For persisted entities, follow `~/dockerway/scaffold/AGENTS.md`: Model, Zod Schema, Interface, Service, Repository and ServiceFactory; database operations stay in repositories and cross-entity communication goes through services. Extend `@drax/crud-back` and `@drax/crud-vue` rather than reproducing their pagination, filtering, controllers, providers or forms. Docker resources are external operational objects, not automatically Mongo entities; use thin domain services when persistence is unnecessary.

Services is the current integration reference, not a template to copy wholesale: its Drax-backed filtering/state plus tailored expandable table is valid, while the 766-line backend service crosses service, task, logs, terminal, network and filesystem boundaries.

## Services

**USER CAPABILITIES**

- List services with name, stack, image, ports and created/updated timestamps.
- Search, filter by stack/image/ports/date, sort and paginate.
- Navigate from a stack into a pre-filtered service list.
- Expand a service to inspect and refresh its tasks; open task logs or a shell.
- Legacy exposes bulk restart/remove with confirmation. Current ContainerHub exposes separate permission-gated restart and removal actions over the same one-or-many selection path, with confirmation and per-service results.
- No audited legacy frontend invokes create/update, although both backend contracts exist.

**BACKEND CAPABILITIES**

- List/find services and tags; create, update, restart, remove and bulk restart/remove.
- Docker operations include `listServices`, `getService().inspect/update/remove`, `createService`, and `ForceUpdate` increment for restart.
- Legacy create/update includes stack default-network handling, aliases, policies, resource limits and durable audit writes. Current create/update uses versioned Docker specs, returns/audits the inspected service, attaches aliases and a labeled stack default network through `TaskTemplate.Networks`, converts legacy health-check seconds to Docker nanoseconds, and maps resource, restart, update and rollback policies.
- Docker is authoritative; service state is not persisted in MongoDB.

**DATA**

- Core summary: ID, name, stack namespace, parsed image, published/target ports and timestamps.
- Legacy detail additionally carries mounts, environment, labels, constraints, resource limits, preferences and command.

**AUTHORIZATION**

- Legacy operations use `DOCKER_VIEW`, `DOCKER_CREATE`, `DOCKER_UPDATE`, `DOCKER_RESTART`, and `DOCKER_REMOVE`; visible bulk controls rely on page-level `DOCKER_VIEW` rather than per-button checks.
- Current REST/GraphQL endpoints enforce operation-specific permissions.

**BEHAVIOR**

- Legacy filtering is mostly client-side over a full stack-filtered list; date ranges are inclusive by day.
- Current filtering is server-side, AND-combined, with case-insensitive substring operators and validated page/filter limits.
- Legacy bulk operations are sequential and fail at the first error. Current restart and removal remain sequential but return each selected service's outcome without aborting the batch.
- Destructive actions require UI confirmation in legacy.

**REAL-TIME BEHAVIOR**

- Manual list/task refresh only; no polling.

**DEPENDENCIES**

- Docker Swarm manager API; Registry/GitLab are catalog dependencies for deployment choices; audit is required for legacy mutation traceability.

**LEGACY IMPLEMENTATION NOTES**

- Legacy GraphQL service update has an inconsistent resolver/service signature; preserve intended behavior, not that contract bug.

**MIGRATION RISKS**

- Create and update mappings have authenticated API, Docker inspect and durable SQLite audit proof.
- Service mutations have durable Drax audit records; removal uses an explicit irreversible-action warning and visible per-service outcomes.

Evidence: `docker-fortes/apps/frontend/src/modules/docker/pages/ServicesPage/`, `docker-fortes/apps/backend/src/modules/docker/services/DockerService.js`, `DockerManageService.js`; target `packages/containerhub-front/src/pages/services/ServicesPage.vue`, `src/cruds/ServiceCrud.ts`, `packages/containerhub-back/src/modules/services/services/ServiceService.ts`.

## Tasks and task inspect

**USER CAPABILITIES**

- Expand services into task rows with state, timestamps, node and container identity.
- Legacy can open a raw Docker task-inspect tree, logs, statistics and terminal.

**BACKEND CAPABILITIES**

- List service tasks and inspect task/container internally.
- Current normalizes task output and exposes a protected task-inspect page/REST endpoint with recursive secret redaction. Repository regressions pass; current authenticated browser proof remains pending.
- No persistence.

**DATA**

- Task/service/node/container IDs, state/message and lifecycle timestamps; legacy inspect exposes unrestricted raw Docker JSON.

**AUTHORIZATION**

- Legacy list/inspect routes use `DOCKER_VIEW`; current list uses `DOCKER_VIEW`, logs `DOCKER_LOGS`, terminal `DOCKER_TERMINAL`.

**BEHAVIOR**

- Current frontend accepts both normalized and raw Docker task casing as a compatibility boundary.
- Raw inspect may expose environment/configuration secrets and needs a redaction decision.

**REAL-TIME BEHAVIOR**

- Task rows refresh manually; logs and terminal are realtime subdomains.

**DEPENDENCIES**

- Services, nodes, Docker tasks/containers.

**MIGRATION RISKS**

- Do not restore raw inspect to broad viewers without deciding permission and redaction.

### Structured field completion

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

Evidence: legacy `DockerTaskService.js`, `ServiceTasks/`, `TaskInspectPage/`; target `ServiceService.ts`, `ServicesPage.vue`, `taskContract.ts`.

## Stacks

**USER CAPABILITIES**

- Read-only stack names and service counts; open Services filtered by stack.

**BACKEND CAPABILITIES**

- Legacy has a derived stack query. Current derives stacks in the frontend from all services.
- No stack persistence or stack deployment workflow.

**DATA**

- `{name, services}` derived from `com.docker.stack.namespace`.

**AUTHORIZATION**

- `DOCKER_VIEW` in both applications.

**BEHAVIOR / REAL-TIME**

- Services without stack labels are omitted. One load on mount, no polling.

**DEPENDENCIES / RISKS**

- Depends only on Services. Full-list derivation is acceptable until measured scale requires an aggregate endpoint.

### Structured field completion

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerStackService.js`, `StacksPage.vue`; target `StacksPage.vue`.

## Nodes

**USER CAPABILITIES**

- Read-only inventory: hostname, IP, role, availability/state, engine, leader/reachability and resources.
- Current and legacy show node-agent health; node/task cluster expansion remains legacy-only.

**BACKEND CAPABILITIES**

- Current provides normalized `listNodes` and contacts the mTLS node agent when configured; legacy also finds nodes, resolves hostname/ID and aggregates node tasks.
- No persistence or node mutation.

**AUTHORIZATION**

- Legacy UI/GraphQL uses `DOCKER_VIEW`; legacy REST and current use `DOCKER_NODES_FETCH`.

**BEHAVIOR / REAL-TIME**

- Current and legacy agent health are sampled once. Legacy cluster data optionally polls.

**DEPENDENCIES / RISKS**

- Inventory uses the manager Docker API. Agent health now has a deployable mTLS path, but only local single-node proof exists.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerNodeService.js`, `DockerAgent.js`, `NodesPage/`; target `NodesPage.vue`, `ServiceService.ts`.

## Networks

**USER CAPABILITIES**

- List name, creation time, driver, attachable and IPAM fields.
- Legacy has manual refresh and client filters for name, attachable, driver, dates and subnet.
- Neither audited frontend exposes create/update/delete.

**BACKEND CAPABILITIES**

- List, inspect, create, destructive replace-as-update, remove and get-or-create.
- Legacy writes audit records and labels auto-created stack networks; current does neither.

**DATA**

- Raw Docker network model; UI reads first IPAM config.

**AUTHORIZATION**

- Current uses `DOCKER_NETWORK_VIEW/CREATE/UPDATE/REMOVE`. Legacy GraphQL uses `DOCKER_VIEW`; legacy REST delete has no route-local guard, a defect not to preserve.

**BEHAVIOR / REAL-TIME**

- Update removes then recreates with no rollback. Manual refresh only.

**DEPENDENCIES / RISKS**

- Docker manager API. Replace-as-update risks permanent deletion and must not be exposed casually.

### Structured field completion

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerNetworksService.js`, `DockerNetworkRoutes.js`, `NetworksPage/`; target `NetworksPage.vue`, `ServiceRoutes.ts`, `ServiceService.ts`.

## Containers and ghost detection

**USER CAPABILITIES**

- Ghost-container table with created/image/status/container/node fields.
- Legacy has no active delete control.
- Legacy container statistics page provides CPU, memory, block-I/O and network charts.

**BACKEND CAPABILITIES**

- Legacy scans every node through agents and marks no-label or non-running-task containers as ghosts.
- Current endpoint scans running containers on the backend daemon and remote nodes through mTLS agents. It excludes a container only when its Swarm task exists, is running and owns that container ID; no-label, missing-task and stale-task containers are returned with the scanned node ID. Remote scan failure returns `503`, never a partial list.
- Legacy also provides normalized service-filtered containers; current does not.

**AUTHORIZATION**

- Legacy UI/GraphQL and current use `DOCKER_VIEW`; legacy ghost REST endpoint is unguarded.

**BEHAVIOR / REAL-TIME**

- Ghost scan is one-shot. Statistics poll at selected intervals.

**DEPENDENCIES / RISKS**

- Cluster-wide collection is implemented but remains PARTIAL until second-worker API/browser proof. Current real mTLS/Docker evidence covers one daemon; the endpoint remains read-only.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `GhostContainers.js`, `DockerContainerService.js`, `GhostContainersMonitorizationPage/`; target `GhostContainersPage.vue`, `ServiceService.ts`.

## Docker version and cluster information

**USER CAPABILITIES**

- Docker engine/API version card, now available in ContainerHub through a protected read-only page.
- Node/service/task totals, now available in ContainerHub at `/cluster`.
- Expandable node/task topology with resource/label display, running-only filter and optional refresh.

**BACKEND CAPABILITIES**

- Both applications use `docker.version()` for engine/API version and unfiltered list counts for cluster totals. ContainerHub issues the three count reads in parallel; node-by-node task aggregation remains legacy-only.
- No persistence.

**AUTHORIZATION**

- Docker version and aggregate cluster information use `DOCKER_VIEW` in both applications, including the ContainerHub route/menu and REST boundary.

**BEHAVIOR / REAL-TIME**

- Both totals include every task returned by the unfiltered Docker list, including retained historical tasks, not only running tasks. Totals load once; ContainerHub labels this explicitly and shows a retryable error instead of fabricated zeros after a failed read. Legacy topology can poll every 5–60 seconds; CLU-02 remains a product decision.

**DEPENDENCIES / RISKS**

- Manager Docker API. CLU-01 preserves the original unfiltered task semantics; changing to active-only would be a separate product change. The three reads are not an atomic snapshot; counts can reflect concurrent cluster changes. No worker agent or N+1 topology scan is used for totals.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerManageService.js`, `DockerNodeService.js`, `ClusterInformationPage/`, `DockerVersionPage/`.

ContainerHub Docker-version evidence: `ServiceService.ts`, `ServiceRoutes.ts`, `DockerVersionPage.vue`, route/menu entries, focused contract tests and live authenticated Docker/Chromium proof.

ContainerHub CLU-01 evidence: `fetchClusterSummary`, `GET /api/docker/cluster`, `ClusterInformationPage.vue`, localized route/menu and `ClusterSummary.test.ts`. Repository: RED (missing route) to GREEN, permission/retained-history/empty/failure checks, backend/frontend builds and Swagger smoke passed. Ad hoc API/UI: real Drax login with isolated temporary SQLite identity, compiled production server factory, loopback Vite proxy and real Docker agreed on 2 nodes / 3 services / 16 tasks; unauthenticated API returned 401. Chromium displayed the same counts and historical-task hint; a simulated 503 displayed an error without zeros and retry recovered through the real API. No development credentials/database or Docker resources were changed. This proves aggregate manager reads, not CLU-02 topology or worker-agent operations.

## Task and service logs

**USER CAPABILITIES**

- Terminal-style task logs, tail size, since presets, timestamps, include/exclude groups, pause and reconnect.

**BACKEND CAPABILITIES**

- Snapshot and follow streams. Current correctly decodes multiplexed Docker frames and authenticates task REST/WebSocket contracts.
- Current stack/service `fetchLogs` selects the first normalized running task and retrieves logs by its normalized `id`.
- Logs are not persisted.

**AUTHORIZATION**

- Legacy traced routes mostly use `DOCKER_VIEW`; legacy WebSocket is unguarded despite a declared `DOCKER_LOGS` permission. Current consistently requires `DOCKER_LOGS`.

**BEHAVIOR / REAL-TIME**

- Exclusions win; include groups are AND with comma-separated OR terms. Filter changes clear and reconnect.
- Legacy limit is editable (`maxLogsLines`, default 10,000); current ceiling is 2,000.
- Stream ends on Docker end/error or socket teardown; no automatic reconnect after unexpected failure.

**DEPENDENCIES / RISKS**

- Docker logs, WebSocket, xterm. Service-level selection is fixed; decide whether the log ceiling remains configurable.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `LogVisualizer/`, `LogWebSocketService.js`, `DockerLogsRoutes.js`; target `TaskLogsPage.vue`, `ServiceRoutes.ts`, `ServiceService.ts`.

## Web terminal

**USER CAPABILITIES**

- Open `sh` or `bash` in a running task container; current adds resize, robust binary input and bounded sessions.

**BACKEND CAPABILITIES**

- Legacy proxies browser WebSocket traffic through a per-node agent.
- Current issues a hashed, user/task/shell-bound, single-use 60-second ticket, validates origin, then selects local Docker exec or the task node's binary mTLS agent relay; it limits frame/buffer sizes and session lifetime.
- Terminal content is not persisted.

**AUTHORIZATION**

- Legacy UI uses `DOCKER_VIEW`; legacy socket does not enforce auth or `DOCKER_CONSOLE`. Current requires `DOCKER_TERMINAL` before ticket creation.

**BEHAVIOR / REAL-TIME**

- Full-duplex WebSocket. Current tears down on malformed controls, backpressure, timeout or close.

**DEPENDENCIES / RISKS**

- Current remote exec uses the task's authoritative node and verifies running-container/task/node labels at the agent; real multi-worker parity is unproven. In-memory tickets assume one backend process.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `AgentWsService.js`, `AgentWsManager.js`, `WebTerminal/`; target `TerminalRoutes.ts`, `TerminalSessionService.ts`, `TaskTerminalPage.vue`.

## On-demand service/container statistics

**USER CAPABILITIES**

- Legacy charts CPU, memory, block-I/O and networks, with 5–60 second polling and local warning thresholds/toggles.

**BACKEND CAPABILITIES**

- Legacy uses node agents and returns derived metrics. Current task/service stats select direct local `container.stats({stream:false})` or the task node's mTLS agent, retaining raw `stats` and adding normalized `metrics` (CPU, total memory, cumulative disk/network bytes); a remote failure returns 503 without local fallback.
- No persistence; historical data is a separate monitoring domain.

**AUTHORIZATION**

- Legacy GraphQL/service stats and current use `DOCKER_VIEW`; legacy task-stat REST route is unguarded.

**BEHAVIOR / REAL-TIME**

- Legacy polls after each completed request. Current provides one-shot task/service endpoints plus a task page with selectable 5–60-second polling, teardown, charts and local thresholds.

**DEPENDENCIES / RISKS**

- The normalized DTO and STAT-02 chart page are implemented and covered by repository checks. Authenticated API/Chromium proof returned the exact container stats and rendered four charts for a task pinned to `debianvm`. One remote failure can still reject current service-wide stats.

### Structured field completion

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerStatsService.js`, `ContainerStatisticsPage/`; target `ServiceService.ts`, `ServiceRoutes.ts`.

## Monitoring configuration and historical statistics

**TARGET STATUS:** MON-01 configuration creation/list/search/order/pagination and confirmed pause/resume/delete is migrated to `/monitoring` and `/api/monitoring-configurations`, using Drax persistence for Mongo/SQLite and Drax table state. MON-02 now implements a non-overlapping collector, normalized persisted samples, bounded retention, replacement-task discovery, protected date-range history and `/monitoring/:id/history` charts. Repository regressions/builds pass; real Docker/database/browser and distinct-worker proof remains pending. See API_CONTRACTS.md and MIGRATION_ORDER.md.

**USER CAPABILITIES**

- List/filter/paginate monitoring configurations; select service, interval, replica/all replicas and calendar/permanent mode; pause/resume/delete; inspect historical charts by task/date.

**BACKEND CAPABILITIES**

- Mongo-persisted configurations; separate worker scans every configured interval, starts Socket.IO agent sessions and stores raw statistics.

**DATA**

- Configuration snapshot, type/status, interval/mode, since/until/holding time; raw per-task samples with service/node IDs and timestamps.

**AUTHORIZATION**

- Reads use `DOCKER_VIEW`; create/pause/delete use `DOCKER_MONITORING_CREATE/PAUSE/DELETE`. Agent connections are not authenticated in traced code.

**BEHAVIOR / REAL-TIME**

- Duplicate service configurations are skipped. `replic` selects one initially discovered task; `global` selects all initially discovered tasks. Worker scan defaults to 10 seconds; collection 15–60 seconds.
- Date filters are accepted but ignored by history retrieval. Retention is stored but no deletion job was found. Replacement tasks are not discovered until reprocessing.

**DEPENDENCIES / RISKS**

- MongoDB, worker process, Socket.IO agent and Docker topology. Largest persistence/topology commitment; retention, task replacement, granularity and orphan ownership require product decisions.

### Structured field completion

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `MonitoringServiceConfigurationService.js`, `modules/monitorization/`, `MonitoringServicesPage/`, `MonitoringServiceInspectPage/`.

## Task lifecycle monitoring

**USER CAPABILITIES**

- Newest-first running/removed transition table with task/service/node/time and heuristic audit-user correlation.

**BACKEND CAPABILITIES**

- In-process polling manager persists unseen running tasks and records `removed` when they disappear from the running set.

**DATA**

- Bounded Mongo history, default 1,000 records; polling defaults to 60 seconds.

**AUTHORIZATION**

- Legacy query/page uses `DOCKER_VIEW`.

**BEHAVIOR / REAL-TIME**

- Records only running/absent snapshots, not the complete Docker lifecycle. UI does not poll.

**DEPENDENCIES / RISKS**

- Docker manager, Mongo, settings and audit. Decide whether this is an event log, audit feature or obsolete approximation before migrating it.

### Structured field completion

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `TaskMonitorization/`, `TasksMonitorizationPage/`, `initSettings.js`.

## Node agent

**USER CAPABILITIES / BACKEND CAPABILITIES**

- Agent health, node container enumeration, remote stats, terminal relay, monitoring streams and all-node folder provisioning.
- Discovery assumes one global `dockerway_incatainer-agent` task per node, HTTP 9997, monitorization 9996 and plain WebSocket.
- Current implements Docker-backed health and running-container inventory in a global `containerhub-agent` image. Ghost collection reuses this inventory transport. Backend-to-agent HTTPS requires mutual TLS and validates the returned Swarm node ID.

**DATA / AUTHORIZATION**

- Legacy connection routing is in memory and has no traced credentials or TLS. Current health uses CA-validated server and client certificates; user-facing node access remains protected by `DOCKER_NODES_FETCH`.

**BEHAVIOR / REAL-TIME**

- `NODE_MODE=localhost` bypasses Swarm DNS. Terminal uses WebSocket, monitoring Socket.IO, health/stats HTTP.

**DEPENDENCIES / RISKS**

- The target selected a narrowly authenticated per-node agent. Ghost routing uses whole-scan failure on unreachable workers; stats and binary terminal now route to the task node through mTLS. Real Docker evidence remains single-daemon only. Certificate/secret provisioning and second-worker API/browser proof remain deployment scope. All-node host provisioning is still pending.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerAgent.js`, `AgentWsManager.js`, monitorization managers and compose files; target `packages/containerhub-agent/`, `AgentHealthClient.ts`, `NodesPage.vue`.

## Host folder/file provisioning

**USER CAPABILITIES / BACKEND CAPABILITIES**

- Legacy fans folder creation to all node agents and writes arbitrary backend-host files. Current retains REST endpoints but confines and awaits writes below `DOCKER_DATA_PATH`.

**DATA / AUTHORIZATION**

- Durable filesystem side effects, no database. Both user-facing endpoints require `DOCKER_UPDATE`; legacy agent calls are unauthenticated.

**BEHAVIOR / REAL-TIME**

- Existing files are overwritten. Legacy may respond before writes complete and accepts arbitrary absolute paths; current accepts empty content and blocks traversal.

**DEPENDENCIES / RISKS**

- Current safer local-only semantics must not be weakened. Add authenticated per-node provisioning only if shared bind mounts require it.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `DockerFolderCreator.js`, `DockerFilesRoutes.js`; target `ServiceService.ts`, `ServiceRoutes.ts`.

## Identity and authentication

**USER CAPABILITIES**

- Login/logout, profile, own-password change, avatar, registration, activation and recovery.
- Current exposes login/logout/profile display only; Drax supplies most omitted routes/forms but they are not registered in ContainerHub.

**BACKEND CAPABILITIES / DATA**

- Drax replaces login, `me`, password/recovery/registration, verification, avatar and tenant switching; ContainerHub still exposes/configures only part of those flows.
- Legacy adds LDAP fallback and persisted refresh tokens. LDAP is deferred until Drax provides native support. Existing local-user and refresh-token compatibility remain separate proof items.

**AUTHORIZATION / BEHAVIOR**

- Current route guard checks JWT plus exact permission. Legacy can authenticate LDAP then local bcrypt; current is local bcrypt and access-token only.

**DEPENDENCIES / RISKS**

- Drax identity is the architectural replacement. Do not add a parallel LDAP adapter: wait for native Drax support. Existing local-user login, refresh-token compatibility, email activation and schema/data migration still require their own runtime tests.

### Structured field completion

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `@dracul/user-*`, app initialization; target `YogaFastifyServerFactory.ts`, `@drax/identity-*`, `LoginPage.vue`.

## Users, roles, groups, permissions and tenants

**USER/BACKEND CAPABILITIES**

- Legacy administers users, roles and groups and seeds eight product role bundles.
- Current registers User/Role/Tenant APIs but no management pages; Drax has no complete Group feature.

**DATA / AUTHORIZATION**

- Permission names changed from legacy `SECURITY_*` to Drax `user:*`, `role:*`, `tenant:*`. Current seeded Admin receives only Docker permissions.

**DEPENDENCIES / RISKS**

- Drax replaces users/roles/tenants infrastructure. Legacy role policy and group meaning are product behavior, not framework plumbing. Tenancy is new, not automatic parity.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `apps/backend/src/init/custom/roles/`, Dracul user packages; target `SetupContainerHub.ts`, Drax identity routes.

## Audit and security diagnostics

**USER/BACKEND CAPABILITIES**

- Durable operational audit list/filter and session/login-failure dashboards.
- Legacy Docker and network mutations write audits. Current Drax emits some in-process identity events and records login/session data, but ContainerHub registers no audit sink or dashboard routes.

**DATA / AUTHORIZATION**

- Audit records include actor, action, entity, details, changed fields, resource snapshot/name and timestamps; read requires `AUDIT_SHOW`.

**DEPENDENCIES / RISKS**

- No current Drax audit package is installed. Retirement without preserving mutation history may be a compliance/operations regression.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `@dracul/audit-*`, Docker mutation services; target Drax identity controllers and server registration.

## Settings

**USER/BACKEND CAPABILITIES**

- Generic categorized settings editor/cache/API.
- Product settings control log limits and task monitor retention/interval; registry purge settings have no found consumer.

**AUTHORIZATION / DEPENDENCIES**

- `SETTINGS_SHOW` and `SETTINGS_UPDATE`; legacy Dracul settings. No current equivalent installed.

**RISKS**

- Do not recreate a generic settings platform. Decide the few operational values that remain editable; monitoring values move only with monitoring. Registry purge settings are obsolete or a product decision.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `initSettings.js`, Dracul settings package.

## Customization and shell

**USER/BACKEND CAPABILITIES**

- Persisted branding, logo/title mode, palettes and selected language.
- Current has Drax sidebar/gallery/profile, local theme toggle and static product title/locale; no customization persistence/API.

**AUTHORIZATION / DEPENDENCIES**

- Legacy customization read is public; writes have granular permissions. Drax replaces shell components, not the branding product.

**RISKS**

- Keep static shell unless customer-managed branding/language is confirmed.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy customization package/init; target `App.vue`, `HomePage.vue`, locales/plugins.

## GitLab

**CAPABILITIES**

- Paginated project list and lazy project tags through GitLab API v4. No persistence or realtime behavior.

**AUTHORIZATION**

- Legacy GraphQL requires authentication and REST is unguarded; current requires `DOCKER_VIEW`.

**RISKS**

- Behavior is migrated with stricter authorization. Confirm whether a dedicated integration permission is desired.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `modules/gitlab/`; target `modules/gitlab/`, `GitLabProjectsPage.vue`.

## Docker Registry

**CAPABILITIES**

- Registry v2 catalog and lazy tag lookup. No persistence or realtime behavior.

**AUTHORIZATION**

- Legacy GraphQL requires authentication and REST is unguarded; current requires `DOCKER_VIEW`.

**RISKS**

- Basic read-only behavior is migrated. Registry authentication/TLS customization and purge policy are not.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy `modules/registry/`; target `modules/registry/`, `RegistryImagesPage.vue`.

## LDAP, email, media and uploads

**CAPABILITIES**

- LDAP login/group-to-role mapping, mail-backed registration/recovery/activation, avatars and branding uploads, static media/export routes.
- Drax supplies email/avatar service primitives, but ContainerHub does not configure SMTP, multipart, base/file/avatar paths or related frontend routes.
- LDAP remains pending upstream until Drax implements it; it is not part of the next ContainerHub slice.

**AUTHORIZATION / RISKS**

- Upload operations are authenticated/granular in legacy. Do not enable registration or avatar flows until runtime prerequisites and role migration are defined. Do not add generic media modules without a surviving product use.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy Dracul user/customize initialization; target Drax identity/email dependencies and ContainerHub server/config.

## App diagnostics and API documentation

**CAPABILITIES**

- Legacy public status/ping plus timeout/error demo pages. Current has protected service health, generated OpenAPI at `/documentation`, and Fastify logging.

**AUTHORIZATION / RISKS**

- Legacy status is public; current health requires `DOCKER_VIEW`. Demo/error pages are obsolete unless explicitly retained. Deployment may still require a public liveness probe.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy base module; target `YogaFastifyServerFactory.ts`, `ServiceRoutes.ts`.

## Configuration and bootstrap

**CAPABILITIES**

- Startup config, Mongo connection, permissions, roles, root, LDAP settings, settings and customization initialization.
- Current delegates config/DB/identity helpers to Drax, maintains the Admin role, and creates an initial privileged user only through explicit environment opt-in.
- ContainerHub now uses the current Drax environment names directly and rejects startup before connection/bootstrap when the DB engine, engine-specific DB value, or JWT secret is absent.
- Bootstrap defaults to disabled. When enabled, Drax-required name, username, password, email and phone values are mandatory; `CreateUserIfNotExist` leaves an existing username and password unchanged.

**RISKS**

- Operators must disable bootstrap and remove its credentials after initial creation; changing the enabled bootstrap username would create another privileged user.
- Admin has Docker permissions only and cannot necessarily administer Drax identity.
- Startup against the shared Mongo collection is verified, and a disposable database on the same MongoDB engine verified lowercase `admin`/`sudo` migration with stable IDs and only `DOCKER_TERMINAL`. Existing-user login and browser terminal use remain unverified.

### Structured field completion

**USER CAPABILITIES**

- No additional user-facing capability was found beyond the domain discussion above.

**BACKEND CAPABILITIES**

- No additional backend operation was found beyond the domain discussion above.

**DATA**

- No separate persisted model exists beyond the Docker, integration, identity, or filesystem data described above.

**AUTHORIZATION**

- No additional authorization rule was found beyond the checks described above; no permission is inferred.

**BEHAVIOR**

- The behavior-relevant rules are the ones described in this domain section.

**REAL-TIME BEHAVIOR**

- No additional stream, poll, timer, or push behavior was found beyond the cadence described above.

**DEPENDENCIES**

- No additional dependency was found beyond the systems described above.

**LEGACY IMPLEMENTATION NOTES**

- No additional legacy implementation detail is required to preserve this domain behavior.

**MIGRATION RISKS**

- The migration risks and product decisions are the ones described in this domain section.

Evidence: legacy initialization and compose/env examples; target `SetupContainerHub.ts`, backend `.env.example`, README, Drax config sources.
