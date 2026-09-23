# Revisión de legibilidad (23 de septiembre de 2026)

Objetivo: facilitar que un desarrollador siga los flujos de ContainerHub sin cambiar su comportamiento. Inventario histórico de la primera pasada en [`inventory.tsv`](inventory.tsv): **123 archivos** de producción bajo `packages/*/src/` (`.ts`/`.vue`; excluye tests y `.d.ts`), incluido el diálogo extraído en `a9cf3c0`. Cada fila contiene hash del contenido revisado **en esa pasada** (puede diferir tras un corte posterior), estado, flujo, motivo, reutilización, prueba relevante y commit si lo hubo. El informe de calidad `docs/quality-audit/` pertenece a otra revisión y no se modificó.

## Primera pasada: inventario de producción

| Estado | Archivos | Significado |
| --- | ---: | --- |
| `refactored` | 4 | Además del corte de tareas (`b726555`), `MonitoringPage.vue` delega el formulario de creación a `MonitoringCreateDialog.vue` (`a9cf3c0`); la página conserva listado, permisos, acciones y recarga. |
| `unchanged` | 115 | El límite actual es suficientemente legible o una extracción añadiría más saltos/props que claridad. Incluye GitLab, estadísticas de tareas y el WebSocket del agente: sus estados y temporizadores mantienen un dueño visible. |
| `blocked` | 4 | Hay una posible mejora pero falta caracterización de interacción/errores o acceso a una lectura no enmascarada; no se modificó el archivo. |

## Qué quedó bloqueado

- `packages/containerhub-front/src/pages/services/TaskTerminalPage.vue`: teclado, portapapeles, reconexión y consumo de ticket requieren caracterización de interacción antes de mover estado.
- `packages/containerhub-back/src/modules/services/services/ServiceService.ts`: aprovisionamiento local/remoto comparte límites de seguridad y errores distribuidos con las operaciones del servicio; no se mueve sin pruebas de rutas, fallos parciales y orden de efectos.
- `packages/containerhub-back/src/modules/monitoring/services/TaskMonitorizationManager.ts`: la atribución de auditoría y el polling podrían aislarse, pero no hay pruebas directas de orden/errores para ese ciclo.
- `packages/containerhub-back/src/setup/SetupContainerHub.ts`: la herramienta de lectura enmascaró texto de permisos en las líneas 22 y 68; no se emitió un juicio de archivo completo ni se intentó eludir el enmascaramiento.

## Evidencia y límites

- Frontend: `npm test --workspace=@containerhub/front` → **46/46**; `npm run build` en `packages/containerhub-front` → salida 0. Prueba Playwright con autorización sintética, respuestas HTTP controladas, y expansión/visibilidad de acciones/nodo sin permiso de nodos: **1/1 antes y después**. Se usó configuración temporal bajo `~/.hermes/cache/scratch` por archivos de caché Vite propiedad de root; no se modificó la configuración de producción. Este fixture no demuestra login/backend/Swarm reales. El servidor local imprime avisos de SQLite y optimización de dependencia; la prueba pasó, pero esos avisos no se presentan como verificación del backend.
- Monitoreo: prueba Playwright con token sintético y respuestas HTTP controladas **1/1 antes y después** de extraer el formulario; cubre selección, fechas inválidas, error de creación, `busy` compartido, éxito y recarga. `npm test --workspace=@containerhub/front` → **46/46**; `npm run build:front` → salida 0. No prueba login, API ni Swarm reales; se sirvió el build local mediante preview con configuración temporal fuera del repo.
- Agente: `npm test --workspace=@containerhub/agent` → **7/7**; `npm run build --workspace=@containerhub/agent` → salida 0. No se modificó el agente ni se ejercitó Docker remoto.
- Backend: `npx tsc -p tsconfig.json --noEmit` → salida 0; pruebas focalizadas `ServiceService.test.ts` y `DistributedProvisioning.test.ts` con `--experimental-test-module-mocks` → **5/5**. Sin ese flag, el runner falla en `mock.module is not a function`; se reejecutó con el flag que exige el script `test:provisioning` del paquete. **No se ejecutó `npm run build:back`** en este corte: su script arranca una base `smoke.db` preexistente y no corresponde sustituirla inadvertidamente. No se probaron APIs, Mongo, SQLite, red ni Docker/Swarm reales en esta revisión.
- El barrido por flujos fue de lectura y clasificación, no una prueba de comportamiento de todos los archivos. El inventario inicial se contrastó con `git ls-files` y los hashes; ahora incluye el diálogo extraído. `packages/containerhub-front/src/shims.d.ts` queda fuera por ser declaración. Un estado `blocked` no equivale a un defecto funcional.

Si se aborda uno de los cuatro pendientes, primero añadir un test de la conducta actual y ejecutarlo verde, crear el límite mínimo, repetirlo junto con build, y registrar evidencia antes de un commit local. No convertir riesgos de `docs/quality-audit/` en cambios de conducta bajo el rótulo de legibilidad.
