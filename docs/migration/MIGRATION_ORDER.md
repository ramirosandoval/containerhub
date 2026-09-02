# Dependency-aware migration order

## Principles

Each item is a vertical slice: backend behavior → API contract → permission → frontend/navigation → tests/live proof → IR update. A domain is not complete from compilation or a rendered fixture alone.

## Order

### 0. Stabilize the existing foundation

1. Correct and document Drax environment names and fail startup safely when required DB/JWT configuration is absent.
2. Replace hardcoded bootstrap credentials with explicit environment/bootstrap behavior.
3. Decide and seed identity-management permissions/legacy role policy before exposing Drax administration.
4. Fix direct dependency/runtime packaging issues for GraphQL or explicitly retire the compatibility surface.
5. Restore real runtime validation at trust boundaries rather than relying on OpenAPI-only schemas.

Why first: every later API/auth test depends on a real database/JWT/bootstrap configuration and trustworthy validation.

### 1. Repair already-exposed incorrect behavior

1. **Service-level logs correctness:** fix normalized task selection, preserve `DOCKER_LOGS`, endpoint tests and live running-task proof.
2. **Ghost containers correctness:** define and implement healthy-vs-orphan task reconciliation, verify healthy/orphan fixtures, keep read-only.

Why now: these routes/pages already claim capabilities they do not correctly provide. Fixing existing claims is smaller and safer than adding features.

### 2. Complete low-risk read-only foundations

1. Networks filters, date formatting and manual refresh using existing data; no mutation UI.
2. Node resource columns using fields already returned.
3. Docker version endpoint/card if product confirms it remains useful.
4. Task inspect only after permission/redaction decision.

Why: small independently verifiable slices with no persistence or new transport.

### 3. Operational audit before new destructive UI

1. Decide required audit retention/data compatibility.
2. Add one durable Drax-style audit entity/sink for service/network commands if required.
3. Only then expose **bulk restart** with per-action permission, confirmation, visible result/error and refresh.
4. Add **bulk remove** separately with stronger destructive proof.
5. Network create/replace/remove UI remains a separate product decision because update is remove-then-create.

Why: Services backend commands exist, but exposing them before audit/UX safeguards would weaken legacy operations.

### 4. Prove multi-node topology once

Deploy/identify one task on a worker different from the backend daemon and verify terminal, task stats, ghost scan and provisioning. Choose exactly one architecture:

- narrowly authenticated per-node agent;
- secured Docker remote API/context strategy; or
- explicit single-node-only product scope.

Do not implement separate transports per feature.

### 5. Statistics and cluster views

1. Define one normalized task-stat DTO and prove local/remote behavior.
2. Add one task statistics page with bounded five-second polling and teardown.
3. Add service aggregation only after partial failure semantics are defined.
4. Add cluster summary with explicit active/historical task count.
5. Add node/task visualizer and polling only if the simpler Nodes/Services views are insufficient.

### 6. Identity product capabilities

After role policy and runtime configuration:

1. Expose Drax user/role management using supplied routes/pages.
2. Decide groups and tenancy rather than porting them automatically.
3. Configure and verify password/profile/avatar flows.
4. Add email-backed registration/recovery only with working SMTP/base URLs.
5. Add LDAP only after role mapping and authentication strategy are approved.

### 7. Historical monitoring, only if confirmed

1. One persisted configuration entity using Model/Schema/Repository/Service/Factory.
2. One normalized sample collection path.
3. One bounded history query with enforced date range and retention.
4. One simple chart.
5. Then pause/resume, calendar/permanent modes, replacement-task tracking and multi-replica behavior.

### 8. Task lifecycle history, settings and customization

- Task lifecycle: migrate only if users need a durable running/absent event history distinct from Docker/audit.
- Settings: add only accepted operational settings; no generic platform in advance.
- Customization: retain static Drax shell unless editable customer branding/language is confirmed.
- Legacy diagnostics/error demos remain obsolete. Registry purge settings remain `NEEDS_PRODUCT_DECISION` because no app-owned consumer was found; mark them obsolete only after product confirmation.

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

No subsequent migration slice is selected here.
