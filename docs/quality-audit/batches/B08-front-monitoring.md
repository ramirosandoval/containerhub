# B08 — monitorización frontend

Estado actual: 7 fuentes inventariadas al 2026-09-28; se extrajo `MonitoringCreateDialog.vue` desde `MonitoringPage.vue` y se retiró `TaskMonitorizationApi.ts`, que no tenía consumidor local de producción. La lista y los números de línea siguientes describen el **corte histórico** `94910fc7f948bfd0b7801e962e0d1243c3b1a10a` y no incluyen ese cambio; ver actualización de hallazgos al final.

## Flujos y notas por archivo

- Reviewed: `packages/containerhub-front/src/pages/MonitoringPage.vue` — La ruta de listado (`packages/containerhub-front/src/router/index.ts:9-16`) entrega `useCrud` a `MonitoringCrud.instance` para búsqueda/filtros/paginación (`:17-24,88-90,109`); crear consulta `/api/services` y estados antes de enviar la selección (`:118-144`), y pausar/reanudar/eliminar recarga la tabla (`:145-157`). Límite: botones sujetos a permisos de UI (`:7,30-31`), enforcement real en `packages/containerhub-back/src/modules/monitoring/routes/MonitoringRoutes.ts:43-53,75-92`. Test: `packages/containerhub-front/src/router/__tests__/ServicesPermission.test.ts:29-53` comprueba cableado por patrones; `packages/containerhub-back/src/modules/monitoring/__tests__/Monitoring.test.ts:34-94` ejercita las mutaciones y permisos. La función `searchConfigurations` (`:116`) no tiene llamador localizado en `packages/containerhub-front/src`.
- Reviewed: `packages/containerhub-front/src/pages/MonitoringHistoryPage.vue` — `openHistory` de la página anterior (`MonitoringPage.vue:29,117`) lleva al id de ruta (`:59`); `load` solicita configuración y muestras con fechas convertidas a ISO y límite (`:90-103`), después filtra por tarea y dibuja gráficas/tabla (`:68-88,19-36`). Límite: `MonitoringRoutes.ts:65-74` valida la petición y `MonitoringSampleService.ts:21-25` aplica filtros/límite al repositorio; no hay polling en esta vista, sólo carga inicial y botones (`:7,17,107`). Test: `packages/containerhub-front/src/pages/__tests__/MonitoringHistoryPage.test.ts:5-19` sólo verifica texto/cableado; `packages/containerhub-back/src/modules/monitoring/__tests__/MonitoringHistory.test.ts:28-76` verifica persistencia/lectura SQLite, no datos que excedan el límite.
- Reviewed: `packages/containerhub-front/src/pages/TasksMonitorizationPage.vue` — Ruta `router/index.ts:19-20` monta `Crud` con `TaskMonitorizationCrud.instance` (`:2,16-18`); slots formatean fecha, estado y autor (`:3-11`). Límite: no implementa polling propio ni autoriza en el componente; el CRUD delega consulta al proveedor y backend `TaskMonitorizationRoutes.ts:29-45`. Test: `packages/containerhub-back/src/modules/monitoring/routes/__tests__/TaskMonitorizationRoutes.test.ts:49-81` cubre paginación/filtros de ruta con mock; sin test de renderizado del componente localizado en `packages/containerhub-front/src`.
- Reviewed: `packages/containerhub-front/src/cruds/MonitoringCrud.ts` — `MonitoringPage.vue:80,88,125-155` consume `monitoringProvider`; paginación normaliza filtros y llama `restGet`, altas/estado usan `restPost`, borrado el cliente HTTP con token (`:20-40`), y metadatos del CRUD definen columnas, campos y acciones desactivadas (`:41-89`). Límite: `MonitoringRoutes.ts:17-33,56-92` valida filtros, orden, payload y permisos; el token en frontend (`:35`) no sustituye RBAC. Tests: `packages/containerhub-front/src/cruds/__tests__/MonitoringCrud.test.ts:5-15` prueba sólo helper, `DynamicFilterFields.test.ts:25-35` metadatos; `Monitoring.test.ts:34-94` comprueba API real con SQLite.
- Reviewed: `packages/containerhub-front/src/cruds/MonitoringFilters.ts` — `MonitoringCrud.ts:21-30` llama `activeMonitoringFilters` (`:3-5`) para retirar filtros sin campo/valor antes de serializar; el receptor acepta `empty` y valor `null` en `MonitoringRoutes.ts:18-26`. Test `packages/containerhub-front/src/cruds/__tests__/MonitoringCrud.test.ts:5-15` cubre valores nulos para `eq`/`like`, no operador `empty`; contraste B08-002.
- Reviewed: `packages/containerhub-front/src/cruds/TaskMonitorizationCrud.ts` — Página `TasksMonitorizationPage.vue:2,18` y registro `packages/containerhub-front/src/setup/SetupEntities.ts:11,24` consumen singleton; `paginate` filtra y envía orden/búsqueda a `/api/task-monitorizations` (`:15-30`), y metadatos dejan la entidad en lectura (`:32-78`). Límite: `TaskMonitorizationRoutes.ts:8-45` restringe consulta a `DOCKER_VIEW` y limita a 100; test de ruta `TaskMonitorizationRoutes.test.ts:49-81` ejercita validación con Mongo simulado; sin prueba frontal directa del proveedor localizada.
- Reviewed: `packages/containerhub-front/src/providers/TaskMonitorizationApi.ts` — `fetchTaskMonitorizations` (`:23-25`) es un adaptador de lectura con defaults 1/20 hacia la misma ruta anterior; la búsqueda en `packages/containerhub-front/src` sólo localizó su definición, ningún llamador. Contrato paralelo de respuesta/tipo (`:3-21`) a `TaskMonitorizationCrud.ts:5-13`; backend `TaskMonitorizationRoutes.ts:29-40`. Sin test propio localizado; el test de ruta citado verifica el endpoint, no este adaptador. No se presume uso externo ausente.

## Hallazgos

### B08-001 — manifestación frontend de B03-001, no contar dos veces — media — comprobado
- Evidencia: `packages/containerhub-front/src/pages/MonitoringHistoryPage.vue:66-85,90-99` pide hasta 500 muestras, usa la última recibida como «actual» y no pagina; `packages/containerhub-back/src/modules/monitoring/services/MonitoringSampleService.ts:21-25` devuelve **las primeras** muestras ordenadas `sampledAt asc` con ese límite. Flujo: botón historial `MonitoringPage.vue:29,117` → GET `MonitoringRoutes.ts:69-74` → `history` → gráficas/tabla. Con más muestras que el límite, la más reciente queda fuera: «actual» y gráficos representan una ventana antigua; las muestras nuevas no se alcanzan desde esta vista sin acotar fechas.
- Contraste: `MonitoringHistory.test.ts:55-68` cubre pocas muestras y `MonitoringHistoryPage.test.ts:5-19` sólo patrones de fuente; ninguna prueba del umbral >500. Tests consultados ejecutados, véase abajo; no se reprodujo UI con una serie larga.
- Intervención mínima sugerida: véase B03-001; resolver la ventana en el proveedor compartido y conservar el orden ascendente visible. Este ID describe el efecto en UI del mismo origen, no una segunda acción independiente.

### B08-002 — filtro `empty` descartado — media — comprobado
- Evidencia: `packages/containerhub-front/src/cruds/MonitoringFilters.ts:3-5` elimina cualquier filtro con `value === null`, aunque `operator === 'empty'`; `MonitoringCrud.ts:21-30` serializa sólo los restantes. El backend acepta `{field:'status',operator:'empty',value:null}` en `MonitoringRoutes.ts:18-26`; `Monitoring.test.ts:67-68` confirma respuesta 200. Flujo: filtro dinámico `MonitoringPage.vue:18-20` → proveedor → ruta → repositorio; una elección `empty` con valor `null` queda sin efecto en la petición. Comprobación aislada real del helper con ese filtro y otro `eq`: la salida contenía sólo `eq`.
- Contraste: `MonitoringCrud.test.ts:5-15` comprueba descarte de `null` para operadores con valor, pero no `empty`; no hay prueba E2E de la selección en Drax, por lo que no se afirma su presentación exacta.
- Intervención mínima sugerida: conservar `operator === 'empty'` cuando el campo exista; añadir una aserción del helper que capture `empty/null` junto a un filtro inactivo.

### B08-003 — error de recarga deja muestras previas visibles — baja — comprobado
- Evidencia: `packages/containerhub-front/src/pages/MonitoringHistoryPage.vue:90-103` limpia sólo `error` al inicio y asigna nuevas muestras sólo tras dos GET exitosos (`:94-99`); en `catch` conserva `samples` y `configuration` anteriores. El template muestra simultáneamente el error y los gráficos/tabla antiguos (`:11,19-36`), aunque los campos `since`/`until`/`limit` pueden haber cambiado (`:13-17`). Flujo: aplicar rango → `load` → error de transporte o parseo → visualización residual, susceptible de confundirse con resultados del rango nuevo.
- Contraste: `MonitoringHistoryPage.test.ts:5-19` no ejercita fallo tras carga exitosa; test backend `MonitoringHistory.test.ts:60-64` sólo cubre acceso/lectura sin fallo de recarga. Sin verificación de experiencia UI.
- Intervención mínima sugerida: ocultar o vaciar resultados al fallar la consulta, o etiquetarlos explícitamente como datos de la última consulta exitosa; prueba de éxito→fallo.

### B08-004 — adaptador de tareas redundante sin consumidor local — baja — comprobado
- Evidencia: `packages/containerhub-front/src/providers/TaskMonitorizationApi.ts:3-25` repite el tipo y consulta de `packages/containerhub-front/src/cruds/TaskMonitorizationCrud.ts:5-29`; la búsqueda en `packages/containerhub-front/src` sólo halla definición de `fetchTaskMonitorizations`, mientras la página y `SetupEntities.ts:11,24` usan el CRUD. Impacto concreto: dos contratos locales del mismo endpoint pueden divergir sin test ni consumidor visible del primero.
- Contraste: `TaskMonitorizationRoutes.test.ts:49-81` prueba la ruta, no el adaptador; ninguna prueba que importe `fetchTaskMonitorizations` localizada. Certeza limitada al árbol frontend inspeccionado, no a consumidores ajenos al repo.
- Intervención mínima sugerida: si no existe consumidor externo, eliminar el adaptador y su tipo duplicado; no crear una nueva capa compartida.

## Fortalezas comprobadas

- El backend valida permisos por operación independientemente de los botones/guardas del frontend (`MonitoringRoutes.ts:43-53,75-92`; `Monitoring.test.ts:34-44,73-84`); lectura de muestras exige `DOCKER_VIEW` (`MonitoringHistory.test.ts:60-64`).
- Formulario de creación usa controles nativos de fecha y reglas locales (`MonitoringPage.vue:48-55`), con validación definitiva de intervalo/tipo en `MonitoringSchema.ts:3-18`; la selección múltiple informa creados/omitidos (`MonitoringPage.vue:132-143`, `MonitoringService.ts:11-36`).
- Los adaptadores separan configuración, historial de muestras y ciclo de vida de tareas; `TaskMonitorizationCrud.ts:62-75` evita acciones de escritura para un endpoint de sólo lectura.

## Límites y pruebas consultadas

- Lectura estática completa de los siete archivos B08, llamadores/callees locales y rutas/servicios backend citados. Grafo MCP `stale_graph` (`8bb3bd45…` frente a HEAD `94910fc7…`): no se usó para inferir relaciones; búsquedas de fuente y tests prevalecen.
- Ejecución aislada con Node v22.22.3, `--import tsx`, sin Docker ni UI: frontend `MonitoringHistoryPage.test.ts`, `MonitoringCrud.test.ts`, `DynamicFilterFields.test.ts`, `ServicesPermission.test.ts` → **7/7 tests pasan**; backend `Monitoring.test.ts`, `MonitoringHistory.test.ts`, `TaskMonitorizationRoutes.test.ts` con `--experimental-test-module-mocks` → **5/5 tests pasan**. El backend usó SQLite temporal e inyección Fastify/Mongo simulado; estos resultados no prueban navegador, Swarm ni Mongo real. Se consultó además `MonitoringWorker.test.ts:11-81` sin ejecutarlo.
- No se ejecutó build ni infraestructura. Hallazgos de UI son inferencias de flujo estático salvo la comprobación aislada de B08-002; no se atribuye a la UI una política de polling o retención: colección y poda residen en `MonitoringCollector.ts:20-45,54-60` y `MonitoringSampleService.ts:28-48`.

## Sesiones de revisión

- 2026-09-23, HEAD `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`: lectura completa de siete fuentes, recorrido a backend, tests anteriores y comprobación del filtro. Inventario no actualizado por restricción de alcance.

## Próximos archivos / preguntas

- Al coordinar el cierre, sincronizar las siete filas B08 en `../inventory.tsv` con hash SHA-256 y commit realmente verificados; hasta entonces **no declarar la tanda cerrada en el índice**. Priorizar prueba del historial >500 y del filtro `empty/null`; contrastar vista en navegador antes de afirmar experiencia real.

## Actualización de hallazgos — 2026-09-28

| ID | Estado vigente | Evidencia actual / límite |
|---|---|---|
| B08-001 | Corregido por B03-001 | El servicio backend devuelve las últimas N en orden visible ascendente (`MonitoringSampleService.ts:21-26`); la vista `MonitoringHistoryPage.vue:68-70` toma ahora una última muestra reciente. Tests SQLite, no render real de una serie larga. |
| B08-002 | Corregido | `cruds/MonitoringFilters.ts:3-5` conserva `operator === 'empty'` incluso con valor nulo; test de helper. |
| B08-003 | Corregido en presentación | `pages/MonitoringHistoryPage.vue:19-37` no muestra gráficos ni tabla cuando `error` está presente, aunque conserva los datos en memoria para poder recargarlos. |
| B08-004 | Eliminado | `providers/TaskMonitorizationApi.ts` ya no existe; la página usa `TaskMonitorizationCrud.ts`. |

`MonitoringCreateDialog.vue` recibe la creación/validación que antes vivía en `MonitoringPage.vue`. Tests y dos Playwright simulados no sustituyen operación real con Docker/worker.
