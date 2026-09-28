# Auditoría de calidad de código — ContainerHub

Revisión vigente: 2026-09-28, rama `feature/service-ui-graphql`, código en `f513687acae6bf369edc2284d50882bbbfede34e`. El corte inicial fue `94910fc7f948bfd0b7801e962e0d1243c3b1a10a` (2026-09-23). La revisión de código y su remediación son estados distintos; las secciones históricas de las tandas describen el corte inicial y sus adendas identifican el estado actual.

Alcance: 129 fuentes `.ts`/`.vue` en `packages/*/src/`; se excluyen `__tests__`, `dist`, `node_modules` y dependencias Drax. Los tests son contraste, no parte de este inventario de producción. Respecto del corte anterior: ocho fuentes nuevas, dos retiradas y 24 archivos preexistentes con otro hash.

## Método

Trazar entrada → lógica propia → efecto/dependencia y contrastar tests. Evaluar responsabilidad/cohesión (S), extensibilidad con variantes reales (O), sustitución si existe jerarquía (L), segregación si existen interfaces (I), inversión de dependencias si reduce acoplamiento real (D), POO contextual, nombres, legibilidad, duplicación, errores y testabilidad. Funciones y composición Vue no requieren clases. Tamaño o `any` aislado no bastan para declarar defectos.

Cada hallazgo conserva su ID histórico `Bxx-nnn`; el estado de remediación vigente se indica aparte en cada tanda. Separar fuente, tests aislados, integración y UI. Una corrección verificada en el repositorio no prueba compatibilidad de todos los consumidores externos.

`inventory.tsv`: `revisado` acredita lectura de fuente y SHA256, no corrección de hallazgos ni ejecución de tests; `bloqueado` indica contenido parcialmente enmascarado por la vista de lectura. `review_commit` registra una revisión que contiene los bytes del archivo, no necesariamente el último commit del árbol. `SetupContainerHub.ts` (líneas 22 y 68) y `serviceGraphql.ts` (línea 15) tienen fragmentos enmascarados automáticamente: sus hashes sólo acreditan identidad de bytes, no lectura completa. No se necesitan credenciales ni autorizaciones para ese límite documental.

## Tandas

| Tanda | Informe | Archivos | Estado |
|---|---|---:|---|
| B01 | [batches/B01-back-core.md](batches/B01-back-core.md) | 10 | 9 revisados, 1 bloqueado |
| B02 | [batches/B02-back-services.md](batches/B02-back-services.md) | 17 | revisado |
| B03 | [batches/B03-back-monitoring.md](batches/B03-back-monitoring.md) | 24 | revisado |
| B04 | [batches/B04-back-integrations.md](batches/B04-back-integrations.md) | 10 | revisado |
| B05 | [batches/B05-agent.md](batches/B05-agent.md) | 4 | revisado |
| B06 | [batches/B06-front-core.md](batches/B06-front-core.md) | 15 | revisado |
| B07 | [batches/B07-front-services.md](batches/B07-front-services.md) | 14 | 13 revisados, 1 bloqueado |
| B08 | [batches/B08-front-monitoring.md](batches/B08-front-monitoring.md) | 7 | revisado |
| B09 | [batches/B09-front-other.md](batches/B09-front-other.md) | 28 | revisado |

## Dictamen sobre limpieza y comprensión humana

**Entendible por áreas, pero no uniformemente limpio.** Es posible seguir páginas → transportes/rutas → servicios → repositorios/agente. La fachada Docker sigue siendo amplia, aunque ya delega filtros, specs, decodificación de logs y provisión local en módulos propios (B02); no atribuirle hoy las 1254 líneas ni las ubicaciones del corte original. Longitud no demuestra por sí sola una violación SRP.

**SOLID/POO, aplicados donde corresponde:** monitorización mantiene servicios, esquemas y repositorios separados (B03); settings usa implementaciones Mongo y SQLite reales (B04), sin interfaces vacías para cumplir una consigna. No hay jerarquía propia que fundamente un dictamen LSP general. Vue Composition API y helpers puros son adecuados sin OO forzada. No agregar otra interfaz/factoría por estilo.

**Legibilidad y límites:** el compilador JSON Schema permisivo requiere validación local explícita para cada entrada que la necesite (B01-001); los estados de error/ausencia de logs, tareas y versión siguen confundidos en algunas pantallas (B07/B09). El historial B08-003 ya oculta sus datos al fallar. Parte de los tests frontend sigue comprobando fuente por regex (B06-002), que no demuestra navegación ni interacción. No convertir `any`, longitud o estilo en defectos automáticamente.

Los nueve informes conservan **35 IDs documentales y 33 observaciones distintas**: B08-001 remite a B03-001 y B09-007 a B06-001. Sus adendas actuales registran 19 IDs corregidos/eliminados (incluidos esos dos duplicados), 13 abiertos, dos flujos conservados expresamente por compatibilidad y un riesgo condicionado al despliegue. Un hallazgo probable no es un bug reproducido ni una puntuación SOLID.

### Estado de remediación y límites de decisión

1. **Corregidos en el repositorio:** rutas Registry rechazan entrada inválida con 400, listados Registry/GitLab siguen páginas y GitLab no sigue redirecciones autenticadas; historial devuelve las últimas N muestras; FIFO no bloquea provisión; logs raw conservan UTF-8 entre chunks; filtros de monitorización conservan `empty`; Settings oculta la edición sin permiso; proyectos GitLab no cuentan imágenes sin dominio como despliegues de su registro específico. Ver regresiones y límites de cada tanda (B01–B09).
2. **Aceptados sin cambio funcional ahora:** B02-001 conserva el borrado/recreación de red y B05-002 la escritura in-place con truncado, tal como `docker-fortes`; no confundir riesgo bajo fallos posteriores con incidencias observadas. El usuario decidió no cambiar esos flujos por riesgo de introducir regresiones. No reabrirlos sin defecto concreto reportado.
3. **Pendientes con contrato o entorno:** B01-001 (validación local en rutas cuyo esquema Fastify es documental), B01-002 (transporte Vault según despliegue), B04-004 (total GitLab desconocido), B04-005 (singleton Mongo aún no reproducido) y B03-002/003/004 (retención/carrera/ventana condicionadas). No inventar semántica ni corregir hipótesis como bugs confirmados.
4. **UI y cobertura aún abiertas:** B06-002 (guard probado textualmente), B07-001/002/003 (errores de logs/tareas y límite con permisos separados), B09-002/003/005 (polling, deep link, error de versión). La adenda de cada tanda separa hecho de fuente, escenario condicionado y prueba faltante.

No ejecutar refactors preventivos de SOLID/POO. Corregir fallos nuevos sólo contra un contrato y una reproducción concretos, en la frontera compartida más pequeña.

## Qué está y qué no está verificado

- **Repositorio:** el inventario actual tiene 129 rutas únicas y 129 hashes SHA256 que coinciden con los bytes de trabajo; 127 filas `revisado` y dos `bloqueado` por redacción de lectura, no por permisos. Las notas originales documentan el corte de 2026-09-23; cada adenda registra la disposición actual de todos sus IDs. El grafo MCP estaba desactualizado y no se usó como prueba de ausencia.
- **Pruebas y compilación:** backend **160 aprobadas, 1 omitida, 0 fallidas** tras alinear seis tests con el compilador Fastify de producción; agente **8/8**; frontend **52/52** (nueva regresión B09-006 falló antes de corregir); chequeos de tipos de los tres workspaces y build frontend pasaron en el entorno de pruebas comunicado. Registry **9/9** y GitLab **7/7** focales forman parte de ese contraste, no se suman a la suite backend.
- **API/UI/operación:** dos Playwright con API y sesión simuladas prueban interacción acotada, no login real. No se verificaron Registry/GitLab externos, Mongo real, Swarm, worker remoto, bind mounts ni navegación/autorización de un usuario real; `Fastify.inject`, SQLite y dos servidores HTTP locales son evidencia de sus fronteras específicas, no E2E.

## Reanudación

1. `git status --short --branch && git rev-parse HEAD`.
2. Comparar rutas y SHA256 de `inventory.tsv` contra el árbol, incluidas altas y bajas posteriores. Si cambian, reabrir fila y adenda pertinente; el commit de revisión anterior no garantiza que los bytes sigan vigentes.
3. Leer la adenda vigente de la tanda **antes** de sus «Próximos archivos / preguntas» históricos. No equiparar fuente revisada con defecto corregido ni con E2E.

Plan detallado: `.hermes/plans/2026-09-23_135733-auditoria-calidad-codigo-por-tandas.md`.
