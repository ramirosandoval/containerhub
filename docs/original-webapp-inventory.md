# Inventario de paridad con la webapp original

**Fuente de producto:** `../docker-fortes/apps/frontend`.  
**Destino:** `packages/containerhub-front` y `packages/containerhub-back`.  
**Actualizado:** 2026-09-01.  
**Regla:** este documento separa evidencia de código de propuestas. Un elemento no se implementa sólo por estar inventariado.

## Estados

- **Listo**: la UI y el contrato necesario existen en ContainerHub.
- **UI pendiente**: el backend actual ya ofrece el contrato; no hace falta ampliarlo.
- **Contrato pendiente**: falta o no equivale el API/stream necesario; no implementar UI todavía.
- **Decisión de producto**: diferencia comprobada, pero no es automáticamente un defecto.

## Prioridad 0 — Services

| ID | Estado | Corrección / hallazgo | Evidencia original | Evidencia actual | Alcance mínimo |
|---|---|---|---|---|---|
| S-01 | **Implementado; UI por verificar** | Precargar Stack con los stacks presentes en los servicios y ordenarlos alfabéticamente. | `StackCombobox.vue:41-52` carga `fetchStack()` y ordena por `name`; `DockerStackService.js:6-24` deriva stacks y contador desde `docker.listServices()`. | `GET /api/services` ya devuelve todos los servicios (`ServiceRoutes.ts:17`); cada modelo contiene `stack` (`mapInspectToServiceModel.ts:24-30`). | Un único preload al entrar a Services; deduplicar valores no vacíos y usar un filtro Drax `select` nativo. Sin endpoint nuevo. |
| S-02 | **Implementado; UI por verificar** | Precargar Imagen con los `image.nameWithTag` únicos de todos los servicios. | `ImageCombobox.vue:40-60` carga todos los servicios y deduplica `image.nameWithTag`. | El mismo campo está en el modelo actual (`mapInspectToServiceModel.ts:31-38`) y `GET /api/services` existe. | Reutilizar la misma respuesta de S-01; no consultar por cada pulsación ni depender de la página actual de 10 filas. |
| S-03 | **Decisión de producto** | El original aplicaba Stack/Imagen inmediatamente y hacía una consulta completa al cambiar Stack; nombre, puertos y fechas se filtraban localmente. | `ServicesPage.vue:49-138, 513-546`. | ContainerHub usa paginación/filtros servidor y botón `FILTRAR` (`ServiceCrud.ts:42-49, 83-90`). | Conservar el límite explícito actual salvo decisión expresa de recuperar filtrado inmediato; no cambiarlo al añadir S-01/S-02. |
| S-04 | **Implementado; API/UI por verificar** | La ordenación de Imagen resuelve explícitamente `image.nameWithTag` antes de comparar. | La tabla original muestra `image.nameWithTag` (`ServicesPage.vue:180-201`). | `ServiceCrud.ts:76`; `ServiceService.ts:24-26,63-64`; prueba focalizada `ServiceService.test.ts`. | Sin cambio de UI ni contrato. Falta comprobar el endpoint autorizado y la tabla con dos imágenes distintas. |
| S-05 | **UI pendiente** | Restaurar la ayuda de puertos cuando haya más de un puerto (lista ampliable/diálogo), si se confirma necesaria. | `ServicePortsVisualization.vue:19-58`; la tabla lo usa en `ServicesPage.vue:176-178`. | El modelo ya entrega todos los puertos (`mapInspectToServiceModel.ts:39-45`); la UI actual sólo los concatena. | Componente visual pequeño sobre el dato existente. No requiere API. |
| S-06 | **Contrato pendiente** | Expansión de servicio a tasks, con logs e inspect de task. | `ServicesPage.vue:242-320, 549-627`. | Hay tasks, stats y logs (`ServiceRoutes.ts:47-57`), pero no hay endpoint REST equivalente a `fetchTaskInspect`; revisar forma/semántica de tasks antes de diseñar UI. | Primero definir un contrato de task/inspect. No reutilizar el expander legacy a ciegas. |
| S-07 | **No migrar** | Restart/eliminar, selección masiva y columna Acciones. | Aunque el slot existe (`ServicesPage.vue:223-239`), la cabecera `actions` está comentada (`ServicesPage.vue:491-502`); por tanto no se renderiza como columna en la web original. | Se eliminó de ContainerHub y `actionHeaders` devuelve `[]` (`ServiceCrud.ts:75-77`). | Mantener ausente salvo requisito nuevo explícito. |
| S-08 | **Implementado; UI por verificar** | Abrir Services contextualizado por Stack desde Stacks. | La ruta original acepta `:stack?` y la página lo inicializa desde el parámetro (`DockerRoutes.js:37-44`; `ServicesPage.vue:485-508`). | La ruta actual sólo es `/services` (`router/index.ts:14-18`), aunque backend ya filtra `stack` por label (`ServiceService.ts:13-21`). | Añadir query o parámetro sólo junto con D-01; sincronizarlo con el selector S-01. |
| S-09 | **Verificar contrato** | Filtros de rango de fechas. | El original aplica rangos inclusivos por día en el cliente (`ServicesPage.vue:405-465`). | El CRUD declara `range`, pero backend sólo compara `gte`/`lte` (`ServiceCrud.ts:88-89`; `ServiceService.ts:32-37`). | Probar que la versión instalada de Drax convierte `range` antes de afirmar paridad; no cambiar filtros sin esa evidencia. |

### Nota de escala para S-01/S-02

El original ya cargaba la lista completa para obtener imágenes. Reutilizar `GET /api/services` mantiene esa semántica. Si el número de servicios hace costosa esa carga, el siguiente escalón sería un endpoint de facetas (`stacks`, `images`); no crear ese endpoint preventivamente.

## Prioridad 1 — Pantallas cuyo backend ya existe

| ID | Estado | Pantalla/flujo original | Evidencia original | Evidencia actual | Alcance mínimo |
|---|---|---|---|---|---|
| D-01 | **Implementado; API/UI por verificar** | Stacks: listado y enlace a Services filtrado por stack. | Ruta `/docker/stacks` y enlace a Services (`DockerRoutes.js:27-44`; `StacksPage.vue:65`). | Servicios completos ya disponibles en `/api/services`; falta ruta y página frontend. | Lista derivada de servicios con contador; enlazar a `/services` con filtro o query sólo si se decide preservar navegación por stack. |
| D-02 | **Implementado; API/UI por verificar** | Nodes. | Ruta `/docker/nodes` (`DockerRoutes.js:47-55`); tabla en `NodesPage.vue`. | `GET /api/docker/nodes` (`ServiceRoutes.ts:60`). | Página de sólo lectura contra el endpoint existente. |
| D-03 | **Implementado; API/UI por verificar** | Networks. | Ruta `/docker/networks` (`DockerRoutes.js:57-65`); tabla y filtros en `NetworksPage.vue`, `NetworkFilters.vue`. | Listado, detalle y mutaciones están expuestos (`ServiceRoutes.ts:63-73`). | Migrar primero listado/filtros; mutaciones sólo si se confirman como alcance. |
| D-04 | **Implementado; API/UI por verificar** | Ghost containers. | Ruta `/docker/ghostContainers/` (`DockerRoutes.js:151-159`). | `GET /api/docker/ghostContainers` (`ServiceRoutes.ts:61`). | Tabla de sólo lectura; validar primero el formato de respuesta real. |
| D-05 | **Implementado; API/UI por verificar** | Registry images y tags. | Ruta `/registry/images` (`RegistryRoutes.js:1-7`); tabla/tags en `ImagesPage.vue:5-21`. | `GET /api/registry/image` y `/api/registry/image/tags` (`RegistryRoutes.ts:9-10`). | Página de imágenes con chips/selector de tags, sin contrato nuevo. |
| D-06 | **Implementado; API/UI por verificar** | GitLab projects y tags. | Ruta `/gitlab/projects` (`GitlabRoutes.js:1-7`); paginación y tags en `ProjectsPage.vue:5-21`. | `GET /api/gitlab/project` y `/:id/tags` (`GitLabRoutes.ts:9-10`). | Página paginada; adaptar `total` al contrato REST real antes de UI. |
| D-07 | **Implementado; UI por verificar** | Menú Docker/Monitorización y enlaces a las pantallas ya migrables. | `menu-config.js:10-73`. | `App.vue:48` contiene únicamente Services, pese a endpoints ya disponibles. | Ampliar menú sólo al migrar cada página; no enlaces a rutas inexistentes. |

## Global — proteger y no reimplementar

| ID | Estado | Hallazgo | Evidencia original | Evidencia actual | Alcance mínimo |
|---|---|---|---|---|---|
| G-01 | **Implementado; UI por verificar** | El guard de Services autentica pero no comprueba `DOCKER_VIEW` en la ruta. | Las rutas Docker declaran permiso y el guard lo verifica (`DockerRoutes.js:37-44`; `router/index.js:32-47`). | `/services` sólo declara `requiresAuth`, y el guard sólo valida sesión (`containerhub-front/src/router/index.ts:14-18,33-42`). El backend sigue protegido. | Antes de escribir guard local, localizar el mecanismo Drax ya instalado o aplicar la convención actual de forma centralizada; verificar con un usuario sin permiso. |
| G-02 | **Verificar Drax** | Los errores REST no tienen manejo observable propio en `src`. | Apollo centralizaba errores y snackbar (`docker-fortes/apps/frontend/src/apollo/index.js:9-35`; `ErrorSnackbar.vue:3-12`). | Services llama el cliente REST directamente (`ServiceCrud.ts:37-49`). | Inspeccionar primero interceptor/notificación de `@drax/common-front`; no añadir `try/catch` dispersos por página. |
| G-03 | **Decisión de producto** | `meta.title` actual no se consume. | El router original actualiza título/favicon (`router/index.js:15-30`). | Services define `meta.title`, sin consumidor en `containerhub-front/src` (`router/index.ts:17`). | Eliminar metadato muerto o restaurar un hook global sólo si título dinámico sigue siendo requisito. |

## Prioridad 2 — Requieren contrato o integración adicional

| ID | Estado | Flujo original | Evidencia | Bloqueo comprobado |
|---|---|---|---|---|
| C-01 | **Contrato pendiente** | Docker version. | `/docker/version` (`DockerRoutes.js:17-25`); provider `DockerProvider.js:35-39`. | No hay ruta equivalente entre las rutas Fastify actuales. |
| C-02 | **Contrato pendiente** | Web terminal. | `/docker/terminal/:taskId/:terminal` (`DockerRoutes.js:67-75`). | No hay endpoint ni canal de terminal/sockets actual. |
| C-03 | **Contrato pendiente** | Cluster visualizer e información agregada. | `/docker/cluster-information` (`DockerRoutes.js:78-87`); resolvers originales `fetchNodeAndTasks` y `dockerNodesServicesAndTasksQuantity` (`DockerResolvers.js:147-150,57-60`). | No hay equivalentes Fastify actuales. |
| C-04 | **Contrato pendiente** | Estadísticas por contenedor/nodo. | Ruta `ContainerStatisticsPage` (`DockerRoutes.js:89-98`); resolver original `fetchContainerStatistics` (`DockerResolvers.js:194-199`). | No hay ruta REST equivalente ni integración de agente Docker actual. |
| C-05 | **Contrato pendiente** | Monitorización de servicios: alta, pausa/reanudar, borrado y detalle. | Rutas `MonitoringServicesPage`/detalle (`DockerRoutes.js:100-117`) y resolvers/mutaciones (`DockerResolvers.js:201-217,255-280`). | No hay módulo/rutas Fastify de configuración de monitorización. |
| C-06 | **Contrato pendiente** | Inspect específico de task. | Ruta `/docker/inspect/:taskId` (`DockerRoutes.js:130-139`); resolver original `fetchTaskInspect` (`DockerResolvers.js:124-129`). | No hay endpoint REST equivalente. |
| C-07 | **Contrato pendiente** | Logs por task con filtros legacy. | Ruta `/docker/logs/:taskId` (`DockerRoutes.js:120-128`); query `serviceTaskLogs` (`DockerResolvers.js:157-160`). | Existe REST de logs por stack+service (`ServiceRoutes.ts:54-58`), pero no un contrato equivalente por task/filtros. |
| C-08 | **Contrato pendiente** | Contacto con Docker agent y contenedores por nodo. | Provider/resolvers originales (`DockerProvider.js:13-27`; `DockerResolvers.js:43-55`). | No hay ruta Fastify equivalente. |

## Rutas originales auditadas

- **Base:** `/`, `/home`, `/about`, `/server-status`, `/server-timeout`, `/error-sample` (`modules/base/routes/index.js:7-57`). No se consideran deuda de Docker sin una decisión de producto; ContainerHub redirige `/` a Services (`router/index.ts:6`).
- **Docker:** versión, stacks, services, nodes, networks, terminal, cluster, estadísticas, monitorización, logs, inspect, tasks y ghost containers (`modules/docker/routes/DockerRoutes.js:15-159`).
- **Registry:** imágenes (`modules/registry/routes/RegistryRoutes.js:1-7`).
- **GitLab:** proyectos (`modules/gitlab/routes/GitlabRoutes.js:1-7`).
- **Administración de terceros:** usuarios, roles, auditoría, settings y customization provienen de paquetes Dracul referenciados por el menú original (`menu-config.js:76-132`); no se inventaría su paridad aquí porque no pertenecen a módulos locales de Docker/Registry/GitLab.

## Ya verificado en ContainerHub

- Login, redirect a ruta protegida, persistencia tras recarga y logout desde perfil/drawer: comprobado en navegador.
- Services: datos, búsqueda, filtros de texto/fecha, paginación y ausencia de columna Acciones: comprobado en navegador.
- Compilación frontend: `vue-tsc --noEmit` y `vite build` exitosos tras la corrección de Services.

## Orden de trabajo recomendado

1. **S-01 + S-02** juntos: una sola carga de servicios y dos selects nativos; validar visualmente opciones, clear y filtro servidor.
2. **S-04**: corregir o desactivar la ordenación de Imagen.
3. **D-01, D-02, D-04**: páginas read-only respaldadas por API existente.
4. **D-03, D-05, D-06**: una página por vez, verificando primero contrato REST real.
5. **C-01 a C-08**: acordar contrato por flujo antes de abrir UI.
