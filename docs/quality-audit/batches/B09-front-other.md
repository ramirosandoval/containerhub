# B09 — resto frontend

Estado actual: 28 fuentes inventariadas al 2026-09-28. Se retiró `pages/networkFilters.ts`, que sólo tenía un consumidor en tests, no en la página real. Las 29 notas y las líneas siguientes describen el **corte histórico** `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`; los hashes vigentes están en `../inventory.tsv` y el estado de los hallazgos se actualiza al final. La lectura y los hashes no equivalen a tests E2E.

## Flujos y notas por archivo

Rutas abreviadas sólo en las explicaciones: cada línea `Reviewed` conserva la ruta exacta inventariada. Contraste de tests: «lectura» significa inspección de fuente del test; la ejecución selectiva se indica al final. B01–B04 señalan el dueño de la dependencia backend, no una revisión integral de esa tanda.

### Componentes

- Reviewed: packages/containerhub-front/src/components/AnimatedBackground.vue — `:17-22,49-53,152-163`: lo consumen `HomeGallery.vue:29,57` y `LoginPage.vue:29`; color reactivo desde Vuetify a CSS/íconos, sin REST. Sin test específico localizado; revisar accesibilidad del movimiento en UI (no comprobada), no inferir defectos de lógica por longitud del CSS.
- Reviewed: packages/containerhub-front/src/components/AutoCrudFilters.vue — `:6-15,19-40`: `NetworksPage.vue:5` (también páginas B07/B08) delega filtros estáticos/dinámicos a Drax, borra los dinámicos del store y emite `clearFilter` para el consumidor; `ClientProviderFilters.test.ts:10-18` cubre orden de filtrado de proveedores, no este componente. La semántica de `CrudFiltersDynamic` queda fuera del código propio; sin test de interacción del componente.
- Reviewed: packages/containerhub-front/src/components/DockerVersionSummary.vue — `:2-18,29-38`: el pie lateral (`App.vue`) pide `/api/docker/version` mediante `restGet` → `ServiceRoutes.ts:162` → `fetchDockerVersion` B02; `DockerVersionSummary.test.ts:12-19` prueba presencia por lectura de texto, no error de red/render. Véase B09-005.
- Reviewed: packages/containerhub-front/src/components/HomeGallery.vue — `:7,18-65`: `HomePage.vue:2` entrega menú B06; `useMenu` Drax filtra secciones/hijos por permiso y genera `MenuCard`, sin llamadas REST propias. `AuditSection.test.ts:13-23` sólo comprueba el cableado por expresiones; véase B09-004 sobre la clave del fragmento.
- Reviewed: packages/containerhub-front/src/components/RegistryImageDetails.vue — `:55-58,72-129,132-136`: lo monta `RegistryImagesPage.vue:40-45`; `restGet` de tags y detalle → `RegistryRoutes.ts:21-22` → `RegistryService.ts:20-22,39-72` B04; `detailsRequest` impide que una respuesta de detalle anterior sobrescriba la selección vigente. `RegistryImagesPage.test.ts:5-23` sólo verifica fragmentos de fuente, sin probar carreras ni error de red.

### Proveedores CRUD y helpers

- Reviewed: packages/containerhub-front/src/cruds/GhostContainersCrud.ts — `:9-34,36-79`: `GhostContainersPage.vue:2` → Drax `paginate`/CSV → `/api/docker/ghostContainers` → `ServiceRoutes.ts:180` B02; busca, aplica filtros, ordena y pagina en cliente. `ClientProviderFilters.test.ts:10-18` es comprobación textual de filtrado previo al slice; sin test funcional propio del proveedor.
- Reviewed: packages/containerhub-front/src/cruds/GitLabProjectsCrud.ts — `:19-36,38-76`: `GitLabProjectsPage.vue:151-153` → `paginate` con búsqueda/page/per_page → `GitLabRoutes.ts:25` → `fetchProjects` B04; `withClientCsvExport` obtiene páginas, aunque `fetchAll()` devuelve `[]` y no se usa en ese exportador. `GitLabProjectsCrud.test.ts:5-9` prueba sólo búsqueda mediante regex; falta test de exportación del proyecto real.
- Reviewed: packages/containerhub-front/src/cruds/NetworksCrud.ts — `:21-76,78-134`: `NetworksPage.vue:2,37` → `/api/docker/network` → `ServiceRoutes.ts:182`/`fetchNetworks` B02; resuelve nombres de filtro en minúsculas hacia campos Docker, ordena después de filtrar y pagina localmente. `ClientProviderFilters.test.ts:10-18`, `DynamicFilterFields.test.ts:25-35` y `NetworksPage.test.ts:45-62` son estructurales; no ejercitan sort real ni valores anidados. El `any` en `:53-54` por sí solo no fundamenta un fallo.
- Reviewed: packages/containerhub-front/src/cruds/NodesCrud.ts — `:15-40,42-87`: `NodesPage.vue:2,17-25` → `/api/docker/nodes` → `ServiceRoutes.ts:161`/`fetchNodes` B02; búsqueda de campos string, filtro local, sort y slice. `NodesPage.test.ts:8-34` comprueba formato de recursos y slots, `ClientProviderFilters.test.ts:10-18` comprueba texto; no test de paginación del proveedor.
- Reviewed: packages/containerhub-front/src/cruds/RegistryImagesCrud.ts — `:9-37,39-79`: `RegistryImagesPage.vue:68-70` → `/api/registry/image` → `RegistryRoutes.ts:20` B04; busca nombre/tags y pagina catálogo local. `RegistryImagesPage.test.ts:5-23` comprueba estructura, `ClientProviderFilters.test.ts:10-18` comprueba texto; límite upstream de catálogo en B04 (`RegistryService.ts:15-17`), no atribuido al sort local.
- Reviewed: packages/containerhub-front/src/cruds/StacksCrud.ts — `:14-42,44-83`: `StacksPage.vue:2` → `/api/services` → `ServiceRoutes.ts:78`/`fetchService` B02; agrupa `stack` y expone conteos para la navegación a Services B07. `ClientProviderFilters.test.ts:10-18` sólo verifica orden de instrucciones; véase B09-001 (sort numérico) y la duplicación de agregación en `paginate`/`fetchAll` como costo menor, no hallazgo separado.
- Reviewed: packages/containerhub-front/src/cruds/clientCsvExport.ts — `:3-16,18-60`: invocado por seis CRUDs anteriores; recorre `paginate`, exporta ruta anidada, escapa CSV y prefija fórmulas de hoja de cálculo. `clientCsvExport.test.ts:6-38` ejecuta dos páginas, escape/BOM y filtros; no verifica todos los CRUDs reales ni revocación de URL por consumidor Drax.
- Reviewed: packages/containerhub-front/src/cruds/clientFieldFilters.ts — `:5-52,54-67`: lo invocan los cinco proveedores de inventario completo antes del slice; soporta resolución anidada, operadores y `false`. `clientFieldFilters.test.ts:11-48` ejecuta igualdad, booleano, listas, fechas y AND; no se contrastó equivalencia general con Drax/backend para todos los operadores.
- Reviewed: packages/containerhub-front/src/images/registryImageReference.ts — `:14-38`: `ServicesPage.vue:253` B07 y `GitLabProjectsPage.vue:240-243` componen deep links de referencias estructuradas; `serviceImageUsage.ts:18,28-30` reutiliza estas reglas. `registryImageReference.test.ts:5-32` cubre dominio, namespace, prefijo y vacíos. No parsea digests arbitrarios: no es su contrato declarado.
- Reviewed: packages/containerhub-front/src/images/serviceImageUsage.ts — `:15-34`: `RegistryImagesPage.vue:88` indexa servicios por repositorio/tag, `GitLabProjectsPage.vue:236-237` filtra despliegues de un proyecto; ambos reciben `/api/services` B02. `serviceImageUsage.test.ts:11-21` cubre índice y dominios distintos; véase B09-006 para el caso dominio ausente.

### Páginas y auxiliares

- Reviewed: packages/containerhub-front/src/pages/ClusterInformationPage.vue — `:3-27,37-117`: ruta B06 `/cluster` → resumen `/api/docker/cluster` y nodos/tareas `/api/docker/nodes-and-tasks` → `ServiceRoutes.ts:163-179`/`fetchClusterSummary`/`fetchNodeAndTasks` B02; comunica opciones a `RefreshOptions` y datos a `ClusterVisualizer`. Sin test frontend localizado de temporizador o montaje; véase B09-002.
- Reviewed: packages/containerhub-front/src/pages/GhostContainersPage.vue — `:2-20`: monta `GhostContainersCrud`, enlaza nodo sólo con `DOCKER_NODES_FETCH` a `NodesPage`, convierte timestamp en segundos para mostrar fecha; API B02 por proveedor. Sin test específico de página; `GhostContainers.test.ts` backend B02 cubre ruta, no enlace/slot UI.
- Reviewed: packages/containerhub-front/src/pages/GitLabProjectsPage.vue — `:12-128,131-247`: ruta B06 `/gitlab-projects`, lista por `GitLabProjectsCrud` → GitLab B04; expansión carga tags y pipelines mediante `GitLabRoutes.ts:26-27`, y despliegues desde `/api/services` B02; claves por proyecto/tag separan estado en memoria. `GitLabProjectsPage.test.ts:5-31` es textual, no interacción ni carreras; `serviceImageUsage.test.ts:18-21` contrasta emparejamiento.
- Reviewed: packages/containerhub-front/src/pages/HomePage.vue — `:1-8`: ruta `/` B06 filtra home y delega en `HomeGallery.vue:18-65` con permisos Drax; `AuditSection.test.ts:13-23` sólo asegura referencia textual a galería. Sin backend propio ni test de render del menú.
- Reviewed: packages/containerhub-front/src/pages/LoginPage.vue — `:8-24,27-98`: `IdentityLogin` Drax emite éxito, validador de redirección relativa conduce al router B06; toggle Vuetify y fondo no tocan backend propio; autenticación real depende de Drax/B01. `LoginPage.test.ts:11-29` es textual; no equiparar guard de UI con autorización backend.
- Reviewed: packages/containerhub-front/src/pages/NetworksPage.vue — `:2-25,28-53`: ruta B06 `/networks`, `useCrud`/`AutoCrudFilters` alimentan `NetworksCrud.paginate` → `/api/docker/network` B02; selector trata `false` como valor legítimo, fecha usa `formatDateTime`. `NetworksPage.test.ts:23-62` ejercita `networkFilters.ts` pero la página **no lo importa**; controles de página comprobados sólo por regex.
- Reviewed: packages/containerhub-front/src/pages/NodesPage.vue — `:2-27`: ruta B06 `/nodes`, `useCrud(NodesCrud)` busca ID llegado desde Ghost Containers y muestra salud/recursos, API B02; `NodesPage.test.ts:8-34` ejerce `nodeResources` y comprueba texto de slots; sin navegación montada en Vue.
- Reviewed: packages/containerhub-front/src/pages/RegistryImagesPage.vue — `:12-114`: ruta B06 `/registry-images`, `RegistryImagesCrud` → catálogo B04, `RegistryImageDetails` → tags/manifiesto B04, y `/api/services` B02 → helper de uso; sincroniza selección con query. `RegistryImagesPage.test.ts:5-23` es estructural y no prueba cambio de parámetros con instancia reutilizada; véase B09-003.
- Reviewed: packages/containerhub-front/src/pages/StacksPage.vue — `:2-26`: `StacksCrud` agrupa `/api/services` B02, botón enlaza `/services?stack=...` B07 con nombre accesible y unwrap defensivo de `raw`; sin test específico de página; contrato funcional de agrupación no cubierto por test.
- Reviewed: packages/containerhub-front/src/pages/cluster/ClusterVisualizer.vue — `:11-67,74-136`: hijo de `ClusterInformationPage.vue:21-26`; tabla de nodos/tareas recibidas de B02, filtros de tareas running sólo en presentación, colorea estados; sin test frontend localizado. Render de recursos repite conversión que encapsula `nodeResources.ts:3-6` (duplicación menor, no falla acreditada).
- Reviewed: packages/containerhub-front/src/pages/cluster/RefreshOptions.vue — `:8-39,48-57`: hijo de `ClusterInformationPage.vue:19` expone modelo reactivo con intervalo de lista fija y switch; el padre interpreta el valor y agenda; sin test de componente, ni contrato de transporte/backend.
- Reviewed: packages/containerhub-front/src/pages/networkFilters.ts — `:18-58`: convierte fechas locales, mapea filtros Drax y filtra redes; `NetworksPage.test.ts:23-43` ejercita estos helpers, pero `NetworksPage.vue`/`NetworksCrud.ts` usan `applyClientFieldFilters` en su lugar y la búsqueda de consumidores en `src` encontró sólo el test. Es código actualmente sin llamador de producción; no contabilizar sus tests como cobertura del flujo real.
- Reviewed: packages/containerhub-front/src/pages/nodeResources.ts — `:1-6`: lo llama `NodesPage.vue:5` para convertir NanoCPUs/bytes y mostrar ausencia como guion; `NodesPage.test.ts:8-11` ejecuta caso normal y nulo, no valida valores parciales adicionales.
- Reviewed: packages/containerhub-front/src/pages/settings/SettingsPage.vue — `:5-41,44-108`: ruta B06 `/settings` (`SETTINGS_SHOW`) → `SettingsApi.ts:9-16` → `SettingsRoutes.ts:10-29`/`SettingsService.ts:6-32` B04; backend valida enteros positivos y exige `SETTINGS_UPDATE` al guardar. `SettingsService.test.ts:27-52` prueba rechazo backend de cero; sin test frontend localizado de permiso/feedback, véase B09-007.

## Hallazgos

### B09-001 — ordenación numérica de stacks — baja — comprobado
- Evidencia: `packages/containerhub-front/src/pages/StacksPage.vue:2` → `packages/containerhub-front/src/cruds/StacksCrud.ts:24-32`: `services` es número (`:8,21`), pero el sort convierte ambos conteos a string y aplica `localeCompare`; comprobación aislada `node -e` con `[2,10]` devolvió `[10,2]`. Con 2 y 10 servicios, orden ascendente muestra 10 antes de 2.
- Contraste: `packages/containerhub-front/src/cruds/__tests__/ClientProviderFilters.test.ts:10-18` sólo prueba filtrado textual previo al slice; no hay test del sort por conteo. Backend entrega servicios (`ServiceRoutes.ts:78`) y el conteo se calcula aquí, no allí.
- Intervención mínima: comparar numéricamente cuando `orderBy === 'services'`, manteniendo comparación textual para `name`.

### B09-002 — polling reactivado después de desmontar — media — probable
- Evidencia: `packages/containerhub-front/src/pages/ClusterInformationPage.vue:66-77,87-94,115-117`: `onUnmounted` limpia el temporizador existente, pero `loadNodesAndTasks()` que siga pendiente ejecuta su `finally` y vuelve a `scheduleRefresh()` si `autoRefresh` estaba activo; el callback vuelve a llamar al mismo fetch. Flujo ruta `/cluster` → REST B02 `ServiceRoutes.ts:179` → navegación fuera durante una respuesta pendiente.
- Impacto: peticiones de nodos/tareas y timers recurrentes de una página ya desmontada; no se midió frecuencia ni se reprodujo en navegador.
- Contraste: no hay test frontend localizado de ciclo de vida de cluster; `ClusterSummary.test.ts` de backend prueba otro endpoint, no el polling. Intervención mínima: flag de desmontaje que evite reagendar desde `finally` (y limpiar timer al desmontar).

### B09-003 — deep link del registro fijado al primer montaje — media — probable
- Evidencia: `packages/containerhub-front/src/pages/GitLabProjectsPage.vue:240-243` → ruta `registry-images`; `packages/containerhub-front/src/pages/RegistryImagesPage.vue:75-84` captura `route.query.repository/tag` una sola vez en constantes y observa sólo `items`, mientras `:100-113` altera la query al expandir. Si el router reutiliza la instancia para otra URL de la misma ruta, búsqueda/expansión siguen el primer repositorio/tag.
- Impacto: navegación consecutiva proyecto A → proyecto B puede mostrar filtro/selección de A, aun cuando la URL diga B. No se verificó la reutilización en navegador ni se conoce configuración upstream especial del router.
- Contraste: `packages/containerhub-front/src/pages/__tests__/RegistryImagesPage.test.ts:5-23` verifica que aparezcan referencias a `route.query`, no que sean reactivas. Intervención mínima: observar `route.query.repository/tag` y sincronizar `search`, expansión y tag al cambiar.

### B09-004 — clave estática en fragmentos de galería — baja — comprobado
- Evidencia: `packages/containerhub-front/src/pages/HomePage.vue:2` → `packages/containerhub-front/src/components/HomeGallery.vue:20`: `<template v-for="..." key="item.text">` crea la misma clave literal para cada fragmento; las claves dinámicas internas `:key="item.text"` en `:25` y `:54` no sustituyen la del fragmento repetido.
- Impacto: identidad virtual de secciones distintas colisiona al reordenar o cambiar permisos; riesgo de reconciliación incorrecta/aviso de Vue, no se verificó síntoma visible.
- Contraste: `AuditSection.test.ts:13-23` sólo inspecciona referencia a HomePage. Intervención mínima: `:key="item.text"` en el `<template>`.

### B09-005 — fallo de versión sin estado de error — baja — comprobado
- Evidencia: `packages/containerhub-front/src/App.vue` → `packages/containerhub-front/src/components/DockerVersionSummary.vue:7-17,32-38` → `/api/docker/version` (`ServiceRoutes.ts:162`): `finally` apaga `loading` si `restGet` rechaza, pero no hay `catch` ni estado de error; la UI muestra «—» para ambas versiones y la promesa del hook rechaza.
- Impacto: un error de red/permisos es indistinguible de datos ausentes para el usuario; no se afirma crash de Vue. `DockerVersionSummary.test.ts:12-19` comprueba presencia textual, no error.
- Intervención mínima: capturar fallo y mostrar estado de error/reintento en el componente, sin tocar B02.

### B09-006 — emparejamiento de despliegues permite dominio desconocido — baja — probable
- Evidencia: `packages/containerhub-front/src/pages/GitLabProjectsPage.vue:236-237` → `packages/containerhub-front/src/images/serviceImageUsage.ts:27-33`: cuando `registryPrefix` tiene dominio y `service.image.domain` es `null`, la condición `!service.image.domain` acepta el servicio si coincide la ruta; `projectRegistryTarget` identifica el dominio en `registryImageReference.ts:29-37`.
- Impacto: contador/lista de despliegues de un proyecto de registro concreto podría incluir servicio cuya imagen no identifica ese registro. No se comprobó si el backend B02 produce legítimamente ese campo nulo en tal caso; confirmar contrato antes de corregir.
- Contraste: `serviceImageUsage.test.ts:18-21` prueba dominio igual y diferente, no ausente. Intervención mínima condicionada: cuando el proyecto tenga dominio, exigir igualdad explícita, si B02 garantiza representar dominios de imágenes publicadas.

### B09-007 — duplicado de B06-001, no contar como hallazgo independiente — baja — comprobado
- Evidencia: `packages/containerhub-front/src/router/index.ts:107-110` permite ver Settings con `SETTINGS_SHOW`; `packages/containerhub-front/src/pages/settings/SettingsPage.vue:87-98` siempre muestra Guardar → `SettingsApi.ts:14-16` → `SettingsRoutes.ts:18-20`, que requiere `SETTINGS_UPDATE`.
- Impacto: un usuario con sólo `SETTINGS_SHOW` puede editar el formulario y recibe fallo al guardar; no es elevación de privilegios, ya que el backend deniega. Sin test frontend específico; `SettingsService.test.ts:35-52` verifica validación, no ese permiso.
- Intervención mínima: véase B06-001; no abrir dos acciones para el mismo origen. Ocultar/deshabilitar edición y Guardar con `hasPermission('SETTINGS_UPDATE')`, conservando enforcement backend.

## Fortalezas comprobadas

- Proveedores de inventario completo filtran antes de paginar (`NodesCrud.ts:21-35`, `NetworksCrud.ts:45-71`, `StacksCrud.ts:15-32`, etc.); `clientFieldFilters.ts:59-66` conserva `false`, con casos ejecutados (`clientFieldFilters.test.ts:11-48`).
- CSV compartido escapa delimitadores/comillas y neutraliza prefijos de fórmula (`clientCsvExport.ts:11-16,44-50`); dos páginas y BOM fueron ejecutados (`clientCsvExport.test.ts:6-38`). No se propone otra abstracción CRUD.
- `RegistryImageDetails.vue:116-129` protege la respuesta asíncrona de detalle mediante contador de petición; `LoginPage.vue:18-24` no redirige a origen externo; las rutas backend consultadas exigen permisos (`ServiceRoutes.ts:161-182`, `GitLabRoutes.ts:6-27`, `RegistryRoutes.ts:6-22`, `SettingsRoutes.ts:10-29`). Estas propiedades de fuente no equivalen a una prueba de UI en navegador.
- Tipos y helpers de referencia de imagen se reutilizan entre Services B07, GitLab y Registry (`registryImageReference.ts:19-38`, `serviceImageUsage.ts:15-34`), en lugar de repetir parseo de imágenes en cada página.

## Límites y pruebas consultadas

- Grafo `code-review-graph`: `get_minimal_context_tool` devolvió `stale_graph` (indexado `8bb3bd45…`, HEAD `94910fc7…`); **ninguna ausencia de dependencia se infiere del grafo**. Relaciones verificadas en fuentes/imports y búsquedas del árbol `src`; no se auditó Drax ni contratos internos upstream.
- Se leyeron los 29 archivos B09 completos, pruebas frontend relevantes (`ClientProviderFilters`, `DynamicFilterFields`, `GitLabProjectsCrud`, `clientCsvExport`, `clientFieldFilters`, `registryImageReference`, `serviceImageUsage`, `NodesPage`, `NetworksPage`, `GitLabProjectsPage`, `RegistryImagesPage`, `LoginPage`, `DockerVersionSummary`, `AuditSection`) y rutas/servicios backend puntuales B02/B04. Ejecutados estos 14 archivos de tests con `node --import tsx --test ...` desde `packages/containerhub-front`: **26 tests, 26 pass, 0 fail**. Mayormente comprueban texto/regex, no render ni red; helpers CSV/filtros/imágenes/recursos sí ejercitan lógica. Comprobación aislada de orden numérico: `node -e "console.log([2,10].sort((a,b)=>String(a).localeCompare(String(b))))"` → `[ 10, 2 ]`.
- No se ejecutó navegador, Docker, backend integrado, E2E ni mutaciones. B09-002/003 requieren reproducciones de ciclo de vida/router antes de priorizar arreglo; B09-006 requiere contrato del dominio. `networkFilters.ts` sólo tiene llamador en tests de `src` actualmente, por lo que no demuestra cobertura del filtrado de `NetworksCrud`; retirar la ruta muerta sólo tras comprobar consumidores externos si los hubiera.
- Inventario y README quedan deliberadamente intactos por la restricción del encargo: **29 filas B09 siguen `pendiente` pese a esta lectura**; responsable de integración debe decidir el cierre, comparar hashes SHA-256 con esta baseline y actualizar índices antes de afirmar tanda `revisado`.

## Sesiones de revisión

- 2026-09-23, HEAD `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`: 29/29 fuentes B09 leídas, tests selectivos 26/26; informe solamente. Decisión pendiente: reconciliar hashes/estados en inventario desde el proceso coordinador; validar B09-002/003/006 en entorno representativo.

## Próximos archivos / preguntas

- Ningún archivo B09 quedó sin lectura de fuente. Pendiente formal: hashes/estados de las 29 filas en `../inventory.tsv` (fuera de alcance aquí), reproducción UI de B09-002/003 y verificación del dominio nulo B09-006. El informe no certifica cobertura ejecutada de componentes Vue.

## Actualización de hallazgos — 2026-09-28

| ID | Estado vigente | Evidencia actual / límite |
|---|---|---|
| B09-001 | Corregido | `cruds/StacksCrud.ts` ordena conteos numéricos como números; prueba focal de [2,10], no paginador de navegador real. |
| B09-002 | Abierto como riesgo de ciclo de vida | `pages/ClusterInformationPage.vue:66-77,115-117` puede reagendar en `finally` después de desmontarse. Falta reproducción UI; no se afirma fuga medida. |
| B09-003 | Abierto como riesgo de navegación | `pages/RegistryImagesPage.vue:75-84` fija `targetRepository`/`targetTag` en el montaje y sólo observa `items`, no cambios de query al reutilizar instancia. No se reprodujo en router real. |
| B09-004 | Corregido | `components/HomeGallery.vue` usa clave enlazada en el fragmento repetido; no hay colisión literal. |
| B09-005 | Abierto | `components/DockerVersionSummary.vue:32-38` sigue sin rama de error; el rechazo de `restGet` se presenta como valores ausentes. |
| B09-006 | Abierto como hipótesis de contrato | `images/serviceImageUsage.ts:27-33` acepta dominio nulo del servicio aunque el proyecto tenga dominio; falta demostrar que el backend entrega legítimamente ese caso. |
| B09-007 | Corregido por B06-001 | Mismo control de ajustes; no contar como defecto adicional. |

`pages/networkFilters.ts` se retiró porque no tenía consumidor productivo local; los tests de filtros activos se refieren al proveedor real. Build/tipos y **51/51** tests frontend pasaron, sin prueba UI real de B09-002/003.
