# B03 — monitorización backend y persistencia

Estado actual: 24 fuentes inventariadas al 2026-09-28. Las notas de flujo, líneas y resultados de prueba siguientes describen el **corte histórico** `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`; ver actualización de hallazgos al final y hashes en `../inventory.tsv`.

## Flujos comprobados

- Configuraciones: `packages/containerhub-back/src/factories/YogaFastifyServerFactory.ts:141` → `packages/containerhub-back/src/modules/monitoring/routes/MonitoringRoutes.ts:35-93` → `services/MonitoringService.ts:7-41` → `factory/MonitoringServiceFactory.ts:7-18` → repositorios Mongo/SQLite y esquemas. La ruta valida entrada/RBAC y crea por servicio, consulta, pausa/reanuda y elimina configuración más muestras.
- Muestras: `packages/containerhub-back/src/monitoring.ts:5-6` → `services/MonitoringWorker.ts:10-25` → `factory/MonitoringCollectorFactory.ts:8-13` → `services/MonitoringCollector.ts:20-96` → `packages/containerhub-back/src/modules/services/services/ServiceService.ts:734-759` → `services/MonitoringSampleService.ts:12-48` → repositorio de muestras Mongo/SQLite. La lectura HTTP pasa por `MonitoringRoutes.ts:69-74` y `MonitoringSampleService.history`.
- Eventos de tareas (proceso API, distinto del worker de muestras): `packages/containerhub-back/src/index.ts:12` → `services/TaskMonitorizationManager.ts:27-187` → `factory/TaskMonitorizationFactory.ts:16-27` → repositorios de eventos; lectura `routes/TaskMonitorizationRoutes.ts:29-45` → `paginate`. Configuración dinámica vía `packages/containerhub-back/src/modules/settings/services/SettingsService.ts:16-18`.

## Flujos y notas por archivo

Cada `Reviewed` significa **lectura completa del archivo**, no una actualización de `inventory.tsv`. Prefijo común de rutas `packages/containerhub-back/src/modules/monitoring/`; las rutas se escriben completas para permitir cotejo mecánico. Tests indicados al final de cada grupo.

### Composición y contratos

- Reviewed: `packages/containerhub-back/src/modules/monitoring/factory/MonitoringCollectorFactory.ts` — `:7-13`: singleton que conecta servicios y `fetchServiceStats`, parsea métricas antes de entregarlas al collector; invocado por `src/monitoring.ts:6`. Contraste `__tests__/MonitoringCollectorFactory.test.ts:18-42` con fetch simulado.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/factory/MonitoringSampleServiceFactory.ts` — `:6-18`: selección de motor, `build()` sólo para tabla SQLite y cache del servicio que usa `MonitoringRoutes.ts:41` y `MonitoringCollectorFactory.ts:9`; sin test de fábrica de muestras directo, SQLite ejercido en `MonitoringHistory.test.ts:28-76`.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/factory/MonitoringServiceFactory.ts` — `:6-18`: misma selección de repositorio y construcción SQLite para configuraciones; consumidor `MonitoringRoutes.ts:40`/collector; `Monitoring.test.ts:14-101` inyecta servicio, no prueba selector de motor.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/factory/TaskMonitorizationFactory.ts` — `:7-27`: contrato reducido `getRecent/paginate/createDoc/purgeOld` y singleton de repositorio Mongo o SQLite, consumido por manager y ruta; `routes/__tests__/TaskMonitorizationRoutes.test.ts:34-81` cubre variante Mongo simulada y `settings/services/__tests__/SqlitePersistence.test.ts:9-58` SQLite real.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/interfaces/IMonitoring.ts` — `:1-6`: tipos inferidos desde esquemas de configuración usados por `MonitoringService.ts:4-9` y repositorios; `Monitoring.test.ts:34-47` contrasta alta/pausa, no es test de tipos aislado.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/interfaces/IMonitoringSample.ts` — `:1-6`: tipos de métrica y muestra derivados de Zod usados por collector y sample service; `MonitoringHistory.test.ts:15-26,55-68` cubre persistencia de métrica SQLite.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/schemas/MonitoringSchema.ts` — `:3-26`: enumera intervalos, modalidad y validación cruzada de calendario/permanente; entrada `MonitoringRoutes.ts:76`, salida `MonitoringService.ts:9`; `Monitoring.test.ts:79-80,85-94` valida calendario inválido y creación.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/schemas/MonitoringSampleSchema.ts` — `:3-15`: forma de métricas y muestra; `MonitoringCollectorFactory.ts:11` valida las estadísticas y `MonitoringSampleService.ts:9` valida registro/lectura; `MonitoringHistory.test.ts:55-68` prueba muestras válidas, no métricas corruptas.

### Modelos y adaptadores de persistencia

- Reviewed: `packages/containerhub-back/src/modules/monitoring/models/MonitoringModel.ts` — `:5-15`: colección Mongo con `serviceId` único, campos de calendario y plugin de paginación; usado por `repository/MonitoringMongoRepository.ts:8`. SQLite prueba la unicidad/concurrencia en `Monitoring.test.ts:85-94`; Mongo real pendiente.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/models/MonitoringSampleModel.ts` — `:5-12`: índice de `configurationId`, clave única de muestra, fechas y métricas Mixed; enlazado por `MonitoringSampleMongoRepository.ts:8`; sin test Mongo real, contraste funcional SQLite en `MonitoringHistory.test.ts:55-68`.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/models/TaskMonitorization.ts` — `:4-35`: evento tipado running/removed y índice de fecha descendente para lectura/retención; usado por `TaskMonitorizationMongoRepository.ts:12,20,26`; `models/__tests__/TaskMonitorization.test.ts:5-7` sólo verifica existencia de `paginate`.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/MonitoringMongoRepository.ts` — `:5-11`: adapta modelo y campo de búsqueda; seleccionado por `MonitoringServiceFactory.ts:14`; la prueba `Monitoring.test.ts` usa SQLite, no valida consultas Mongo reales.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/MonitoringSampleMongoRepository.ts` — `:5-11`: adapta modelo y búsquedas por servicio/task; seleccionado por `MonitoringSampleServiceFactory.ts:14`; no se ejecutó Mongo.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/MonitoringSampleSqliteRepository.ts` — `:6-22`: tabla de muestras, JSON para métricas y normalización ISO de filtros Date al llamar `find`; callee de `MonitoringSampleService.history/prune`; `MonitoringHistory.test.ts:28-76` prueba registro/retención reales en SQLite.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/MonitoringSqliteRepository.ts` — `:5-17`: tabla `MonitoringConfiguration` con `serviceId` único y campos de calendario/texto; selector `MonitoringServiceFactory.ts:10-12`, `Monitoring.test.ts:14-101` prueba persistencia, búsqueda, filtros y reapertura.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/TaskMonitorizationMongoRepository.ts` — `:4-30`: lista por fecha, inserta y purga por IDs conservados, además del paginador heredado; `TaskMonitorizationManager.ts:48,171,183` consume el contrato; ruta Mongo cubierta con mock en `TaskMonitorizationRoutes.test.ts`, no inserción/retención Mongo real.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/repository/TaskMonitorizationSqliteRepository.ts` — `:6-48`: tabla de eventos, ISO en escritura, orden fecha descendente y purga por límite SQL; `TaskMonitorizationManager.ts:48,171,183` la usa; `SqlitePersistence.test.ts:23-54` verifica crear, filtrar, purgar y reabrir.

### Entrada, comportamiento y ciclos

- Reviewed: `packages/containerhub-back/src/modules/monitoring/routes/MonitoringRoutes.ts` — `:17-33,35-93`: valida query/body/IDs, permisos separados, delega en servicios de configuración y muestras; `Monitoring.test.ts:35-94` prueba respuestas 403/400/404 y CRUD SQLite; `MonitoringHistory.test.ts:60-64` protege muestras.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/routes/TaskMonitorizationRoutes.ts` — `:8-46`: valida paginación/filters antes de `TaskMonitorizationFactory.getRepository().paginate`, exige `DockerPermissions.View`; `routes/__tests__/TaskMonitorizationRoutes.test.ts:49-81` verifica 422 y delegación con Mongo simulado.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/services/MonitoringService.ts` — `:7-41`: valida IDs conocidos, elimina duplicados, crea configuración individual y repara carrera de clave única; callee repositorio a través de `AbstractService`, caller `MonitoringRoutes.ts:75-84`; `Monitoring.test.ts:34-47,85-94` cubre duplicados y carrera SQLite.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/services/MonitoringSampleService.ts` — `:7-49`: compone sampleKey (cuya unicidad impone el repositorio), recupera historial limitado, purga antigüedad de permanentes y borra por configuración en lotes; caller collector `:34,37`/ruta `:73,90`; `MonitoringHistory.test.ts:55-68` prueba recorrido SQLite, no volumen mayor al límite.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/services/MonitoringCollector.ts` — `:8-97`: guardia de reentrada, calendario/intervalos, selección replic/global, fallback por nombre al ID obsoleto y logs de fallo por configuración; `MonitoringHistory.test.ts:28-105` ejercita intervalos/retención/fallback y `MonitoringCollectorLogging.test.ts:21-58` prueba mensajes.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/services/MonitoringWorker.ts` — `:1-25`: arranca collector, mantiene proceso vivo y espera `stop()` al recibir señal; caller `src/monitoring.ts:6`; `MonitoringWorker.test.ts:11-81` prueba señales, espera y arranque aislado.
- Reviewed: `packages/containerhub-back/src/modules/monitoring/services/TaskMonitorizationManager.ts` — `:8-190`: singleton que lee settings, consulta Docker Swarm, compara historial reciente en memoria, graba cambios y purga; caller `src/index.ts:12`, repositorio en `:48,171,183`. No hay prueba directa de comparación del manager con Docker simulado; `SqlitePersistence.test.ts:23-54` sólo cubre repositorio.

## Hallazgos

### B03-001 — historial truncado por el lado antiguo — media — comprobado
- Evidencia: `packages/containerhub-back/src/modules/monitoring/routes/MonitoringRoutes.ts:69-74` → `packages/containerhub-back/src/modules/monitoring/services/MonitoringSampleService.ts:21-26` → `packages/containerhub-back/src/modules/monitoring/repository/MonitoringSampleSqliteRepository.ts:16-18`; `find` de Drax aplica `ORDER BY sampledAt ASC LIMIT`. `packages/containerhub-front/src/pages/MonitoringHistoryPage.vue:66,70,76,94-99` solicita 500 por defecto y toma el último retornado como «actual». Reproducción SQLite con tres muestras y `limit=2`: retornó `00:00:00`, `00:00:01`, omitió la más nueva `00:00:02`.
- Impacto: tras superar el límite, refrescar deja el valor «actual» congelado en una muestra antigua, aunque hay datos posteriores. `MonitoringHistory.test.ts:55-68` sólo cubre tres muestras sin truncamiento.
- Intervención mínima: consultar las **últimas** N (`desc`), invertir los resultados en servicio para preservar el orden ascendente del gráfico; añadir un test de N+1 muestras.

### B03-002 — retención condicionada al muestreo activo — media — probable
- Evidencia: `packages/containerhub-back/src/modules/monitoring/services/MonitoringCollector.ts:26-38,91-96` omite la configuración pausada o fuera de calendario **antes** de invocar `MonitoringSampleService.prune`; `MonitoringSampleService.ts:28-35` sólo borra muestras de modalidad permanente durante esa invocación. Flujo `MonitoringRoutes.ts:79-84` → `MonitoringService.ts:37-40` (pausa) → collector; `MonitoringHistory.test.ts:66-68` llama `prune` directamente, no prueba pausa prolongada.
- Impacto: si `holdingTime` significa retención máxima incluso mientras está pausado, las muestras viejas se acumulan indefinidamente hasta reanudar o borrar la configuración; la semántica de retención en pausa no está probada.
- Intervención mínima: decidir/explicitar contrato; si es retención continua, purgar por configuración permanente en el ciclo incluso cuando `isDue` sea falso y probarlo con reloj controlado.

### B03-003 — borrado no atómico de configuración y muestras — media — probable
- Evidencia: `packages/containerhub-back/src/modules/monitoring/routes/MonitoringRoutes.ts:86-91` hace `service.delete(id)` y **después** `sampleService.deleteForConfiguration(id)`; `MonitoringSampleService.ts:41-47` borra una muestra por vez, sin transacción común. Un collector iniciado con `configurations.fetchAll()` en `MonitoringCollector.ts:26-37` podría escribir tras el borrado. `Monitoring.test.ts:82-84` sólo asegura eliminación de configuración, no limpieza frente a fallo/concurrencia.
- Impacto: ante fallo intermedio o carrera de collector, quedan muestras huérfanas que ya no pueden consultarse por la ruta (ésta exige configuración existente en `MonitoringRoutes.ts:71`); almacenamiento retenido.
- Intervención mínima: no prometer atomicidad entre Mongo/SQLite; coordinar eliminación y escritura por configuración y añadir regresión de fallo/carrera; valorar borrado masivo transaccional sólo si el motor disponible lo soporta.

### B03-004 — ventana de memoria confunde historial con estado actual — media — probable
- Evidencia: `packages/containerhub-back/src/index.ts:12` → `TaskMonitorizationManager.ts:42-53` sólo carga `getRecent(maxQuantity)`; `:110-123` decide si una tarea está corriendo buscando su ID **sólo** en esa lista; `:171-183` agrega eventos y recorta memoria. Los repositorios `TaskMonitorizationMongoRepository.ts:11-13,25-29` / `TaskMonitorizationSqliteRepository.ts:16-19,37-47` conservan los N eventos más nuevos. `SqlitePersistence.test.ts:23-54` prueba purga, no el manager con más tareas vivas que N.
- Impacto: si las tareas simultáneamente activas superan `maxMonitoredTasksQuantity` (o se expulsa un evento running aún activo), en el siguiente ciclo las tareas ausentes parecen nuevas y se insertan eventos running duplicados; la purga puede repetir el proceso. No se verificó con Docker real.
- Intervención mínima: mantener un conjunto separado de IDs actualmente activos obtenido del ciclo anterior, independiente del historial retenido; probar con límite pequeño y más tareas activas.

## Fortalezas comprobadas

- La validación de campos, filtros, límites y permisos está en la entrada (`MonitoringRoutes.ts:17-51`, `TaskMonitorizationRoutes.ts:8-42`); `Monitoring.test.ts:35-38,69-81` y `TaskMonitorizationRoutes.test.ts:49-81` comprueban rechazos, no sólo el camino feliz.
- El límite `IDraxCrudRepository` sirve a dos adaptadores reales y Zod deriva los tipos (`interfaces/IMonitoring.ts:1-6`, `interfaces/IMonitoringSample.ts:1-6`): no hay evidencia para recomendar otra interfaz/clase por SOLID. No se observó jerarquía local para juzgar LSP.
- El collector recibe fetcher inyectado (`MonitoringCollector.ts:14-18`), aísla fallos por configuración (`:29-46`) y espera la recolección al detenerse (`:62-79`); fallback al nombre tras recreación cubierto por `MonitoringHistory.test.ts:78-105`.
- SQLite tiene unicidad de configuración y clave de muestra (`repository/MonitoringSqliteRepository.ts:9-12`, `repository/MonitoringSampleSqliteRepository.ts:11-15`), con carrera de altas de configuración probada en `Monitoring.test.ts:85-94`; la retención SQLite de eventos está probada con reapertura en `SqlitePersistence.test.ts:33-54`.

## Límites y pruebas consultadas

- Grafo MCP: `get_minimal_context_tool` informó `stale_graph` (indexado `8bb3bd45…`, HEAD `94910fc7…`); **no** se usó para inferir relaciones ni ausencia de tests. Se siguieron importaciones/búsquedas y se leyeron fuentes; las implementaciones Drax instaladas de `AbstractService`, `AbstractSqliteRepository` y `AbstractMongoRepository` se consultaron para comprobar delegación, orden y límites, sin atribuir sus defectos al código local.
- Ejecución desde `packages/containerhub-back` con Node 22.22.3 (`nvm`): `node --import tsx --experimental-test-module-mocks --test src/modules/monitoring/__tests__/*.test.ts src/modules/monitoring/models/__tests__/*.test.ts src/modules/monitoring/routes/__tests__/*.test.ts` → **12/12 pasan**; algunas pruebas usan Fastify inject, SQLite temporal en `$TMPDIR`, stubs o mocks. `SqlitePersistence.test.ts` pasó en la ejecución ampliada. Reproducción ad hoc de B03-001 en SQLite temporal confirmó datos devueltos; la primera tentativa con `:memory:` falló porque el constructor de tabla de Drax abre otra conexión, se repitió con archivo temporal y salió bien.
- La ejecución ampliada de 16 pruebas tuvo **14 pass, 2 fail**: `MonitoringWorker.test.ts:44-81` excedió el timeout fijo de 5 s en paralelo y pasó al repetirlo aislado (3/3) y luego en la tanda B03 (12/12); `TaskStats.test.ts:68-98` falló al registrar `ServiceRoutes` por esquema Fastify ajeno a B03 (`FST_ERR_SCH_VALIDATION_BUILD`, «nullable» sin «type»), antes de probar el endpoint. No se oculta ni se atribuye esa falla a B03.
- Sin conexión a Mongo, Swarm/Docker reales, ni pruebas de navegador/carga. Tests Mongo citados usan modelo simulado; no extrapolar paridad de retención ni rendimiento desde SQLite. B03-002/003/004 son inferencias de flujo con escenarios no reproducidos aquí, no fallos funcionales confirmados.

## Sesiones de revisión y pendientes

- 2026-09-23, HEAD `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`: leídas íntegramente las 24 fuentes B03, siete archivos de tests B03 y test SQLite de integración; redactadas notas y hallazgos. **Pendiente** que el agente propietario del inventario registre hashes/estados en `../inventory.tsv` y actualice índice, si autoriza esas escrituras; hasta entonces la tanda sigue parcial en el registro global.
- Pendiente: confirmar contrato de `holdingTime` durante pausa; ejecutar regresiones de B03-001/002/003/004 y Mongo real/Swarm en entorno habilitado antes de elevar escenarios probables a defectos comprobados. No se modificaron código, tests ni servicios.

## Actualización de hallazgos — 2026-09-28

| ID | Estado vigente | Evidencia actual / límite |
|---|---|---|
| B03-001 | Corregido | `modules/monitoring/services/MonitoringSampleService.ts:21-26` selecciona las últimas N muestras en orden descendente y las devuelve ascendentes; `modules/monitoring/__tests__/MonitoringLatestHistory.test.ts` cubre N+1 con SQLite. B08-001 es el mismo origen. |
| B03-002 | Abierto como hipótesis de contrato | La poda de permanentes sigue condicionada al ciclo del collector (`MonitoringCollector.ts` y `MonitoringSampleService.ts:29-36`); no se acordó retención continua mientras una configuración está pausada. |
| B03-003 | Abierto como riesgo condicionado | `MonitoringRoutes.ts` elimina configuración y después muestras (`MonitoringSampleService.ts:38-48`), sin transacción común ni reproducción de la carrera del collector. |
| B03-004 | Abierto como hipótesis | `TaskMonitorizationManager.ts` deriva estado actual de una ventana histórica limitada; no hay escenario probado con más tareas activas que el límite. No presentar la inferencia como incidencia real. |

La suite backend actual pasó con **160 aprobadas, 1 omitida y 0 fallidas** en la ejecución comunicada; Mongo real, worker en Swarm y UI real siguen sin verificar.
