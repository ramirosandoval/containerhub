# OpenAPI and Dockerode Typing Implementation Plan

> **For Hermes:** Execute task-by-task with TDD. This checkout has no `.git`; do not initialize Git, commit, or push.

**Goal:** Publish an authenticated REST OpenAPI/Swagger UI and replace the local Dockerode `any` shim with the installed upstream type surface, preserving current Docker behavior.

**Architecture:** Register Fastify Swagger and Swagger UI in `YogaFastifyServerFactory.ts` before any route registration, then add documentation-only JSON schemas to ContainerHub-owned REST routes. Keep the existing service-layer validation policy: `YogaFastifyServer.ts` currently makes Fastify's validator permissive, so route schemas describe the contract but must not silently become runtime validation. Remove the local Dockerode declaration only after a focused type spike proves that the real `@types/dockerode` module shape compiles under this ESM configuration; type Docker boundary values at the mapper/service seam rather than inventing a wrapper SDK.

**Tech Stack:** Fastify 5.8, `@fastify/swagger`, `@fastify/swagger-ui`, GraphQL Yoga, Dockerode 4.0, `@types/dockerode` 4.0, TypeScript strict.

**Priority:** P0 — execute Swagger bootstrap and Dockerode typing spike before further feature migration.

---

## Current evidence

- `packages/containerhub-back/package.json:19,28` already includes `dockerode@^4.0.2` and `@types/dockerode@^4.0.1`.
- `packages/containerhub-back/src/shims/dockerode.d.ts` shadows that package with an incomplete default export and `any` for all Docker inputs/outputs.
- `packages/containerhub-back/src/modules/services/services/ServiceService.ts` is the only local Dockerode consumer.
- `packages/containerhub-back/src/factories/YogaFastifyServerFactory.ts:10-18` is the single REST composition point. It registers local and Drax routes after auth hooks.
- Local Service, Registry, and GitLab routes currently omit Fastify schemas. Drax identity routes already pass schemas to Fastify.
- Swagger must be registered before routes to discover them ([Fastify Swagger — Usage](https://github.com/fastify/fastify-swagger#usage)); dynamic mode generates the OpenAPI document from route schemas ([Fastify Swagger — dynamic mode](https://github.com/fastify/fastify-swagger#register-options)).
- Dockerode documents `listServices` as the Docker Engine Service List operation ([Dockerode README](https://github.com/apocas/dockerode#dockerode-modem-methods)); model fields and semantics remain governed by the [Docker Engine API](https://docs.docker.com/reference/api/engine/).

## Non-goals

- Do not generate a second API client, replace GraphQL Yoga, or document the GraphQL endpoint through Swagger.
- Do not expose secrets, authorization values, Docker socket paths, raw Docker inspect payloads, or undocumented mutating behavior in examples.
- Do not change Fastify request validation behavior as part of adding API documentation.
- Do not type unrelated GitLab/Registry HTTP integrations in this pass.
- Do not create a generic nested-path utility or Docker wrapper/factory.

## Task 1: Establish an OpenAPI and type-safety baseline

**Objective:** Capture the current route inventory and compile baseline before changing dependencies or declarations.

**Files:**
- Read: `packages/containerhub-back/src/factories/YogaFastifyServerFactory.ts`
- Read: `packages/containerhub-back/src/servers/YogaFastifyServer.ts`
- Read: `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts`
- Read: `packages/containerhub-back/src/modules/registry/routes/RegistryRoutes.ts`
- Read: `packages/containerhub-back/src/modules/gitlab/routes/GitLabRoutes.ts`
- Read: `packages/containerhub-back/src/shims/dockerode.d.ts`

**Step 1: Build baseline**

Run:

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build:back
```

Expected: succeeds before the dependency/type changes.

**Step 2: Record generated route coverage target**

Use Fastify's `server.fastify.swagger()` after plugin registration in the future test to assert that these owned route groups appear: `/api/services`, `/api/docker/*`, `/api/registry/*`, `/api/gitlab/*`. Treat Drax identity route coverage as observed integration coverage, not a contract to edit in `node_modules`.

**Done when:** baseline build is recorded and the documentation scope is limited to REST routes.

## Task 2: Add Swagger dependencies and a spec smoke test

**Objective:** Install the two Fastify plugins and prove a generated OpenAPI object exists before adding UI or per-route schemas.

**Files:**
- Modify: `packages/containerhub-back/package.json`
- Modify: `package-lock.json`
- Create: `packages/containerhub-back/src/factories/__tests__/YogaFastifyServerFactory.test.ts`

**Step 1: Write the failing test**

Instantiate the server factory, await `fastify.ready()`, call `fastify.swagger()`, then assert:

```ts
assert.equal(document.openapi, '3.0.3')
assert.ok(document.paths['/api/services'])
assert.deepEqual(document.components?.securitySchemes?.bearerAuth, {
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT'
})
```

Close Fastify in `finally`; do not call Docker or bind a TCP port.

**Step 2: Run the focused test**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH \
node --import tsx --test src/factories/__tests__/YogaFastifyServerFactory.test.ts
```

Expected: RED because `fastify.swagger` is absent.

**Step 3: Install only the required plugins**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH \
npm install -w @containerhub/back @fastify/swagger @fastify/swagger-ui
```

Do not add an OpenAPI generator, client generator, or schema framework.

**Step 4: Register the plugins before every route**

In `packages/containerhub-back/src/factories/YogaFastifyServerFactory.ts`, after constructing `server` and before `UserRoutes`/local routes:

```ts
await server.fastify.register(swagger, {
    openapi: {
        openapi: '3.0.3',
        info: {title: 'ContainerHub API', version: '0.1.0'},
        components: {
            securitySchemes: {
                bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}
            }
        }
    }
})
await server.fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {docExpansion: 'list', deepLinking: false}
})
```

Apply a global OpenAPI security requirement only after verifying the unauthenticated endpoints (if any) in the generated document. Otherwise place `security: [{bearerAuth: []}]` only on protected local route schemas.

**Step 5: Run the focused test GREEN**

Run the Task 2 command. Expected: one passing spec test with no Docker call.

**Done when:** OpenAPI is generated in memory with the API title/version and bearer scheme, before route registration.

## Task 3: Document ContainerHub-owned REST schemas without changing validation

**Objective:** Make the Swagger document useful for the REST endpoints ContainerHub owns.

**Files:**
- Create: `packages/containerhub-back/src/modules/services/routes/ServiceRouteSchemas.ts`
- Create: `packages/containerhub-back/src/modules/registry/routes/RegistryRouteSchemas.ts`
- Create: `packages/containerhub-back/src/modules/gitlab/routes/GitLabRouteSchemas.ts`
- Modify: `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts`
- Modify: `packages/containerhub-back/src/modules/registry/routes/RegistryRoutes.ts`
- Modify: `packages/containerhub-back/src/modules/gitlab/routes/GitLabRoutes.ts`
- Test: `packages/containerhub-back/src/factories/__tests__/YogaFastifyServerFactory.test.ts`

**Step 1: Expand the failing spec test**

Assert exact documentation facts rather than response examples:

```ts
assert.equal(document.paths['/api/services/paginate'].get?.security?.[0]?.bearerAuth?.length, 0)
assert.equal(document.paths['/api/services/paginate'].get?.parameters?.some(({name}) => name === 'orderBy'), true)
assert.equal(document.paths['/api/docker/service/{service}'].delete?.responses?.['200']?.description, 'Service removed')
```

Also assert routes marked as sensitive/mutating have a bearer security declaration and no example includes an authorization header.

**Step 2: Add small JSON-schema constants per route module**

Use plain Fastify JSON schema objects, matching installed Drax route conventions. Start with Services, then Registry, then GitLab:

- Services: `page`, `limit`, `orderBy`, `order`, `search`, `filters`; service identifier path parameters; documented responses for health, list, paginate, restart/remove, task stats/logs, nodes, networks, and filesystem operations.
- Registry: documented query parameters and response envelope/arrays actually returned by the service.
- GitLab: documented `page`, `per_page`, project id, and tag response shape actually returned by the service.

Use reusable DTO definitions only where one concrete response is used by more than one route (for example `ServiceSummary` used by `/api/services` and pagination items). Do not model raw Docker inspect responses unless the endpoint returns them unchanged.

**Step 3: Attach schemas only as Fastify route options**

Example shape:

```ts
fastify.get('/api/services/paginate', {
    ...protectedRoute(DockerPermissions.View),
    schema: serviceRouteSchemas.paginate
}, async (request) => { /* existing handler unchanged */ })
```

Keep `YogaFastifyServer.ts:11` unchanged in this task. The current permissive validator is an explicit architecture choice; documentation must not create a surprise runtime rejection.

**Step 4: Run focused spec test GREEN**

Run the Task 2 test command. Expected: schemas appear at the real route paths with auth and parameters.

**Done when:** every ContainerHub-owned REST route in the three modules has a summary, security declaration where protected, typed parameters/body where applicable, and at least one declared response.

## Task 4: Verify Swagger UI and the emitted OpenAPI document at runtime

**Objective:** Verify the docs route is present and protected API calls retain their authorization boundary.

**Files:**
- Test: `packages/containerhub-back/src/factories/__tests__/YogaFastifyServerFactory.test.ts`
- No application code unless Task 3 reveals missing schema wiring.

**Step 1: Add injection checks**

Using `fastify.inject`, assert:

```ts
const documentation = await fastify.inject({method: 'GET', url: '/documentation'})
assert.equal(documentation.statusCode, 200)

const services = await fastify.inject({method: 'GET', url: '/api/services'})
assert.notEqual(services.statusCode, 200)
```

The second assertion proves the documentation registration did not bypass the existing JWT/RBAC boundary. It must not require Docker access.

**Step 2: Run focused test**

Run the Task 2 command. Expected: documentation route returns HTML and unauthenticated REST remains blocked.

**Step 3: Live verification**

Start the backend with its normal environment, then:

```bash
curl -fsS http://127.0.0.1:<port>/documentation -o /dev/null -w '%{http_code}\n'
curl -fsS http://127.0.0.1:<port>/documentation/json | python3 -m json.tool >/dev/null
```

Expected: UI 200; JSON parses and contains `/api/services/paginate`. Verify in a browser that the Swagger UI lists route groups; invoke only a safe, authorized GET endpoint with a non-secret user session. Do not paste a token into a ticket, source, shell history, or plan output.

**Done when:** repository injection tests, live spec endpoint, and browser rendering are each recorded separately.

## Task 5: Replace the Dockerode shim with upstream types through a focused spike

**Objective:** Determine the smallest ESM-safe import/typing shape supported by the installed `@types/dockerode`, before removing the shim.

**Files:**
- Modify: `packages/containerhub-back/src/modules/services/services/ServiceService.ts`
- Delete: `packages/containerhub-back/src/shims/dockerode.d.ts`
- Create: `packages/containerhub-back/src/modules/services/services/__tests__/DockerodeTypes.test.ts`

**Step 1: Write a compile-oriented test fixture**

Use the upstream Dockerode namespace types for fields ContainerHub maps and consumes: service list/inspect, task list/inspect, node list, network list, container stats, and service update warnings. The test only needs to typecheck a fixture; it must not connect to Docker.

Start with an ESM-safe default import under the existing `esModuleInterop` and `allowSyntheticDefaultImports` settings:

```ts
import Docker from 'dockerode'
import type {ServiceInspectInfo} from 'dockerode'
```

If the package does not expose the desired named type, import the namespace type in the exact shape supported by `@types/dockerode`; do not recreate it locally.

**Step 2: Confirm the test is RED**

Temporarily remove the shim in the working change and run:

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build:back
```

Expected: type errors identify the actual incompatibilities currently hidden by the shim. Record them before changing production annotations.

**Step 3: Delete the shim and type Docker boundaries minimally**

Replace only Docker-specific `any` values in `ServiceService.ts` and `mapInspectToServiceModel.ts` with upstream Dockerode types that are actually available. Keep application DTOs (`Service`, paginated result, REST input) local because they are ContainerHub contracts, not Docker SDK contracts.

Specific targets:

- `docker.listServices()` result and mapper input.
- `docker.getService(...).inspect()` result used by `toServiceSpec` and restart/update.
- task, node, network, and container calls where the upstream type is concrete.
- Docker list filter/options objects.

Leave a narrow `unknown` plus runtime field check where upstream Dockerode definitions truly expose `any` (for example some swarm `Service.inspect()` methods in the installed type package). Do not retain broad `any` merely for convenience.

**Step 4: Keep runtime import behavior unchanged**

The emitted JavaScript must still use the working default Docker import. Confirm the backend starts and can call the existing safe service health endpoint after the type-only change.

**Step 5: Run build GREEN**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build:back
```

Expected: no `dockerode.d.ts` shim and no new TypeScript errors.

**Done when:** the local shim is deleted, the build passes, Docker boundary declarations use upstream types where supplied, and unavoidable upstream `any` is isolated and documented by code shape—not duplicated declarations.

## Task 6: Prove typed Docker mapping and real Docker behavior separately

**Objective:** Ensure types did not alter the Docker-to-ContainerHub mapping or runtime service behavior.

**Files:**
- Modify/Test: `packages/containerhub-back/src/modules/services/helpers/__tests__/mapInspectToServiceModel.test.ts`
- Test: `packages/containerhub-back/src/modules/services/services/__tests__/DockerodeTypes.test.ts`

**Step 1: Add mapper fixtures with upstream-compatible Docker objects**

Cover at least service id/name, stack label, image with tag, published ports, and nullable dates. Name fixtures semantically (`serviceInspectWithPublishedPort`, not `data` or `item`).

**Step 2: RED then GREEN**

Run the focused mapper and type fixture tests with Node + `tsx`; first demonstrate the mapping assertion fails when a mapped field is removed, then restore the minimal mapping and demonstrate GREEN.

**Step 3: Authorized API verification**

Against a real Docker daemon and an authorized session, call the existing service endpoint and verify:

- HTTP authorization remains required;
- mapped `id`, `name`, `stack`, `image.nameWithTag`, and `ports` retain their current shape;
- `/api/services/paginate?orderBy=image.nameWithTag&order=asc` remains ordered.

Do not treat the mapper fixture as API proof or API proof as browser proof.

**Done when:** repository mapping tests, authorized REST observations, and browser Services table observations agree on the same data shape.

## Task 7: Final verification and inventory update

**Objective:** Produce reviewable proof and update the migration inventory without claiming untested coverage.

**Files:**
- Modify: `docs/original-webapp-inventory.md` only if Docker typing or OpenAPI work changes an existing item’s factual status.
- No changes to generated `dist/` unless the repository already tracks build output.

**Step 1: Run repository checks**

```bash
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH npm run build:back
PATH=/home/ramiro/.nvm/versions/node/v22.22.3/bin:$PATH node --import tsx --test \
  src/factories/__tests__/YogaFastifyServerFactory.test.ts \
  src/modules/services/services/__tests__/DockerodeTypes.test.ts \
  src/modules/services/helpers/__tests__/mapInspectToServiceModel.test.ts
```

**Step 2: Check OpenAPI consistency**

Parse `/documentation/json`; assert no ContainerHub-owned route has an undocumented operation, and no protected local route lacks the bearer security declaration.

**Step 3: Separate final evidence**

Report distinctly:

- **Repository:** exact tests and backend build.
- **API:** documentation JSON, auth rejection, authorized safe GET, and Docker mapping.
- **Browser:** Swagger UI renders; Services still lists and sorts Image.

**Done when:** all three evidence classes are recorded independently and any unavailable authorized/browser verification is explicitly labeled unavailable.

## Risks and decisions

1. **Swagger schemas vs validation:** Fastify Swagger derives docs from schemas, but ContainerHub deliberately bypasses Fastify validation. Keep that policy during this priority pass; enabling validation requires a separate product/security decision and endpoint-by-endpoint compatibility tests.
2. **Drax identity routes:** they already carry schemas. Their generated coverage must be inspected, but vendor routes are not modified; local routes are the documentation ownership boundary.
3. **Dockerode type completeness:** the installed `@types/dockerode` has useful top-level methods but some Swarm service/task definitions remain broad. Prefer upstream types plus narrow local runtime checks, never a new shadow declaration file.
4. **Swagger UI exposure:** `/documentation` must be intentionally public as documentation; its protected operations must remain protected. If production policy requires docs behind authentication, add that as an explicit separate requirement rather than accidentally inheriting API auth hooks.
5. **No hidden runtime migration:** Swagger and types are documentation/compile-time changes. Docker operations, route URLs, permissions, and error semantics remain unchanged unless a failing focused test proves a compatibility fix is necessary.

## References

- Official Fastify Swagger plugin: [usage and registration order](https://github.com/fastify/fastify-swagger#usage), [dynamic schema generation](https://github.com/fastify/fastify-swagger#register-options).
- Official Fastify Swagger UI plugin: [README](https://github.com/fastify/fastify-swagger-ui#readme).
- Dockerode: [README method reference](https://github.com/apocas/dockerode#dockerode-modem-methods).
- Docker Engine API: [Service endpoints](https://docs.docker.com/reference/api/engine/version/v1.52/#tag/Service).
