# Realtime and periodic features

| Feature | Legacy transport/cadence | Current ContainerHub | Auth | Persistence | Risk / decision |
|---|---|---|---|---|---|
| Task logs | Raw WebSocket `/logs`, Docker `follow:true`; reconnect on user/filter change | Authenticated task WebSocket with robust frame decoding; normalized running-task service snapshots; same user-driven reconnect | Legacy socket unguarded; current `DOCKER_LOGS` | None | Fixed 2000 vs editable 10000 ceiling |
| Terminal | Browser WS → backend → per-node agent WS | One-use ticket + local exec or task-selected binary mTLS agent WebSocket | Legacy relay unguarded; current `DOCKER_TERMINAL`, ticket and Origin | In-memory tickets only | Physical-keyboard Chromium proof passed against a task on `debianvm`; one-process ticket store |
| Cluster topology | Recursive request polling, selectable 5–60s; default 5s, initially disabled | Aggregate totals only; topology/polling missing | Legacy/current `DOCKER_VIEW` | None | Reuse the shared topology transport and avoid N+1 |
| Container/task stats | Recursive polling after response, selectable 5–60s | Local/agent normalized API plus task charts with selectable polling, teardown and thresholds; remote calls bounded to 10s | Current `DOCKER_VIEW` | None | Authenticated API and four-chart browser proof passed against a task on `debianvm` |
| Monitoring worker | Config scan about every 10s; Socket.IO samples every 15–60s | Non-overlapping periodic collector with normalized samples, replacement-task discovery, history charts and bounded retention | Current `DOCKER_VIEW` reads and granular create/pause/delete | Drax Mongo/SQLite configurations and samples | Real Docker/database/browser and deployed distinct-worker proof pending |
| Task lifecycle monitor | Backend recursive poll, default 60s; UI one-shot | Missing | Legacy `DOCKER_VIEW` | Mongo, max default 1000 | Restore the same bounded running/absent approximation; do not expand it into an event system |
| Agent health | HTTP one-shot on Nodes page | HTTPS one-shot on Nodes page when configured | Legacy unauthenticated; current backend/agent mutual TLS plus `DOCKER_NODES_FETCH` | None | Global DNSRR deployment reached both nodes over mTLS; no-cert requests were rejected; Nodes browser proof passed |
| Ghost scan | One request on mount | One request on mount with task/container reconciliation across local and configured agent inventories | Current `DOCKER_VIEW` | None | Authenticated browser displayed a real `debianvm` orphan and excluded its healthy Swarm task; no actions exposed |
| Service/task lists | Manual refresh | Manual refresh | Operation/read permissions | None | No realtime need established |

## Protocol requirements for future work

- Reuse one remote-node transport decision across terminal, stats, ghosts, provisioning and monitoring.
- Authenticate and encrypt every backend-to-node protocol; do not retain legacy plaintext HTTP/WS/Socket.IO assumptions.
- Bind streams to current user, permission, task/container identity and topology; define revocation behavior for logout/permission changes.
- Use bounded buffers, frame sizes, idle/max lifetimes and explicit teardown, following the current terminal safeguards.
- Poll only after prior completion or use a single controlled timer; cancel on route teardown and prevent duplicate loops.
- Historical monitoring requires normalized samples, indexes, retention deletion and orphan/replacement-task semantics before charts.

## Verification boundary

Repository tests/builds show the current log, terminal, statistics and monitoring controls exist. There is no current live proof for authenticated WSS through deployment ingress, remote-worker terminal/stats/ghosts, reconnect under transport failure, multi-process ticket routing, or monitoring collection/load.
