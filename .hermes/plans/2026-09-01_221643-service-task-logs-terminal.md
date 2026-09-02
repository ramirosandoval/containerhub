# Service tasks, logs and terminal implementation plan

> **For Hermes:** Implement in small TDD steps. Do not commit or push unless the user explicitly asks.

**Goal:** From a Service row, an authorized user can list its tasks, read the logs of a selected task, and open an interactive shell in a selected running task when the Docker engine that owns its container is reachable.

**Architecture:** Reuse the existing Fastify + Dockerode backend and the existing Services page. Add task-specific REST endpoints for the task list and finite log tail. Add the terminal only as a separate authenticated WebSocket bridge, never as a browser-to-Docker connection. The terminal bridge resolves a Docker task to its container server-side, accepts only a shell allow-list, and is explicitly gated by a terminal permission.

**Tech stack:** Fastify 5, Dockerode, Vue 3/Vuetify, existing Drax identity/RBAC; add `@fastify/websocket` and maintained xterm packages only after the connection proof succeeds.

## Recommended terminal topology: agent-mediated binary bridge

The old `docker-fortes-agent` is required for Swarm tasks that run on remote nodes. Do **not** reuse its wire protocol. Implement this direction instead:

```text
xterm browser -- WSS/binary --> ContainerHub terminal gateway -- mTLS WSS/binary --> agent on the task's NodeID -- Docker exec/PTY --> task container
```

1. The browser first sends `POST /api/docker/task/:taskId/terminal-sessions` with `{shell: 'sh' | 'bash'}`. ContainerHub authorizes `DOCKER_TERMINAL`, resolves the task's real `NodeID` and `ContainerID`, and creates a one-time, 60-second session ticket.
2. The browser opens one protected ContainerHub WebSocket using that opaque session ticket, never a JWT, node ID or container ID. The gateway consumes the ticket once and selects the already-authenticated agent registered for the resolved node.
3. Each agent keeps an **outbound mTLS WebSocket** to ContainerHub and registers its node identity. ContainerHub verifies that identity against the Docker Swarm task `NodeID`; the agent URL must not be constructed from browser data or an unauthenticated DNS target.
4. ContainerHub sends a small JSON **control** frame only for `open`, `resize` and `close`; keystrokes and terminal output are WebSocket binary frames associated server-side with the session. Do not JSON-stringify every character or convert arbitrary chunks with `toString()`.
5. The agent creates Docker exec with `Tty: true`, `AttachStdin: true`, `AttachStdout: true`, `AttachStderr: true`, and a server-side shell allow-list. With TTY, preserve raw PTY bytes end-to-end; do not run the legacy Docker-header deletion algorithm. Docker defines exec creation and startup as separate Engine API operations ([Container Exec](https://docs.docker.com/reference/api/engine/latest/#tag/Exec/operation/ContainerExec), [Exec Start](https://docs.docker.com/reference/api/engine/latest/#tag/Exec/operation/ExecStart)).
6. On browser, gateway, agent or Docker-stream close, every peer closes its matching stream/session. Log only session metadata and never terminal payloads, tokens or tickets.

**Why the legacy path is unsafe/corrupting:** its browser sends node ID, container ID and selected shell in each JSON message (`docker-fortes/.../WebTerminalCreator.js:58-143`); the backend forwards that JSON unverified (`AgentWsService.js:5-19`); and the agent calls `chunk.toString()` after deleting byte patterns (`docker-fortes-agent/src/service/DockerWsService.js:37-95`). That can corrupt arbitrary terminal bytes, has no authenticated agent identity, trusts client-selected targets, and lacks a defined full-session cleanup lifecycle.

### Deployment and local-development TLS decision

This is a real deployment requirement, but it does **not** necessarily mean issuing a new certificate. The repository contains no deployment/ingress manifest, so whether ContainerHub already has TLS termination is unverified and must be confirmed with infrastructure before Tasks 5–7.

- **Production browser → ContainerHub:** the terminal endpoint must be `wss://` behind the same existing HTTPS ingress/certificate used by the application host, and that ingress must pass WebSocket upgrades. If the application already has HTTPS, this is normally a route/upgrade configuration change, not a new certificate. If it does not, TLS provisioning is a new infrastructure prerequisite.
- **Production agent → ContainerHub:** mTLS or an equivalent existing workload-identity mechanism is required before an agent holding a Docker socket may open a terminal tunnel. If the platform does not provide one, certificate authority, issuance, rotation and revocation are an explicit infrastructure scope requiring approval; do not silently build it into the application.
- **Local development:** allow plain `ws://` only when the terminal gateway binds to loopback and runs in an explicit development mode. The server must reject insecure non-loopback connections; there is no LAN/internet `ws://` fallback. The client derives `ws` versus `wss` from the configured backend URL, so normal `npm run dev` stays one command.
- **Verification:** run unit/bridge tests on loopback without TLS, then test the actual `wss://` browser upgrade through a staging or production-like ingress. Local TLS (`mkcert`/reverse proxy) is optional for reproducing ingress issues, not a prerequisite for everyday development.

### OWASP WebSocket controls required for the terminal

The ticket design is compatible with, but is not itself an OWASP certification. It must be implemented with all of these controls from the [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html#authentication-and-authorization):

- WSS only; exact `Origin` allow-list at the browser-facing handshake; no wildcard/substring origin matching.
- The one-time ticket is high-entropy, opaque, owner/task/shell bound, expires in 60 seconds, is consumed atomically, and is never put in a URL or logged. It is an implementation of OWASP's token-based authentication guidance without exposing the long-lived JWT in access logs.
- ContainerHub records the authenticated user and permission at session creation, revalidates the user session/permission periodically, and closes terminal sockets on logout, permission revocation, expiry or maximum terminal lifetime.
- Every control action is server-authorized; binary traffic is accepted only for the already-bound terminal session. Browser frames never select task, node, container or command.
- Control JSON is schema-validated; binary/control frames have explicit size limits, rate limits and backpressure. Connection/auth/authorization failures and close reasons are audited without payloads, tickets or tokens.
- Agent-to-hub transport uses separate mTLS identity and authorization. Browser `Origin` validation does not authenticate an agent.

STOMP decision: **do not use STOMP for the terminal bridge.** STOMP is designed for broker-mediated asynchronous messaging and uses command/header frames; although STOMP 1.2 permits binary bodies, its own specification describes a text-based framed protocol with server-specific destination/delivery semantics ([STOMP 1.2 — Abstract and Protocol Overview](https://stomp.github.io/stomp-specification-1.2.html)). The terminal needs a single, ordered, full-duplex raw PTY byte stream. Native binary WebSocket avoids an extra framing/parser layer and the exact character/control-byte risks that must be eliminated. STOMP remains reasonable for future application notifications, not terminal I/O.

---

## Current evidence and constraints

- `GET /api/docker/tasks/:serviceIdentifier` already calls `fetchTasks()` in `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts:71`; it returns raw Docker tasks.
- `GET /api/docker/logs/:stackName/:serviceName` only chooses the first running task (`ServiceService.ts:472-480`), so it cannot satisfy "logs of the selected task".
- A task inspect exposes `Status.ContainerStatus.ContainerID` (`ServiceService.ts:446-450`), which is the required bridge from Swarm task to Docker container.
- The legacy app had an xterm WebSocket client that sent `nodeId` and `containerId`; that is evidence that terminals for remote Swarm nodes may require an agent, not merely the manager Docker socket (`docker-fortes/.../WebTerminalCreator.js:58-143`). Do not copy that unauthenticated protocol.
- Docker Engine defines execution as creating an exec instance then starting it ([Docker Engine API — Container Exec](https://docs.docker.com/reference/api/engine/latest/#tag/Exec/operation/ContainerExec), [Exec Start](https://docs.docker.com/reference/api/engine/latest/#tag/Exec/operation/ExecStart)). Dockerode is only the local client; it does not make a manager socket reach containers running on another Swarm node.
- Browser-native WebSocket cannot attach the normal `Authorization` request header. The terminal design therefore needs an authenticated, short-lived, single-use connection ticket; do not place the JWT in a URL.

## Non-goals for this priority delivery

- No service restart/remove controls, task inspect page, historical log storage, terminal recording, file transfer, arbitrary command execution, or a broad Docker-agent platform.
- No claim that terminal works on remote Swarm nodes until tested against the actual deployment topology.
- No polling/live-follow logs in the first cut. A selected-task tail is useful immediately; follow mode is a later, separately bounded stream feature.

---

### Task 1: Prove the Docker topology before designing the terminal bridge

**Objective:** Determine whether the backend Docker socket can execute inside a running task on every target node.

**Files:**
- Create: `packages/containerhub-back/src/modules/services/services/__tests__/DockerTerminalE2E.test.ts`
- Document result in this plan under **Topology decision record**.

**Step 1: Add an opt-in integration test**

The test must skip unless `DOCKER_TERMINAL_E2E=1` is set. It must:

1. select a known running service task supplied by `DOCKER_TERMINAL_TASK_ID`;
2. inspect the task;
3. require a non-empty `Status.ContainerStatus.ContainerID`;
4. create `['/bin/sh', '-lc', 'printf containerhub-terminal-proof']` through Dockerode with `AttachStdin`, `AttachStdout`, `AttachStderr`, `Tty: false`;
5. start the exec and assert the exact marker appears in stdout.

Do not use a fixture that pretends to be Docker proof.

**Step 2: Run the proof against a manager-local task and a remote-node task**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH \
DOCKER_TERMINAL_E2E=1 DOCKER_TERMINAL_TASK_ID=<task-id> \
node --import tsx --test src/modules/services/services/__tests__/DockerTerminalE2E.test.ts
```

**Step 3: Record one of these decisions**

- **Direct mode:** both relevant tasks can be reached through `DOCKER_SOCKET_PATH`; implement Tasks 2–8.
- **Agent-required mode:** remote tasks cannot be reached; stop terminal implementation after Tasks 2–4. Write a follow-up agent contract before exposing a misleading terminal button.

**Verification:** The result is a real Docker execution proof, not a typecheck or Fastify injection.

### Task 2: Normalize selected-task data and add task-specific finite logs

**Objective:** Give the frontend a stable task list and the tail for exactly the task the user selected.

**Files:**
- Modify: `packages/containerhub-back/src/modules/services/services/ServiceService.ts:429-480`
- Modify: `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts:70-76`
- Modify: `packages/containerhub-back/src/modules/services/permissions/DockerPermissions.ts`
- Create: `packages/containerhub-back/src/modules/services/services/__tests__/TaskLogContract.test.ts`

**Step 1: Write RED tests for pure mapping/validation helpers**

Cover:

- a normalized `ServiceTaskModel` includes `id`, `nodeId`, `serviceId`, `containerId`, `state`, `message`, `createdAt`, and `updatedAt`;
- a task without `ContainerStatus.ContainerID` remains valid but cannot open a terminal;
- `tail` accepts only positive integers and has a bounded maximum (define `MAX_TASK_LOG_LINES = 2_000`); values above the maximum are rejected rather than silently expanded;
- a task log request preserves stdout and stderr text and does not return Docker multiplex headers as log text.

Run the test and confirm RED.

**Step 2: Implement the smallest service functions**

- Replace raw task output in `fetchTasks()` with the normalized application model. Keep the model minimal; do not expose the full Docker inspect object in the table API.
- Add `fetchTaskLogs(taskId, tail)` that calls `docker.getTask(taskId).logs({stdout: true, stderr: true, tail})` and returns a finite array of decoded lines.
- Confirm the supported Dockerode stream/buffer behavior in the installed version before choosing a demultiplexing approach. If Docker returns a multiplexed stream, use Dockerode's documented modem demultiplexer rather than the legacy byte-pattern removal.

**Step 3: Add routes with explicit RBAC**

- Keep `GET /api/docker/tasks/:serviceIdentifier`, protected by `DOCKER_VIEW`.
- Add `GET /api/docker/task/:taskId/logs?tail=<integer>`, protected by `DOCKER_LOGS`.
- Change the existing service-level logs route to `DOCKER_LOGS` if it remains public; authorization must be consistent for every logs path.

**Step 4: Verify**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH \
node --import tsx --test src/modules/services/services/__tests__/TaskLogContract.test.ts
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build:back
```

Then make an authenticated API request against a real selected task and compare the last N lines to `docker service logs`/task logs. Label this API proof separately from the unit proof.

### Task 3: Add task inspection only if it is needed to explain a task

**Objective:** Support a read-only inspect dialog without coupling it to terminal access.

**Files:**
- Modify: `packages/containerhub-back/src/modules/services/services/ServiceService.ts`
- Modify: `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts`
- Test: `packages/containerhub-back/src/modules/services/services/__tests__/TaskLogContract.test.ts`

**Step 1: RED test**

Require `GET /api/docker/task/:taskId` to return the Docker task inspect object only for `DOCKER_VIEW` users.

**Step 2: Implement**

Add `fetchTaskInspect(taskId)` as a narrow wrapper around `docker.getTask(taskId).inspect()` and route it at `GET /api/docker/task/:taskId`.

**Step 3: Verify**

Use Fastify injection for route/RBAC wiring and a real authenticated request for the Docker response. Do not add a UI inspect dialog until the task table exists and the product still wants it.

### Task 4: Build the Services task drawer and finite-log dialog

**Objective:** Let a user expand one service, see its tasks, select a task and read its logs.

**Files:**
- Modify: `packages/containerhub-front/src/pages/services/ServicesPage.vue`
- Create: `packages/containerhub-front/src/pages/services/ServiceTasksPanel.vue`
- Create: `packages/containerhub-front/src/pages/services/TaskLogsDialog.vue`
- Modify: `packages/containerhub-front/src/rest.ts`
- Modify: `packages/containerhub-front/src/locales/messages.ts`
- Create: `packages/containerhub-front/src/pages/services/__tests__/taskApi.test.ts`

**Step 1: Write RED tests for the pure REST request builders**

Test that a selected task ID is URL-encoded, that `tail` is a positive bounded number, and that `DOCKER_LOGS` errors are surfaced through the existing error mechanism rather than converted to an empty log list.

**Step 2: Implement minimal UI**

- Use Vuetify's existing expansion/row UI; do not replace `CrudListTable` globally.
- Lazy-load tasks only when a user expands a Service row. Cancel/ignore stale responses when the panel closes or another service is selected.
- Render a compact task table: state, task ID, node ID, updated timestamp, and actions.
- The logs action opens a dialog showing a `<pre>` with the finite tail. Use no terminal emulator for logs.
- Hide logs action unless the frontend authorization store has `DOCKER_LOGS`; backend remains authoritative.

**Step 3: Verify**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run test -w @containerhub/front
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build -w @containerhub/front
```

Browser proof with an authorized user: expand a service with multiple tasks; select each task; verify the task identity and finite log tail change together. Browser proof with a user lacking `DOCKER_LOGS`: action is hidden and API returns 403.

### Task 5: Define terminal authorization and lifecycle before adding WebSockets

**Objective:** Make terminal access explicit, revocable, auditable and bounded.

**Files:**
- Modify: `packages/containerhub-back/src/modules/services/permissions/DockerPermissions.ts`
- Modify: `packages/containerhub-back/src/setup/SetupContainerHub.ts`
- Create: `packages/containerhub-back/src/modules/services/services/TerminalSessionService.ts`
- Create: `packages/containerhub-back/src/modules/services/services/__tests__/TerminalSessionService.test.ts`

**Step 1: RED tests**

Require:

- only `DOCKER_TERMINAL` can create a ticket;
- ticket is tied to one authenticated user, task ID, and shell;
- ticket is one-time and expires in at most 60 seconds;
- `shell` accepts exactly `sh` or `bash`, never an arbitrary command string;
- invalid/expired/reused tickets do not open a Docker exec.

**Step 2: Implement the narrow in-memory ticket registry**

- `createTerminalSession(userId, taskId, shell)` returns an opaque random ticket.
- Store only a hash of the ticket, owner ID, task ID, shell, expiry, and consumed state.
- Consume atomically before Docker exec starts. Remove it on expiry and on socket close.
- Add `POST /api/docker/task/:taskId/terminal-sessions` protected by `DOCKER_TERMINAL`; body is `{shell: 'sh' | 'bash'}`.

**Known ceiling:** an in-memory registry is valid for one backend process only. Add a `// ponytail:` comment that a shared store is required before multi-instance deployment.

**Step 3: Verify**

Run focused tests and inspect `SetupContainerHub.ts` to ensure the new permission is seeded through `dockerPermissions`.

### Task 6: Add a binary-safe authenticated terminal WebSocket bridge

**Objective:** Connect the browser terminal to one Docker exec session without exposing the Docker socket, task container ID, JWT, or arbitrary commands.

**Prerequisite:** Task 1 recorded **Direct mode**. Otherwise stop here and implement the agent contract instead.

**Files:**
- Modify: `packages/containerhub-back/package.json` and root lockfile (add `@fastify/websocket`)
- Modify: `packages/containerhub-back/src/factories/YogaFastifyServerFactory.ts`
- Create: `packages/containerhub-back/src/modules/services/routes/TerminalRoutes.ts`
- Modify: `packages/containerhub-back/src/modules/services/services/ServiceService.ts`
- Create: `packages/containerhub-back/src/modules/services/services/__tests__/TerminalBridge.test.ts`

**Step 1: Perform a local protocol spike**

Before production code, prove the installed Fastify WebSocket plugin can:

- receive a binary browser frame;
- validate the short-lived terminal ticket supplied in `Sec-WebSocket-Protocol` (not URL query);
- write bytes to Docker's hijacked exec stream and forward Docker output unchanged;
- close Docker resources when the socket closes.

Do not send a JWT in the WebSocket URL or log it.

**Step 2: RED tests**

Cover rejected ticket, task without a running container, non-allowlisted shell, failed Docker exec creation, client close, and one successful local Docker round trip. The real Docker round trip remains opt-in E2E.

**Step 3: Implement**

- Resolve `taskId` server-side via `docker.getTask(taskId).inspect()`; derive the container ID there.
- Create the Docker exec with interactive attach streams and `Tty: true`; start it in hijacked mode.
- Bridge raw binary frames bidirectionally. Reject oversized initial/control messages and close on Docker/client termination.
- Never expose a generic `exec(command)` endpoint or browser supplied container ID.
- Log connection metadata only: user ID, task ID, start/end, reason; never payload, ticket, token, or terminal bytes.

**Step 4: Verify**

- Focused bridge tests.
- `npm run build:back`.
- Direct-mode Docker E2E: open `sh`, run `printf containerhub-terminal-proof`, observe exact output, exit, and confirm cleanup.
- Authorization E2E: a `DOCKER_VIEW`-only user cannot create a session nor connect.

### Task 7: Add the terminal page and task action

**Objective:** Allow an authorized user to open a terminal from a running selected task.

**Files:**
- Modify: `packages/containerhub-front/package.json` and root lockfile (add maintained xterm core + fit addon)
- Create: `packages/containerhub-front/src/pages/services/TaskTerminalPage.vue`
- Create: `packages/containerhub-front/src/pages/services/TaskTerminalClient.ts`
- Modify: `packages/containerhub-front/src/pages/services/ServiceTasksPanel.vue`
- Modify: `packages/containerhub-front/src/router/index.ts`
- Modify: `packages/containerhub-front/src/locales/messages.ts`
- Create: `packages/containerhub-front/src/pages/services/__tests__/terminalSessionRequest.test.ts`

**Step 1: RED test**

Test that the terminal session request posts only `{shell}` to the selected task route and never places an access token in the navigation URL.

**Step 2: Implement**

- Show terminal action only for `state === 'running'`, a known `containerId`, and `DOCKER_TERMINAL` permission.
- Ask the user to select `sh` or `bash`; no free-text command field.
- Create the ticket via authenticated REST, then navigate to a protected terminal route with only the task ID. Keep ticket in memory, not route/query/local storage.
- Mount xterm, forward binary-safe input/output through the bridge, and send resize events through an explicitly bounded control message.
- Dispose xterm, WebSocket and resize observer on unmount.
- Show a clear unavailable state when the task has no container or the backend reports agent-required topology.

**Step 3: Verify**

- Frontend unit tests and build.
- Browser proof: terminal opens, command output appears, resize works, closing page disconnects.
- Browser proof: no terminal action for stopped task or user lacking `DOCKER_TERMINAL`.

### Task 8: Close with deployment, safety and observability checks

**Objective:** Ensure the terminal is usable without creating an unbounded remote-shell service.

**Files:**
- Modify: `docs/original-webapp-inventory.md`
- Create or modify: deployment documentation only if `DOCKER_SOCKET_PATH`, proxy WebSocket upgrade, or agent topology requires it.

**Step 1: Deployment checklist**

- Confirm reverse proxy permits WebSocket upgrades at the terminal bridge route.
- Confirm backend process has Docker socket access only as intended.
- Confirm no access token/ticket is emitted in access logs, browser URL, error telemetry or Swagger.
- Confirm `DOCKER_TERMINAL` is assigned deliberately, not inherited accidentally from `DOCKER_VIEW`.
- Confirm direct/agent topology decision in the deployed environment.

**Step 2: Record proof by layer**

- **Repository:** focused tests plus frontend/backend builds.
- **API:** authenticated selected-task list/log/session requests.
- **UI:** browser task expansion, selected-task logs and interactive terminal.
- **Docker E2E:** actual running local and remote-node task results.

**Step 3: Update inventory**

Mark S-06/C-02/C-06/C-07 only to the exact extent exercised. Do not mark remote terminal parity complete when only manager-local tasks work.

---

## Topology decision record

**Status:** direct mode proven on the current single-node Swarm on 2026-09-01; remote-node mode remains unverified because this environment has one node.

- Direct mode result: `docker inspect` resolved running task `lvvgwaqwajzfh49g46ew81914` to its container and `docker exec ... sh -lc 'printf containerhub-terminal-proof'` returned the exact marker. `fetchTaskLogs(taskId, 3)` also decoded three real task lines without multiplex headers.
- Agent-required mode result: pending a real multi-node Swarm task.
- Deployment target(s) tested: local Docker Swarm manager only; no browser, ingress, WSS or agent proof yet.

## Execution order and stop conditions

1. Execute Task 1 first. It is the technical gate for terminal feasibility.
2. Execute Tasks 2 and 4 regardless: selected tasks and finite selected-task logs are high value and rely on already available Docker operations.
3. Execute Tasks 5–7 only after direct mode is proven. If agent-required, write the minimal agent protocol plan instead of faking a manager-local terminal.
4. Stop and ask for product/security approval before adding arbitrary command execution, live log follow, persistent terminal sessions, multi-process ticket storage, or a node agent.
