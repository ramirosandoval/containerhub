# B05 — agente de nodo

Estado actual: 4 fuentes inventariadas al 2026-09-28. La nueva `packages/containerhub-agent/src/agentProvisioningRoutes.ts` concentra la apertura/escritura de archivos antes alojada en `server.ts`; las referencias a `server.ts:126-150` siguientes pertenecen al **corte histórico** `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`, no al árbol actual. Ver actualización de hallazgos al final y hashes en `../inventory.tsv`.

## Flujos y notas por archivo

- Reviewed: `packages/containerhub-agent/src/index.ts` — `:1-6`: entrada del proceso → `startAgent()` (`server.ts:240-256`); el rechazo de arranque se registra y fija `process.exitCode = 1`, sin ocultar el fallo. Contrato/límite: sólo bootstrap; configuración, transporte y recursos quedan en `server.ts`. Contraste: `src/__tests__/server.test.ts:52-83` invoca el lector de configuración, no prueba el proceso ni el listener; no se localizó test directo de `index.ts`. Sin hallazgo específico.
- Reviewed: `packages/containerhub-agent/src/server.ts` — `:20-55` valida `NODE_ID`, puerto, raíces absolutas y el trío de archivos mTLS; `:240-256` carga certificados, crea Docker sobre socket local y escucha en todas las interfaces. `:176-197` expone health, inventario y estadísticas; el llamador real `packages/containerhub-back/src/modules/services/services/AgentHealthClient.ts:96-159` resuelve la IP por `/health` y consume dichas rutas. `:199-235` confina `/folders` y `/files` a raíces autorizadas, rechaza symlinks y protege `containerhub.sqlite` incluso por hardlink; el llamador backend `ServiceService.ts:1211-1253` valida la entrada y distribuye a agentes remotos, mientras `:217-234` acepta y revalida el cuerpo dentro del agente. Contraste: `src/__tests__/server.test.ts:9-151` comprueba stats, health, configuración, archivos/raíces/symlinks/hardlink e inventario mediante `Fastify.inject` y Docker simulado; `packages/containerhub-back/src/modules/services/services/__tests__/DistributedProvisioning.test.ts:34-93` comprueba errores de worker y disco local, no I/O remoto real. Véanse B05-001 y B05-002.
- Reviewed: `packages/containerhub-agent/src/terminalRoutes.ts` — `:14-26` exige socket TLS autorizado cuando `secure=true`, valida nodo/tarea/contenedor/shell antes del upgrade; `:89-117` comprueba etiquetas de tarea Swarm y arranque del contenedor antes de `exec`, y destruye el stream al cerrar. `:34-58,59-87,108-116` limita arranque, inactividad (15 min), sesión (30 min), payload, buffers y resize, con cierre acotado si el peer no responde. Flujo: `packages/containerhub-back/src/modules/services/routes/TerminalRoutes.ts:67-86,103-113` autoriza y consume ticket → `ServiceService.ts:697-709` elige agente remoto → `AgentTerminalClient.ts:85-90,9-82` conecta por WS/WSS → este plugin llama `docker.getContainer().inspect()/exec()/start()/resize()`. Contraste: `src/__tests__/terminalRoutes.test.ts:17-129` prueba WSS mTLS con socket real pero Docker simulado, rechazo de identidad/tarea/control, límites, cierre y transporte WS local. Sin hallazgo específico de limpieza: la lógica de cierre/buffers corresponde a límites reales; no recomendar quitarla.

## Hallazgos

### B05-001 — seguridad/disponibilidad de escritura — severidad media — certeza comprobado (ruta estática; efecto condicionado a entrada FIFO)
- Evidencia: `packages/containerhub-agent/src/server.ts:126-150` abre el destino existente con `O_WRONLY | O_NOFOLLOW` **sin `O_NONBLOCK` y sin verificar `file.stat().isFile()`**; `:217-234` permite que `/files` llegue a esa operación tras comprobar ruta y tipo del contenido. Un FIFO preexistente bajo una raíz permitida satisface los controles de ruta, pero su apertura en modo escritura puede esperar indefinidamente a un lector, antes de la comprobación de inode SQLite (`:142-148`).
- Impacto: una solicitud de aprovisionamiento autorizada a un destino FIFO puede quedar pendiente y retener recursos del agente; el plazo de 10 s del llamador `AgentHealthClient.ts:154-158` cancela la espera del backend, no demuestra que se interrumpa la apertura en el agente. No se afirma explotación en despliegue real.
- Contraste: `src/__tests__/server.test.ts:85-124` ejercita archivos normales, symlink y hardlink de SQLite, no FIFO ni tipo especial; test no ejecutado aquí.
- Intervención mínima sugerida: abrir destinos existentes sin bloqueo y exigir archivo regular **sobre el descriptor abierto** antes de truncar; mantener confinamiento, `O_NOFOLLOW` y protección de SQLite. Añadir un test aislado de FIFO que rechace sin colgarse.

### B05-002 — integridad de escritura — severidad media — certeza comprobado (ausencia de atomicidad en fuente; fallo concreto no reproducido)
- Evidencia: `packages/containerhub-agent/src/server.ts:149-150` trunca el archivo existente a cero antes de `writeFile(content)`; `:227-234` confirma éxito sólo tras resolver todas las promesas, pero la ruta no revierte un archivo ya truncado si la escritura falla. `packages/containerhub-back/src/modules/services/services/AgentHealthClient.ts:154-158` sólo recibe código de éxito/error.
- Impacto: ante una falla de escritura posterior al truncado (p. ej., espacio insuficiente), puede perderse el contenido anterior aunque el backend reciba error; lectores concurrentes pueden ver el archivo vacío o incompleto. No se observó tal falla durante esta auditoría.
- Contraste: `src/__tests__/server.test.ts:95-118` verifica escritura exitosa y protección del archivo SQLite; no prueba error entre truncado y escritura ni lector concurrente. La ruta local del manager tiene la misma secuencia en `packages/containerhub-back/src/modules/services/services/ServiceService.ts:1173-1204`; coordinar la corrección allí para no dejar rutas divergentes.
- Intervención mínima sugerida: escribir primero en temporal dentro del directorio ya confinado y reemplazar al completar, conservando las verificaciones sobre el destino protegido y su protección ante carreras; test aislado que fuerce fallo de escritura y compruebe que el destino anterior sigue íntegro. La atomicidad por nodo no haría transaccional `Promise.all` entre nodos.

## Fortalezas comprobadas

- `server.ts:38-42,243-247` rechaza configuración mTLS parcial y, si está activa, configura `requestCert` y `rejectUnauthorized`; `terminalRoutes.ts:18-25` refuerza la autorización TLS en el upgrade. El stack mTLS declarado en `packages/containerhub-agent/stack.yml:5-18` no equivale a verificación de despliegue.
- `server.ts:199-214,103-155` separa comprobación léxica/real de ruta y apertura relativa al descriptor de directorio; `src/__tests__/server.test.ts:107-119` contrasta symlink colgante, hardlink de base de datos y salida de raíz.
- `terminalRoutes.ts:34-58,63-86,90-117` centraliza cierre idempotente, plazos y presión de buffers; `src/__tests__/terminalRoutes.test.ts:47-100` ejercita controles reales del socket con dependencia Docker falsa.

## Límites y pruebas consultadas

- Fuente completa de los 3 archivos asignados, `src/__tests__/server.test.ts`, `src/__tests__/terminalRoutes.test.ts` y contratos de los llamadores backend arriba citados. La prueba WSS crea TLS/socket local reales, **no** ejecuta Docker/Swarm ni demuestra E2E de UI a agente; el resto simula Docker o usa `Fastify.inject`.
- La sesión delegada no tenía Node/npm en `PATH`. Desde el entorno principal se ejecutó `npm test --workspace=@containerhub/agent`: **7/7 pasaron**, incluido WSS mTLS con Docker simulado. Ninguna prueba cubre FIFO ni falla tras truncado; esos hallazgos siguen basados en fuente, no en una reproducción. No se levantó infraestructura.
- Grafo `code-review-graph` consultado primero; devolvió `stale_graph` (indexado en `8bb3bd45…`, HEAD `94910fc7…`). Las relaciones se trazaron en fuente y tests; el grafo no se usó para inferir ausencias.
- El agente admite WS/HTTP sin TLS si no se configuran certificados (`server.ts:39-55,176-180`), comportamiento esperado por el test `server.test.ts:52-61` y `terminalRoutes.test.ts:103-129`; en ese modo la restricción de acceso depende de la red. No equiparar ese test de compatibilidad con garantía de aislamiento en producción, ni retirar mTLS del despliegue seguro.

## Sesiones de revisión

- 2026-09-23: leídos completamente los tres archivos B05 sobre `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`. Hashes SHA256 de fuente: `index.ts` `c30be1a2e4e865064d4b4f9aeacea6158363eb6b4dcb9fedf7d1e7fe20701658`; `server.ts` `9b9a47e33aadc0a2e76cb55dce5e848f75dbca727a64012c43c6094e3067a69a`; `terminalRoutes.ts` `aa21d0718fc6b0f5a6e9b5fea67450be4047fa5dfa27ec3aa43cbe5b4950f4b0`. Por restricción de alcance no se actualizaron las filas `pendiente` de `inventory.tsv` ni la fila B05 del índice: quien cierre la tanda deberá cotejar estos hashes con fuente actual antes de marcarla `revisado`.

## Próximos archivos / preguntas

- No quedan fuentes B05 sin leer. Cotejar hashes/estados del inventario; reabrir observaciones si el código cambió. Los tests del agente ya pasaron, pero no convertir mocks en afirmación E2E ni dar por reproducidos B05-001/002.

## Actualización de hallazgos — 2026-09-28

| ID | Estado vigente | Evidencia actual / límite |
|---|---|---|
| B05-001 | Corregido | `src/agentProvisioningRoutes.ts:75-103` abre con `O_NONBLOCK` y comprueba `file.stat().isFile()` sobre el descriptor antes de truncar. `src/__tests__/server.test.ts` cubre FIFO, sin trabajador Swarm real. El manager aplica el mismo control en `HostVolumeProvisioning.ts`. |
| B05-002 | Conservado por compatibilidad | `agentProvisioningRoutes.ts:99-100` mantiene `truncate(0)` seguido de `writeFile` sobre el mismo descriptor; el manager conserva la secuencia homóloga. Una falla intermedia podría dejar contenido incompleto: riesgo derivado del orden, no incidente reproducido. No sustituir por `rename` ahora: cambiaría identidad/inode de destinos montados o enlazados y el usuario pidió preservar `docker-fortes`. |

La suite agente actual pasó **8/8**; no prueba falla de disco ni aprovisionamiento en un worker real.
