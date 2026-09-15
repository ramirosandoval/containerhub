# Dependency-aware migration order

## Principles

Each item is a vertical slice: backend behavior → API contract → permission → frontend/navigation → tests/live proof → IR update. A domain is not complete from compilation or a rendered fixture alone.

**Product policy:** LOG, RBAC, NET, CLU, SET, CUST and DIAG preserve the legacy product behavior. A legacy capability is not deferred for a new product decision; only its safe Drax/Fastify implementation remains to be completed. The legacy absence of a network-mutation UI is also preserved.

## Order

### 0. Stabilize the existing foundation

1. Correct and document Drax environment names and fail startup safely when required DB/JWT configuration is absent.
2. Replace hardcoded bootstrap credentials with explicit environment/bootstrap behavior.
3. Decide and seed identity-management permissions/legacy role policy before exposing Drax administration.
4. Fix direct dependency/runtime packaging issues for GraphQL or explicitly retire the compatibility surface.
5. Restore real runtime validation at trust boundaries rather than relying on OpenAPI-only schemas.

Why first: every later API/auth test depends on a real database/JWT/bootstrap configuration and trustworthy validation.

### 1. Restore essential Services operations

1. Add selection to the existing Services table; the same control must support one or many selected services.
2. Expose **restart selected** through the existing backend command with `DOCKER_RESTART`, confirmation, visible per-service result/error and refresh. One selected service is the singular case; do not add a second action path.
3. Define and add the minimum durable audit record for service mutations before exposing removal.
4. Expose **remove selected** separately through the existing backend command with `DOCKER_REMOVE`, stronger destructive confirmation, visible per-service result/error and refresh.
5. Leave service create/update for a later slice because its legacy policies, default networks and input contract remain unproven.

Why first: restart/remove are fundamental existing backend capabilities with no usable frontend path. Swarm service update/remove goes through the manager, so this work does not depend on direct execution against remote-worker containers.

### 2. Repair already-exposed incorrect behavior

1. **Service-level logs correctness:** fix normalized task selection, preserve `DOCKER_LOGS`, endpoint tests and live running-task proof.
2. **Ghost containers correctness:** define and implement healthy-vs-orphan task reconciliation, verify healthy/orphan fixtures, keep read-only.

Why now: these routes/pages already claim capabilities they do not correctly provide. Fixing existing claims is smaller and safer than adding features.

### 3. Complete low-risk read-only foundations

1. Networks filters, date formatting and manual refresh using existing data; no mutation UI.
2. Node resource columns using fields already returned.
3. Docker version endpoint/card if product confirms it remains useful.
4. Task inspect only after permission/redaction decision.

Why: small independently verifiable slices with no persistence or new transport.

### 4. Complete operational audit before other destructive UI

1. Extend the minimum service-mutation audit contract only when another accepted command requires it.
2. Decide required retention/data compatibility before broader audit dashboards.
3. Preserve the legacy absence of a network-mutation UI. Restore audit and stack-label semantics for the existing backend mutations; do not add a new UI.

Why: removal and later network mutations must not weaken legacy operational traceability; restart can ship first with permission, confirmation and visible results.

### 5. Prove multi-node topology once

Deploy/identify one task on a worker different from the backend daemon and verify terminal, task stats, ghost scan and provisioning. Choose exactly one architecture:

- narrowly authenticated per-node agent;
- secured Docker remote API/context strategy; or
- explicit single-node-only product scope.

Do not implement separate transports per feature.

This topology work covers operations tied to a container on a specific worker, such as terminal exec, task stats, ghost reconciliation and host provisioning. It is not a prerequisite for manager-level service restart/remove.

Current partial result: the narrowly authenticated per-node-agent option was
selected. A global agent image exposes Docker-backed health over mandatory
mTLS, and the backend/UI report healthy, unavailable or unconfigured state per
node. Unit/build checks, the built image and a real two-node deployment now pass.
The global DNSRR service ran on the manager and `debianvm` without public ports;
both agent addresses accepted the client certificate and rejected requests without
one. Authenticated Chromium displayed the remote orphan while excluding its healthy
Swarm task, rendered live stats for the task pinned to `debianvm`, and executed a
terminal marker using physical keyboard events. NODE-03, GHOST-03, TERM-02,
STAT-01, STAT-02 and AGENT-01 are DONE. All-node provisioning remains FS-02.

Remote verification used the repository image, existing Swarm network/secrets, an
isolated SQLite backend and temporary task/orphan fixtures. Across serial executions,
four browser scenarios passed: Nodes, remote ghost reconciliation, remote stats/charts and remote
terminal input/output. A separate standard-library TLS probe reached both agent
addresses and proved mandatory client certificates. All temporary services,
containers, images, test files, credentials and the frontend server were removed;
the existing network, secrets and PKI were preserved.

**Next selected implementation slice:** RBAC-03 users/roles administration. First
prove ID-05 with one pre-existing local user against the shared Mongo database;
then add only the exact Drax grants and operational UI needed to administer users
and roles. LDAP remains deferred until Drax implements it.

### 6. Statistics and cluster views

1. The normalized task-stat DTO and distinct-worker behavior are proven through STAT-01.
2. STAT-02 is complete with selectable 5–60-second polling, teardown, four CPU/memory/disk/network charts and authenticated Chromium proof.
3. Add service aggregation only after partial failure semantics are defined.
4. CLU-01 completed: protected cluster summary preserves unfiltered retained-task counts, with repository and real authenticated API/Chromium proof.
5. Restore the legacy node/task visualizer and its selectable 5–60-second polling after the shared topology transport is proven.

### 7. Identity and RBAC parity

After role policy and runtime configuration:

1. Expose the legacy user/role administration behavior using Drax routes/pages and map the exact legacy grants.
2. Migrate legacy groups and their authorization semantics; do not introduce Drax tenancy beyond legacy behavior.
3. Configure and verify password/profile/avatar flows.
4. Migrate legacy email-backed registration, activation and recovery with working SMTP/base URLs; correct legacy defects.
5. LDAP is deferred until Drax provides native LDAP support. ContainerHub will not add a parallel LDAP adapter. Separately, prove that a pre-existing local user can authenticate through the shared Mongo database and assess legacy refresh-token compatibility without coupling either result to LDAP.

### 8. Historical monitoring

1. MON-01 approved and implemented: persisted configuration using Drax Model/Schema/Repository/Service/Factory, creation/list and confirmed pause/resume/delete. Calendar/permanent and replica scope are stored options, not collection execution.
2. MON-02 is implemented in the working tree: normalized sample collection, bounded date-range history, retention deletion, replacement-task discovery and history charts.
3. MON-02 remains proof-pending until collection/history/retention run against real Docker plus the configured database/browser, including a task on the distinct worker.

MON-01 verification: focused SQLite/Fastify lifecycle regression; backend/frontend builds; authenticated Chromium against a built frontend and isolated real backend/SQLite with three real Docker services, creation of two configurations, pause, reload, resume and deletion; anonymous 401 and read-only mutation 403. Separate isolated MongoDB probe passed concurrent duplicate creation, search, pause/resume and delete. These runs do not prove monitoring samples, retention or remote-worker execution. Development-module loading encountered Chromium `ERR_NETWORK_CHANGED`; the isolated production-bundle browser run completed with zero page errors. Temporary verification servers/databases/container/scripts were removed.

Current repository verification (2026-09-14, Node 22): full Bash backend discovery executes 80 tests (79 pass, 1 opt-in live-terminal skip); frontend executes 23 passing tests; agent executes 6 passing tests; backend, frontend and agent builds pass. The module-mocks flag is required by existing backend suites. These checks are repository evidence, not current remote-worker or authenticated browser proof.

### 9. Task lifecycle history, settings and customization

- Task lifecycle: preserve the legacy bounded running/removed polling history distinct from current Docker state/audit, correcting legacy defects; do not expand it into a new event system.
- Settings: restore legacy settings and every legacy consumer; do not add settings that did not exist.
- Customization: restore editable legacy branding, logo, palette and language behavior.
- Restore the public legacy liveness contract. Legacy diagnostics/error demos remain obsolete.

## Completed vertical slice: CFG-01

**Drax environment contract.**

Evidence:

1. Runtime, `.env.example`, README and Playwright backend startup use the current Drax names: `DRAX_DB_ENGINE`, its engine-specific DB value, `DRAX_JWT_SECRET` and `DRAX_PORT`.
2. Startup validation rejects a missing/unsupported DB engine, a missing Mongo URI or SQLite file, and a missing/blank JWT secret before connection or bootstrap work.
3. Focused tests cover valid MongoDB/SQLite contracts and every mandatory-value failure; compiled-process checks confirm missing DB/JWT configuration exits nonzero.
4. `DRAX_JWT_SECRET` has no source-controlled fallback value.
5. `MIGRATION_STATUS.tsv` records CFG-01 as DONE; root bootstrap policy and request validation remain separate CFG-02/CFG-03 slices.

## Completed vertical slice: LOG-02

**Service-level logs correctness.**

Evidence:

1. A failing test reproduced normalized task selection returning no logs.
2. `fetchLogs()` now consumes normalized `state` and `id` at the shared service boundary; no endpoint or abstraction was added.
3. Endpoint tests cover unauthenticated, denied and `DOCKER_LOGS` allowed requests.
4. A live route request selected a running Docker task and returned its log snapshot.
5. `MIGRATION_STATUS.tsv` records LOG-02 as DONE; UI proof remains separate because no current UI consumes stack/service logs.

## Completed vertical slice: CFG-02

**Secure root bootstrap.**

Evidence:

1. Initial privileged-user creation now requires the explicit `CONTAINERHUB_BOOTSTRAP_ENABLED=true` opt-in; omission defaults safely to disabled.
2. Name, username, password, email and phone are required only while enabled, with no source-controlled credential or password fallback.
3. Startup validation rejects missing values before database connection, while disabled bootstrap requires none of them.
4. A real temporary SQLite test verifies Drax `CreateUserIfNotExist` returns an existing username without replacing its password.
5. `.env.example` and README document disabling bootstrap and removing credentials after first creation; CFG-03 validation remains untouched.

## Completed vertical slice: SVC-04

**Single/multiple Services selection and restart.**

Evidence:

1. The existing Vuetify server table now uses native row selection and one restart action for both one and many selected services.
2. The action is visible only with `DOCKER_RESTART`, requires confirmation, sends every case through `POST /api/docker/service/restart`, and refreshes the list.
3. The bulk service preserves sequential Docker updates while returning success, warnings or error for every selected service instead of aborting at the first failure.
4. Focused route tests cover one selected service plus allowed, denied and unauthenticated access; a mixed-result test covers success, warnings and failure.
5. A live Chromium run selected and restarted one and then two temporary Swarm services, asserted the authenticated API responses and visible per-service results, and removed the fixtures afterward.

## Completed vertical slice: AUD-01

**Durable service mutation audit.**

Evidence:

1. CREATE, UPDATE, RESTART and DELETE now write through the installed Drax audit service after the Docker mutation succeeds.
2. REST and GraphQL mutation callers supply the authenticated actor plus IP, user agent, session and request ID; failed restart attempts do not create success records.
3. A focused test reads the audit back from a real temporary SQLite database.
4. A live authenticated REST request restarted a temporary Swarm service and the corresponding `RESTART` record was read from the temporary database; all fixtures were removed.
5. No audit page, dashboard, retention policy or network mutation audit was added.

## Completed vertical slice: SVC-05

**Single/multiple Services removal.**

Evidence:

1. The existing Services selection now appears for `DOCKER_RESTART` or `DOCKER_REMOVE`, while the destructive action itself is visible only with `DOCKER_REMOVE`.
2. One removal path handles one or many selected services, names them in an irreversible-action confirmation and refreshes the list after completion.
3. The bulk backend preserves sequential removal while returning success or error for every selected service instead of aborting at the first failure.
4. Focused route tests cover one selected service plus allowed, denied and unauthenticated access; a mixed-result test proves the batch continues after failure and audits only successful removals.
5. A live Chromium run removed one and then two temporary Swarm services through the authenticated API, showed every result, refreshed the rows and persisted three `DELETE` audit records in SQLite.

## Completed vertical slice: GHOST-02

**Local ghost-container detection semantics.**

Evidence:

1. The endpoint now scans only running containers on the backend Docker daemon rather than returning every local service-labeled container.
2. A container is healthy only when its Swarm task exists, is running and references that container ID; no-label, missing-task and stale-task containers remain visible with their node ID.
3. Focused tests cover the reconciler and protected `DOCKER_VIEW` route after reproducing the previous healthy-container false positive.
4. A live authenticated API request and Chromium page showed a running standalone orphan and excluded a healthy temporary Swarm service; fixtures were removed afterward.
5. Cluster-wide collection is `GHOST-03 DONE`: authenticated Chromium showed a real orphan from `debianvm` and excluded the healthy remote Swarm task through the shared mTLS agent. No destructive control was added.

## Completed vertical slice: NET-02

**Read-only network filters, formatting and refresh.**

Evidence:

1. The Networks page filters the complete response locally by name, attachable state, driver, inclusive creation dates and first IPv4 IPAM subnet, with explicit apply/reset controls.
2. Creation timestamps use the installed Drax `formatDateTime`; date fields use native date inputs and driver options come from the current response.
3. One fetch path handles initial load and manual refresh through the existing protected endpoint; no backend, mutation or polling path was added.
4. Focused tests cover combined filters and the explicit page controls after reproducing the missing behavior.
5. A live authenticated API request returned two temporary Docker networks; Chromium displayed formatted dates, issued a refresh request, applied all five filters and restored the excluded network after reset. Fixtures were removed afterward.

## Completed vertical slice: NODE-02

**Read-only node resource display.**

Evidence:

1. The Nodes table now renders the existing normalized `resources` response as CPU and GB, matching the original cluster view's conversion.
2. Missing resource data renders as an em dash; the computed column is not offered as sortable over an object value.
3. A focused test reproduced the absent resource column and covers the original CPU/memory conversion.
4. A live authenticated API request returned one Docker node with `NanoCPUs` and `MemoryBytes`; Chromium displayed the corresponding resource value in that node's table row.
5. No backend, polling, mutation, topology or node-agent path was added.

## Completed vertical slice: CFG-03

**Runtime request validation.**

Evidence:

1. The shared Fastify server no longer accepts every request through a constant validator result.
2. Its Ajv 2020-12 compiler accepts the schemas generated by current Drax while preserving Fastify query coercion and format validation.
3. Focused RED→GREEN tests reject an out-of-range query before its handler and preserve a valid integer query represented in the URL as text.
4. The complete source test suite and backend build pass; a live loopback HTTP request with an invalid Drax login body returns `400` before authentication service work.
5. No route-local validator, frontend change or product capability was added.

## Completed vertical slice: SVC-06 create and update

**Dockerode create/update response and legacy service-spec contract.**

Evidence:

1. A real Docker probe reproduced that Dockerode returns the created service handle with lowercase `id`, while ContainerHub attempted to inspect uppercase `ID`.
2. `createService()` now inspects that returned ID, returns the normalized created service and records the successful `CREATE` audit.
3. A focused RED→GREEN test protects the Dockerode response shape.
4. A live authenticated HTTP request returned `200` with the same service ID reported by Docker inspect; temporary SQLite contained the matching `CREATE` audit and the Docker fixture was removed.
5. Focused RED→GREEN checks place requested aliases and the stack default alias under `TaskTemplate.Networks`, auto-create missing overlay networks, and convert legacy health-check seconds to Docker nanoseconds.
6. A live authenticated create request returned `200`; Docker inspect confirmed requested/default aliases, stack labels and the normalized health check, and SQLite contained the matching `CREATE` audit. Service, networks, database and server were removed afterward.
7. The shared create/update mapper places CPU/memory limits and reservations under `TaskTemplate.Resources`, restores the legacy restart policy, and restores update/rollback rollout policies.
8. A live authenticated update returned `200`, incremented Docker's service version, and Docker inspect matched every requested resource and policy value; SQLite contained matching `CREATE` and `UPDATE` audits.
9. No create/update UI was added because the audited legacy Services page does not expose one.

SVC-06 is complete.

## Completed vertical slice: CFG-04

**Production GraphQL compatibility.**

Evidence:

1. The resolver loader now follows the executing module extension: `.resolvers.ts` in source development and `.resolvers.js` in compiled production.
2. `@graphql-tools/load-files` and `@graphql-tools/merge` are declared direct backend dependencies rather than relying on Drax transitively.
3. The backend build now fails if the compiled service query or mutation resolvers are absent.
4. A compiled Fastify/Yoga `POST /graphql` probe reached the service resolver's permission guard.
5. No GraphQL operation, schema, resolver behavior or frontend surface was added.

## Completed vertical slice: VER-01

**Docker engine/API version display.**

Evidence:

1. `GET /api/docker/version` requires `DOCKER_VIEW` and returns only Docker's `Version` and `ApiVersion` fields.
2. The Vue page reuses the existing REST client, protected router and Drax menu; it displays one read-only card and performs no polling.
3. Focused tests reproduced the missing `404` and page, then passed against the implemented contract.
4. Backend tests, frontend tests and both production builds pass.
5. A live authenticated Chromium run received `200` from the local Swarm daemon and displayed both returned values; its temporary SQLite database was removed.
6. No cluster totals, topology, task inspect or new abstraction was added.
