# Realtime and periodic features

| Feature | Legacy transport/cadence | Current ContainerHub | Auth | Persistence | Risk / decision |
|---|---|---|---|---|---|
| Task logs | Raw WebSocket `/logs`, Docker `follow:true`; reconnect on user/filter change | Authenticated task WebSocket with robust frame decoding; normalized running-task service snapshots; same user-driven reconnect | Legacy socket unguarded; current `DOCKER_LOGS` | None | Fixed 2000 vs editable 10000 ceiling |
| Terminal | Browser WS → backend → per-node agent WS | One-use ticket + direct Docker exec WebSocket | Legacy relay unguarded; current `DOCKER_TERMINAL`, ticket and Origin | In-memory tickets only | Multi-worker support unproven; one-process ticket store |
| Cluster topology | Recursive request polling, selectable 5–60s; default 5s, initially disabled | Missing | Legacy `DOCKER_VIEW` | None | Avoid timer leaks and N+1; product decision |
| Container/task stats | Recursive polling after response, selectable 5–60s | One-shot raw stats API, no UI | Current `DOCKER_VIEW` | None | Normalize DTO and prove remote tasks first |
| Monitoring worker | Config scan about every 10s; Socket.IO samples every 15–60s | Missing | Legacy user actions granular; agent unauthenticated | Mongo raw samples/config | Retention, task replacement, topology and worker ownership unresolved |
| Task lifecycle monitor | Backend recursive poll, default 60s; UI one-shot | Missing | Legacy `DOCKER_VIEW` | Mongo, max default 1000 | Running/absent approximation; decide if feature survives |
| Agent health | HTTP one-shot on Nodes page | Missing | Backend-to-agent unauthenticated | None | Shared remote-node decision |
| Ghost scan | One request on mount | One request on mount, wrong semantics | Current `DOCKER_VIEW` | None | Correct before exposing actions |
| Service/task lists | Manual refresh | Manual refresh | Operation/read permissions | None | No realtime need established |

## Protocol requirements for future work

- Reuse one remote-node transport decision across terminal, stats, ghosts, provisioning and monitoring.
- Authenticate and encrypt every backend-to-node protocol; do not retain legacy plaintext HTTP/WS/Socket.IO assumptions.
- Bind streams to current user, permission, task/container identity and topology; define revocation behavior for logout/permission changes.
- Use bounded buffers, frame sizes, idle/max lifetimes and explicit teardown, following the current terminal safeguards.
- Poll only after prior completion or use a single controlled timer; cancel on route teardown and prevent duplicate loops.
- Historical monitoring requires normalized samples, indexes, retention deletion and orphan/replacement-task semantics before charts.

## Verification boundary

Static code/tests show the current log and terminal controls exist. There is no live proof in this audit for authenticated WSS through deployment ingress, remote-worker terminal/stats, reconnect under transport failure, multi-process ticket routing, or monitoring load.
