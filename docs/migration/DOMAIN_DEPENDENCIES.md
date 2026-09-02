# Domain dependency graph

## Graph

```mermaid
graph TD
  CFG[Configuration/bootstrap] --> ID[Identity and RBAC]
  ID --> PERM[Permission and role policy]
  ID --> AUDIT[Operational audit]
  ID --> API[Protected API conventions]
  API --> SVC[Services]
  API --> NODE[Nodes]
  API --> NET[Networks]
  API --> GL[GitLab]
  API --> REG[Registry]

  REG --> SVC
  GL --> SVC
  NET --> SVC
  SVC --> STACK[Stacks]
  SVC --> TASK[Tasks]
  NODE --> TASK
  TASK --> LOG[Logs]
  TASK --> TERM[Terminal]
  TASK --> STAT[On-demand statistics]
  TASK --> GHOST[Ghost detection]
  NODE --> CLUSTER[Cluster information]
  SVC --> CLUSTER
  TASK --> CLUSTER

  TOPO[Remote-node transport decision] --> TERM
  TOPO --> STAT
  TOPO --> GHOST
  TOPO --> FS[Host provisioning]
  TOPO --> MON[Historical monitoring]

  ID --> AUDIT
  SVC --> AUDIT
  NET --> AUDIT
  SET[Confirmed runtime settings] --> LOG
  SET --> LIFE[Task lifecycle history]
  SET --> MON
  TASK --> LIFE
  AUDIT --> LIFE
  SVC --> MON
  TASK --> MON
  ID --> MEDIA[Email/avatar/branding]
  ID -. optional LDAP authentication extension .-> LDAP[LDAP decision]
```

## Dependency rules

1. **Bootstrap and identity precede feature expansion.** Current environment-name mismatch, unsafe root seed, and incomplete Admin permissions can invalidate every authorization test.
2. **Permission policy precedes UI actions.** Existing backend permission constants are evidence; legacy unguarded REST/WebSocket paths are defects, not contracts.
3. **Services, Tasks and Nodes are foundations.** Stacks is already a derived Services view. Logs, terminal, statistics and cluster views depend on stable task/node identity.
4. **Remote-node topology is one shared decision.** Terminal, stats, ghosts, all-node provisioning and monitoring must not each invent a transport.
5. **Audit precedes newly exposed destructive operations.** Service remove/restart and network replacement currently lack legacy durable mutation history.
6. **Monitoring comes after on-demand stats and topology proof.** It additionally requires persistence, worker ownership, retention and task-replacement semantics.
7. **Settings are not foundational as a generic platform.** Introduce only values required by an accepted domain.
8. **GitLab and Registry are already independent read-only integrations.** Their only unresolved dependency is whether deployment workflows consume them and which permissions govern them.

## Cycles and coupling to avoid

- Legacy task lifecycle history heuristically joins audit records in the browser. Replace with an explicit event/audit relation only if lifecycle history survives.
- Legacy monitoring owns overlapping service/task/container snapshots. Define normalized operational DTOs before persistence; do not persist raw legacy graph shapes unchanged.
- Do not make Stacks a persisted entity: it is a label-derived view.
- Do not make every Docker resource a generic Drax CRUD entity: Docker is the source of truth and many operations are commands, streams or derived snapshots.

## Critical path

`bootstrap/auth correctness → permission/role decision → fix existing API correctness gaps → audit decision for destructive actions → remote-node topology proof → stats → monitoring`
