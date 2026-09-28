# B06 — núcleo frontend: shell, transporte, rutas, setup y locales

Estado actual: 15 fuentes inventariadas al 2026-09-28. Las notas de flujo, líneas y resultados de prueba siguientes describen el **corte histórico** `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`; ver actualización de hallazgos al final y hashes en `../inventory.tsv`.

## Flujos y notas por archivo

Entrada `main.ts` → instala Pinia → registra entidades Drax → restaura cabeceras de clientes → instala i18n/Vuetify/router → monta `App.vue`. La navegación usa `navigation.ts` y `router/index.ts`; operaciones propias usan `rest.ts` → `restHeaders.ts` → cliente Drax → rutas backend. La pantalla de ajustes llama `SettingsApi.ts` → `SettingsRoutes.ts`; **las condiciones del router y los menús son UX, no autorización del servidor**.

- Reviewed: `packages/containerhub-front/src/App.vue` — `:3-41,45-68`: `main.ts:13,26` monta el shell; `useAuthStore` decide barra/cajón, `SidebarMenu` consume `navigation.ts:1-34` y `getIconForRouteName` da el icono. El estilo compartido `:70-87` lo inspecciona `router/__tests__/ServicesPermission.test.ts:55-59`; `pages/__tests__/LoginPage.test.ts:27-28` sólo coteja texto fuente. Sin otro hallazgo local.
- Reviewed: `packages/containerhub-front/src/locales/index.ts` — `:1-20`: `plugins/i18n.ts:2-4` llama `buildI18n`; compone Common/Identity/Audit y `messages.ts` con precedencia explícita de los mensajes propios, `es` y fallback `en`. `router/__tests__/AuditSection.test.ts:19-21` sólo verifica inclusión por regex; no test localizado de resolución de claves en runtime. Sin hallazgo local.
- Reviewed: `packages/containerhub-front/src/locales/messages.ts` — `:1-229`: `locales/index.ts:5,16-17` consume los árboles `es/en`; `monitoring.ts:1-24` suministra la rama de monitoreo, y claves como `taskLogs.title` (`:98,212`) las consume `pages/logs/TaskLogsPage.vue:4`. Sin test localizado de paridad/formatos entre idiomas; no se infiere defecto por traducciones editoriales.
- Reviewed: `packages/containerhub-front/src/locales/monitoring.ts` — `:1-24`: `messages.ts:1,4,118` inserta `monitoringEs/monitoringEn`; `router/index.ts:11-16` y `pages/MonitoringPage.vue` consumen esas claves de título/historial. Sin test específico localizado; diccionarios separados por idioma, sin lógica de negocio.
- Reviewed: `packages/containerhub-front/src/main.ts` — `:1-26`: entrada `createApp` → `installPinia` → `setupEntities` antes de `useAuthStore`; configura singleton GraphQL/REST con token persistido y monta el router. `setup/__tests__/SetupEntities.test.ts:25-26` comprueba el orden por regex; `__tests__/viteConfig.test.ts:4-15` comprueba proxy de desarrollo, no sesión real. Sin hallazgo local comprobado sobre autenticación: el proveedor REST Drax actualiza/limpia la cabecera al iniciar/cerrar sesión (`node_modules/@drax/identity-front/src/providers/rest/AuthRestProvider.ts:26-44`).
- Reviewed: `packages/containerhub-front/src/navigation.ts` — `:1-46`: `App.vue:17,51` pasa `menu` al sidebar y `HomePage.vue:2,7` a la galería; `router/index.ts:147-153` reutiliza `getIconForRouteName` para favicon. `router/__tests__/ServicesPermission.test.ts:18-27` y `AuditSection.test.ts:13-22` cotejan permisos/links por regex; no sustituyen guardas ni autorización backend. Sin hallazgo local: el recorrido corto de iconos evita una segunda tabla de rutas.
- Reviewed: `packages/containerhub-front/src/plugins/i18n.ts` — `:1-8`: `main.ts:23` instala la instancia de `locales/index.ts:7-20`, y `router/index.ts:142-145` la usa para `document.title`. `router/__tests__/AuditSection.test.ts:19-21` sólo contrasta el merge de catálogo, no la instalación del plugin. Sin hallazgo local.
- Reviewed: `packages/containerhub-front/src/plugins/pinia.ts` — `:1-10`: `main.ts:14` instala Pinia con persistencia antes de `setupEntities` y de leer `useAuthStore` (`main.ts:15-18`); `setup/__tests__/SetupEntities.test.ts:25-26` confirma el orden de fuente, no rehidratación real. Sin hallazgo local.
- Reviewed: `packages/containerhub-front/src/plugins/vuetify.ts` — `:1-12`: `main.ts:24` instala tema oscuro y mensajes Vuetify en español; `App.vue:48,61,32-36` usa `useTheme` para el cambio visual. `pages/__tests__/LoginPage.test.ts:21-29` verifica presencia de `useTheme` por regex; no test localizado de cambio de tema/idioma en navegador. Sin hallazgo local.
- Reviewed: `packages/containerhub-front/src/providers/SettingsApi.ts` — `:1-17`: `pages/settings/SettingsPage.vue:15-30` llama GET/PUT vía `rest.ts:7-22`; backend `modules/settings/routes/SettingsRoutes.ts:10-29` exige permisos distintos y valida el PUT en `SettingsService.ts:6-10,23-33`. `modules/settings/services/__tests__/SettingsService.test.ts:27-51` cubre 422 en backend; `e2e/settings.spec.ts:10-52` intercepta GET/PUT, **no ejecutado**. Véase B06-001; no implica eludir el servidor.
- Reviewed: `packages/containerhub-front/src/rest.ts` — `:1-23`: clientes de `HttpRestClientFactory` reciben cabecera fresca de `useAuthStore`/`authorizationHeader` por solicitud; `SettingsApi.ts:10-15` y `ServicesPage.vue:224,295` son llamadores concretos. El contrato Drax combina cabeceras base y de solicitud (`node_modules/@drax/common-front/src/clients/HttpRestClient.ts:79-95,110-126,143-160`); `__tests__/rest.test.ts:5-8` sólo ejecuta la función de cabecera, no GET/POST/PUT. Sin hallazgo local funcional comprobado.
- Reviewed: `packages/containerhub-front/src/restHeaders.ts` — `:1-3`: `rest.ts:9,15,21` y `cruds/MonitoringCrud.ts:35` llaman `authorizationHeader`; devuelve Bearer si hay token y `{}` si no. `__tests__/rest.test.ts:5-8` ejecuta ambos casos y pasó; esto no prueba autorización server-side. Sin hallazgo local.
- Reviewed: `packages/containerhub-front/src/router/index.ts` — `:1-180`: `main.ts:25` instala router; rutas propias `:9-118`, adaptación de `IdentityRoutes` `:120-139`, `afterEach` → i18n/iconos `:142-158` y `beforeEach` → JWT/permiso/redirect `:160-180`. `router/__tests__/ServicesPermission.test.ts:18-27`, `AuditSection.test.ts:13-22` y `pages/__tests__/LoginPage.test.ts:11-19` son comprobaciones de texto, no transiciones de router; véase B06-002. La autorización efectiva de ajustes es `SettingsRoutes.ts:10-20`, no este guard.
- Reviewed: `packages/containerhub-front/src/setup/SetupEntities.ts` — `:1-26`: `main.ts:15` llama `setupEntities` después de Pinia; `useEntityStore().setEntities` registra diez CRUD locales/Audit para consumidores Drax. `setup/__tests__/SetupEntities.test.ts:10-26` verifica lista y orden por regex; `router/__tests__/AuditSection.test.ts:17-18` comprueba inclusión Audit. Sin hallazgo local: una lista central es apropiada para registro explícito.
- Reviewed: `packages/containerhub-front/src/shims.d.ts` — `:1-32`: declaraciones de módulos de assets/Vue y `ImportMeta.env` para compilación; `main.ts:19-20` y `rest.ts:5` son consumidores del entorno Vite. `tsconfig.json:14` incluye los `.d.ts`; `__tests__/viteConfig.test.ts:4-15` cubre proxy pero no tipos, sin prueba específica de declaraciones localizada. El `any` del shim Vue no demuestra por sí mismo fallo de tipos ni justifica rediseño.

## Hallazgos

### B06-001 — coherencia de permisos en ajustes — baja — comprobado
- Evidencia/flujo: `packages/containerhub-front/src/navigation.ts:31` y `router/index.ts:107-110` hacen visible `/settings` con `SETTINGS_SHOW`; `providers/SettingsApi.ts:14-15` expone PUT y `pages/settings/SettingsPage.vue:27-35,89-96` ofrece «Guardar» sin comprobar `SETTINGS_UPDATE`. El servidor **sí** exige `SETTINGS_UPDATE` en `packages/containerhub-back/src/modules/settings/routes/SettingsRoutes.ts:18-20` → `SettingsService.ts:23-33`.
- Impacto: un usuario sólo-lectura puede acceder a ajustes y ver un control de guardado que terminará rechazado por el backend; confusión de UX, **no** bypass de autorización. No se ejecutó sesión de ese rol en navegador.
- Contraste: `packages/containerhub-front/e2e/settings.spec.ts:10-52` intercepta PUT con 200 y no cubre rol sólo-lectura; `packages/containerhub-back/src/modules/settings/services/__tests__/SettingsService.test.ts:27-51` valida payload, no la visibilidad del botón.
- Intervención mínima sugerida: deshabilitar u ocultar «Guardar» cuando falte `SETTINGS_UPDATE`, conservando el `preHandler` del servidor; añadir un caso de rol sólo-lectura.

### B06-002 — verificación del guard sólo textual — media — comprobado
- Evidencia/flujo: `packages/containerhub-front/src/router/index.ts:120-139,160-180` transforma metadatos Drax y decide entrada/redirección; `router/__tests__/ServicesPermission.test.ts:18-27` verifica fragmentos con `assert.match` sobre `readFile`, y `pages/__tests__/LoginPage.test.ts:11-19` coteja strings de destino. Ninguna de esas aserciones ejecuta `router.beforeEach` con usuario/token/permisos; `main.ts:25` instala ese router en ejecución real.
- Impacto: una regresión en la decisión o en la composición de rutas podría mantener verdes las regex y cambiar la navegación (login, ruta protegida, sin permiso). Es una brecha de **cobertura**, no prueba de acceso indebido al backend.
- Contraste: los tests citados se ejecutaron y pasaron; `node_modules/@drax/identity-vue/src/routes/IdentityAuthRoutes.ts:9-65` y `IdentityCrudRoutes.ts:6-46` muestran que el mapeo `meta.auth` se consume de verdad, sin atribuir defecto al paquete.
- Intervención mínima sugerida: añadir un test conductual pequeño con router de memoria y store simulado para anónimo, autenticado sin permiso y autenticado con permiso; no duplicar toda la matriz de rutas ni tocar producción sólo por esta brecha.

## Fortalezas comprobadas

- Arranque ordenado: la persistencia de Pinia se instala antes de consultar el usuario y de registrar CRUD (`main.ts:13-25`); el test de setup comprueba esa secuencia a nivel fuente (`setup/__tests__/SetupEntities.test.ts:25-26`).
- La cabecera REST se construye por solicitud desde el token del store (`rest.ts:7-23`, `restHeaders.ts:1-3`), y el helper tiene dos casos ejecutados (`__tests__/rest.test.ts:5-8`).
- Rutas operativas declaran `requiresAuth` y permiso explícito (`router/index.ts:9-118`); backend aplica su propio control en ajustes (`SettingsRoutes.ts:10-20`). No se confunden ambos límites.

## Límites y pruebas consultadas

- Grafo `code-review-graph` consultado primero: `stale_graph`, indexado en `8bb3bd45d64290906588ed93c8bb8187a7e2b60b` frente a HEAD `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`; no se usó para inferir relaciones. Callers/callees contrastados en fuente propia y contratos Drax locales, sin auditar internamente a Drax.
- Ejecutado desde `packages/containerhub-front`: `node --import tsx --test src/__tests__/rest.test.ts src/router/__tests__/ServicesPermission.test.ts src/router/__tests__/AuditSection.test.ts src/setup/__tests__/SetupEntities.test.ts src/pages/__tests__/LoginPage.test.ts src/__tests__/viteConfig.test.ts` → **10 tests, 10 pasados, 0 fallos**. No se corrieron Playwright, build ni backend, ni se comprobó UI real; tests de navegación/setup son mayormente regex sobre fuente.
- No hay dictamen global SOLID/POO por ausencia de jerarquía propia relevante en estos archivos: el shell y las funciones de composición no requieren clases. No se marcaron como defectos el tamaño de catálogos ni las aserciones de tipos sin impacto demostrado.

## Sesiones de revisión

- 2026-09-23, HEAD `94910fc7f948bfd0b7801e962e0d1243c3b1a10a`: 15/15 archivos B06 leídos íntegramente; informe de fuente completo. La actualización de estado/hashes de `inventory.tsv` y del índice README corresponde al agente coordinador, pues esta delegación permite modificar **sólo** este informe.

## Próximos archivos / preguntas

- Ningún archivo B06 sin leer. Pendiente coordinación documental del inventario y, si se aprueba después, pruebas conductuales/rol para B06-001 y B06-002. No se cambió código productivo.

## Actualización de hallazgos — 2026-09-28

| ID | Estado vigente | Evidencia actual / límite |
|---|---|---|
| B06-001 | Corregido | `pages/settings/SettingsPage.vue:6-7,63-103` hace el formulario sólo-lectura y oculta Guardar sin `SETTINGS_UPDATE`; el servidor conserva su comprobación independiente. Sin sesión de rol real verificada. |
| B06-002 | Abierto como brecha de cobertura | `router/index.ts` sigue probado principalmente por aserciones de texto en los tests de guard, no por transiciones de router con roles. No es evidencia de bypass de backend. |

El frontend actual pasó **51/51** tests y build/chequeo de tipos. Dos escenarios Playwright con API y sesión simuladas no equivalen a login ni autorizaciones reales.
