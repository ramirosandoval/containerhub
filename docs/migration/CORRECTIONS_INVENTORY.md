# Inventario de correcciones pendientes

**Alcance:** working tree de `main` contra `8d77b33a7fe6a4646bce3c663bdaa700de0ae345`.
**Actualizado:** 2026-09-15.
**Regla:** este archivo registra defectos comprobados y su cierre mínimo; no convierte propuestas de producto en alcance.

## Estados

- **PENDIENTE:** defecto confirmado, todavía sin corregir.
- **EN CURSO:** corrección iniciada, aún sin prueba completa.
- **CORREGIDO:** cambio aplicado con la comprobación indicada.
- **DESCARTADO:** el supuesto no era un defecto; conservar la razón.

## Prioridad 0 — bloqueante

| ID | Estado | Corrección | Evidencia | Cierre mínimo | Comprobación |
|---|---|---|---|---|---|
| COR-001 | **CORREGIDO** | Corregir el import ESM de `SettingsService`. | El import sin `.js` reproducía `ERR_MODULE_NOT_FOUND`; `packages/containerhub-back/src/modules/settings/services/SettingsService.ts:1` ahora usa `../models/Settings.js` e `import type`. | Sin trabajo pendiente. | `npm run build:back` y la importación del factory compilado pasan en Node 22. |

## Prioridad 1 — contratos y flujos rotos

| ID | Estado | Corrección | Evidencia | Cierre mínimo | Comprobación |
|---|---|---|---|---|---|
| COR-002 | **CORREGIDO** | Alinear el servidor Fastify con el patrón real de DraxJS, sin el compilador Ajv2020 propio. | `YogaFastifyServer.ts` usa el compilador no-op de scaffold/Vault; `containerhub-back/package.json` y el workspace lock ya no declaran Ajv/Ajv-formats directamente; `CFG-03` documenta Zod explícito. | Se restauró `setValidatorCompiler(() => () => true)` y se conservaron los schemas OpenAPI; Settings, Service y Task Lifecycle siguen validando antes de Mongo/Docker. | RED: la regresión del servidor obtuvo 400 bajo Ajv cuando esperaba paso sin coerción. GREEN: 12/12 pruebas focalizadas; rutas reales de Settings, Service y Task Lifecycle devolvieron `ValidationError` 422 sin efectos; OpenAPI siguió publicado. Suite backend: 84 pass, 1 skip. `npm ci --dry-run`, build backend e import ESM compilado correctos. |
| COR-003 | **CORREGIDO** | Restaurar validación Zod en los límites de dominio de las rutas propias. | `SettingsService.ts:5-9,36-44` valida enteros positivos antes de Mongoose; `ServiceService.ts:66-122,443-466` define los contratos create/update y ejecuta `parseAsync` antes de inspeccionar o mutar Docker; `TaskMonitorizationRoutes.ts:8-38` valida/coacciona la paginación antes de consultar Mongo. Los errores Zod se convierten con `ZodErrorToValidationError` y las rutas propias usan `CommonController`; Settings/Service publican bodies OpenAPI 3.0 en sus rutas. | Se añadieron sólo los schemas de los tres inputs y regresiones focalizadas: `SettingsService.test.ts`, `ServiceCreate.test.ts`, `ServiceUpdate.test.ts`, `TaskMonitorizationRoutes.test.ts` y las aserciones OpenAPI en `YogaFastifyServerFactory.test.ts`. | RED: las cuatro regresiones fallaron antes de la implementación. GREEN: 10/10 pruebas focalizadas; suite backend completa 83 pass, 1 skip; `npm run build:back` e import ESM de `dist/factories/YogaFastifyServerFactory.js` correctos en Node 22. |
| COR-004 | **CORREGIDO** | Hacer coherente Settings con el motor configurado. | El stack usa SQLite en `docker-compose.yml:13-14`; `SettingsService.getSettings()` devuelve defaults para SQLite (`SettingsService.ts:8-17`) pero `updateSettings()` siempre usa Mongoose (`:29-40`). El probe SQLite terminó en timeout de `settings.findOne()` tras 10009 ms. | Usar el repository/patrón multi-engine ya existente o declarar y aplicar Mongo como requisito; no simular lectura SQLite si la escritura no existe. | GET y PUT reales contra cada motor soportado, con lectura posterior que demuestre persistencia. |
| COR-005 | **CORREGIDO** | Registrar o retirar completamente Task Lifecycle Monitoring. | Frontend expone ruta/menú y llama `/api/task-monitorizations`, pero `YogaFastifyServerFactory.ts:112-123` no registra `TaskMonitorizationRoutes`; el probe devuelve 404. | Registrar el plugin sólo después de COR-004/COR-006, o retirar temporalmente ruta, menú y arranque del manager. | API autorizada deja de devolver 404 y la pantalla consume datos reales, no un mock. |
| COR-006 | **CORREGIDO** | Corregir persistencia y retención de Task Lifecycle. | `TaskMonitorizationManager.ts:41-52,129-175` y `TaskMonitorizationRoutes.ts:18-25` dependen directamente de Mongoose aunque el stack soporta SQLite. Además, cargar con `limit(max)` antes de purgar deja para siempre los documentos antiguos que quedaron fuera de memoria. | Reutilizar el store soportado y hacer la retención sobre la colección completa, no sólo sobre el slice cargado en memoria. | Prueba real con más de `max` registros, reinicio del proceso y ambos motores declarados como soportados. |
| COR-007 | **CORREGIDO** | Registrar las APIs Identity correspondientes a las pantallas expuestas. | El frontend monta `IdentityRoutes` y muestra sesiones/fallos de login, pero el backend registra sólo `UserRoutes`, `RoleRoutes` y `TenantRoutes` en `YogaFastifyServerFactory.ts:112-114`. `/api/user-sessions` y `/api/user-login-fails` devuelven 404; API keys queda en la misma situación. | Montar sólo las rutas UI aprobadas y registrar exactamente sus plugins backend Drax. | Probar cada navegación con usuario autorizado y comprobar API 200/403, nunca 404. |
| COR-008 | **CORREGIDO** | Unificar el origen público y el origen permitido del terminal. | `docker-compose.yml:21` permite `http://127.0.0.1:18080`, pero `:41-45` publica `9998`; `TerminalRoutes.ts:39-47` exige coincidencia exacta. README también indica 18080 (`README.md:101-114`). | Elegir una sola URL efectiva y usarla en puerto publicado, documentación y `TERMINAL_ALLOWED_ORIGIN`. | Terminal real desde la URL publicada, mediante teclado físico, en manager y worker remoto aplicable. |
| COR-009 | **CORREGIDO** | Cumplir la garantía de auditoría durable para mutaciones de servicios. | `ServiceMutationAudit.ts:42-47` absorbe fallos; create/update/restart/delete ya ejecutaron Docker antes de auditar (`ServiceService.ts:463-499,523-527`). Contradice `MIGRATION_ORDER.md:24-26,180-183`. | No devolver éxito silencioso sin registro durable; reutilizar el mecanismo Drax existente y definir una respuesta veraz si Docker tuvo éxito pero la auditoría falló. | Inyectar fallo de persistencia y verificar que respuesta/estado no afirman auditoría durable inexistente. |

## Prioridad 2 — datos o estado incorrectos

| ID | Estado | Corrección | Evidencia | Cierre mínimo | Comprobación |
|---|---|---|---|---|---|
| COR-010 | **CORREGIDO** | Corregir atribución `modifiedBy` de Task Lifecycle. | Las auditorías se escriben como `UPDATE`, `RESTART`, `DELETE` (`ServiceService.ts:480,498,526`), pero `TaskMonitorizationManager.ts:139-144` busca `Update`, `Restart`, `Delete`. | Reutilizar las mismas constantes/valores de acción ya usados al escribir. | Una mutación auditada seguida de monitorización conserva el usuario esperado. |
| COR-011 | **CORREGIDO** | Normalizar la tarea en estadísticas. | Backend entrega tarea Docker cruda con `NodeID` (`ServiceService.ts:708-720`); frontend consume `task.nodeId` (`taskStatistics.ts:9`, `TaskStatisticsPage.vue:11`). | Aplicar el normalizador de task ya existente en el límite REST. | Respuesta API y subtítulo UI muestran el node ID real. |
| COR-012 | **CORREGIDO** | No marcar al manager como agente caído cuando el stack sólo despliega agentes en workers. | Restricción `node.role == worker` en `docker-compose.yml:73-79`; `fetchNodes()` consulta todos los nodos (`ServiceService.ts:878-898`) y `NodesPage.vue:7` pinta `false` como alerta. | Representar “no aplica” por separado de “worker esperado pero caído”. | Manager sin alerta falsa; worker sano/caído conserva estados distintos. |

## Prioridad 3 — prevención y limpieza

| ID | Estado | Corrección | Evidencia | Cierre mínimo | Comprobación |
|---|---|---|---|---|---|
| COR-013 | **CORREGIDO** | Añadir un gate mínimo del runtime compilado. | El build backend sólo importa `GraphQLSchema.js`; los tests fuente pasan con `tsx` aunque `dist` no arranca. El E2E de settings intercepta GET/PUT completos. | Añadir un smoke que importe o arranque el entrypoint compilado y cerrar el servidor; incluirlo en el comando de verificación existente. | El smoke falla con COR-001 sin corregir y pasa después. |
| COR-014 | **CORREGIDO** | Limpiar artefactos accidentales del cambio. | `.idea/git_toolbox_prj.xml` y `.idea/vcs.xml` están staged; `git diff --check` marca whitespace en `YogaFastifyServerFactory.ts:121,123`. | Retirar sólo artefactos no intencionales y whitespace. | `git diff --check HEAD` limpio y revisión explícita de los staged files. |

## Orden mínimo recomendado

1. COR-003 y después COR-002; no desactivar Ajv antes de que las rutas propias validen con Zod.
2. COR-004, COR-006 y COR-005.
3. COR-007, COR-008 y COR-009.
4. COR-010 a COR-014.
