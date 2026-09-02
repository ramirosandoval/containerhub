# ContainerHub Drax Migration Implementation Plan

> **For Hermes:** Implement this plan task-by-task, preserving the current Drax integrations rather than recreating them.

**Goal:** Make the authentication and authenticated landing flow reliable first, then migrate only backend capabilities that have a defined contract to Drax-native UI.

**Architecture:** Keep Drax responsible for auth state, token header removal, identity components, CRUD state and table rendering. ContainerHub supplies only its route policy, the authenticated shell and its domain-specific REST contracts. The root route remains a protected landing that takes the user to the existing Services page; do not invent a dashboard without an aggregate API/product requirement.

**Tech stack:** Vue 3, Vue Router, Pinia persisted state, Vuetify, `@drax/identity-vue`, `@drax/common-vue`, `@drax/crud-vue`, Fastify.

---

## Current facts

- `packages/containerhub-front/src/router/index.ts` registers the login route as `login`.
- `@drax/identity-vue` `useAuth().logout()` clears the HTTP authorization header and Pinia auth state, then navigates by `{name: 'Login'}`. The mismatched route name is the root cause of logout navigation failure.
- The imported Drax `LoginPage` renders Registration and Password Recovery links, but ContainerHub does not register their routes.
- `/` currently redirects to `/services`; Services is the only frontend domain page. It is the appropriate authenticated index for now.
- The current Drax shell in `src/App.vue` already provides app bar, temporary drawer, identity header, Services menu and logout UI.
- Backend routes available beyond Services are Registry Images and GitLab Projects. There are no ContainerHub frontend pages for them. The remaining Docker pages exist only in `docker-fortes`, not in this app.

## Phase 1 — authentication and protected index (implement first)

### Task 1: Add a local minimal login page with only supported actions

**Objective:** Keep Drax login/auth behavior but remove UI links that currently navigate to nonexistent local routes.

**Files:**
- Create: `packages/containerhub-front/src/pages/LoginPage.vue`

**Implementation:**

Render Drax `IdentityLogin` without `recovery` or `register` props, so both use their default `false` values. On `loginSuccess`, use `router.replace()` to navigate to the validated `redirect` query value or `/services`.

```vue
<script setup lang="ts">
import {IdentityLogin} from '@drax/identity-vue'
import {useRoute, useRouter} from 'vue-router'

const route = useRoute()
const router = useRouter()

function onLoginSuccess(): void {
    const redirect = route.query.redirect
    const destination = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/services'
    void router.replace(destination)
}
</script>

<template>
    <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
            <v-col cols="12" lg="5" md="6" sm="8">
                <h2 class="pb-10 text-center">ContainerHub</h2>
                <identity-login @login-success="onLoginSuccess"/>
            </v-col>
        </v-row>
    </v-container>
</template>
```

**Why this is the minimum:** it reuses Drax `IdentityLogin`; it only removes links to routes this app does not support. Do not add registration, password recovery, profile or tenant-switching routes unless those workflows are explicitly required.

### Task 2: Align route names with Drax logout and enforce public/private navigation

**Objective:** Make login, refresh, direct protected URLs and logout deterministic.

**Files:**
- Modify: `packages/containerhub-front/src/router/index.ts`

**Steps:**

1. Replace the `LoginPage` import from `@drax/identity-vue` with the local lazy page import.
2. Name `/login` exactly `Login`, which is the route name Drax `useAuth().logout()` targets.
3. Keep `/services` protected and add an explicit protected root/index route that redirects to Services after the guard. Do not create a fake dashboard.
4. Replace every internal guard target `{name: 'login'}` with `{name: 'Login'}`.
5. In the `beforeEach` guard:
   - if a route with `requiresAuth` has no valid user/token, return `{name: 'Login', query: {redirect: to.fullPath}}`;
   - if authenticated navigation targets `Login`, return the safe `redirect` query or `/services`;
   - otherwise allow navigation.

Use the existing `authStore.authUser`, `authStore.accessToken`, and `AuthHelper.isJWTValid()` check. Do not introduce a second auth store or a new token decoder.

### Task 3: Preserve existing logout behavior and test both shell entry points

**Objective:** Prove that the Drax logout call now clears session and lands on `/login` from both user actions.

**Files:**
- Modify only if necessary: `packages/containerhub-front/src/App.vue`
- No new production test fixture is required; this is a route-name compatibility correction.

**Steps:**

1. Leave `const {logout} = useAuth()` in place: Drax already removes the REST Authorization header and clears persisted auth state before routing.
2. Verify the drawer footer and top-right profile-menu buttons both call the same `logout` function.
3. Do not add a duplicate local logout handler.

### Task 4: Verify Phase 1 end-to-end in a browser

**Objective:** Establish actual user-facing proof, not only a passing build.

**Checks:**

1. Open `/services` with cleared persisted auth state. Expected: `/login?redirect=/services`.
2. Log in with a valid existing account. Expected: `/services`, visible authenticated app bar/drawer and Docker data.
3. Refresh `/services`. Expected: remains on Services while the persisted JWT is valid.
4. Open the drawer and use **Salir**. Expected: URL `/login`; the login form is shown, not an identity profile.
5. Log in again, use the top-right profile menu **Salir**. Expected: same `/login` result.
6. Use browser Back after logout. Expected: router guard returns to login; Services never becomes visible without a valid auth user and JWT.
7. Build: `npm run build` in `packages/containerhub-front` using the configured Node binary if `node` is not in `PATH`.

## Phase 2 — stabilize the authenticated shell

### Task 5: Keep the current Drax shell as the only app layout

**Files:**
- Modify only when a real navigation item is introduced: `packages/containerhub-front/src/App.vue`
- Modify translations with every new visible menu label: `packages/containerhub-front/src/locales/messages.ts`

**Rules:**

- Reuse `IdentityProfileView`, `IdentityProfileAvatar` and `SidebarMenu` already in the app.
- Add a drawer item only when its route and working screen land together.
- Keep the logout footer fixed and the top profile menu available.
- Do not copy `docker-fortes` layout components or create a second menu/store/theme system.

**Verification:** Navigate every visible menu item, open/close the drawer at desktop and narrow viewport, and verify logout remains reachable.

## Phase 3 — finish the existing Services migration

### Task 6: Preserve the completed Drax list contract and operations

**Files:**
- `packages/containerhub-front/src/cruds/ServiceCrud.ts`
- `packages/containerhub-front/src/pages/services/ServicesPage.vue`
- `packages/containerhub-back/src/modules/services/services/ServiceService.ts`
- `packages/containerhub-back/src/modules/services/routes/ServiceRoutes.ts`

**Rules:**

- Keep `EntityCrud` + `CrudListTable` + REST pagination. Do not reintroduce a local HTTP plugin, domain store or custom paginated table.
- Keep backend pagination returning `{items, total}` and applying `page`, `limit`, `orderBy`, `order`, `search`, `filters` before slicing.
- Keep only the existing supported Docker actions (refresh, restart, remove). Do not add selection/batch UI until Drax’s table exposes selection or the requirement explicitly justifies a tailored list component.

**Verification:** Browser-proof one search and one non-name filter against Docker data; verify an unauthenticated request gets 401; run frontend build and backend typecheck.

## Phase 4 — migrate the two currently exposed backend domains, one at a time

### Task 7: Contract audit before Registry Images UI

**Files to inspect/likely modify:**
- `packages/containerhub-back/src/modules/registry/routes/RegistryRoutes.ts`
- `packages/containerhub-back/src/modules/registry/services/RegistryService.ts`
- Create only after contract exists: `packages/containerhub-front/src/cruds/RegistryImageCrud.ts`
- Create only after contract exists: `packages/containerhub-front/src/pages/registry/RegistryImagesPage.vue`
- Modify when screen lands: router, `App.vue`, translations

**Decision gate:** `GET /api/registry/image` currently uses `rows` and is not demonstrated to return the Drax `{items,total}` contract. First decide, from live response, whether it can support server pagination. If yes, adapt the backend contract and use `EntityCrud` + `CrudListTable`. If no, stop and request a product decision; do not silently add client-side pagination.

### Task 8: Contract audit before GitLab Projects UI

**Files to inspect/likely modify:**
- `packages/containerhub-back/src/modules/gitlab/routes/GitLabRoutes.ts`
- `packages/containerhub-back/src/modules/gitlab/services/GitLabService.ts`
- Create only after contract exists: `packages/containerhub-front/src/cruds/GitLabProjectCrud.ts`
- Create only after contract exists: `packages/containerhub-front/src/pages/gitlab/GitLabProjectsPage.vue`
- Modify when screen lands: router, `App.vue`, translations

**Decision gate:** normalize GitLab’s `page`/`per_page` upstream response to the same `{items,total}` Drax pagination contract, including authenticated permission handling, before building a page. Reuse `CrudListTable`; retain tags as a detail action/slot only if the live endpoint confirms the data shape.

**Per-domain verification:** build, browser navigation through the new drawer item, one real filter/pagination request, unauthenticated 401 proof, and permission-denied behavior where available.

## Phase 5 — Docker capabilities absent from ContainerHub

### Task 9: Inventory before any port from `docker-fortes`

**Input reference:** `~/dockerway/docker-fortes/apps/frontend/src/modules/docker/`.

**Candidate legacy areas:** Nodes, Stacks, Networks, Tasks/logs, monitoring, web terminal, cluster/version information and container statistics.

**Process for each candidate:**

1. Identify whether `packages/containerhub-back/src` already has a protected route and a stable response contract.
2. If absent, add the smallest backend endpoint only after the user selects that capability; do not migrate a Vue page just because it exists in the legacy app.
3. For ordinary lists, normalize to Drax pagination first and use `EntityCrud` + `CrudListTable`.
4. For live terminal/log/chart features, use a tailored page only where the generic CRUD list is not semantically sufficient; reuse Drax shell/auth/i18n instead of recreating application infrastructure.
5. Add the navigation item in the same change as the working route/page.

## Phase 6 — dependency and removal cleanup

### Task 10: Resolve the backend GraphQL loader dependency before a clean install

**Files:**
- `packages/containerhub-back/package.json`
- `packages/containerhub-back/src/factories/GraphQLSchema.ts`

**Objective:** `GraphQLSchema.ts` imports `@graphql-tools/load-files` and `@graphql-tools/merge`, while the package manifest does not directly declare them. Add direct runtime dependencies only if they are indeed used at runtime; otherwise remove/replace the import in the same focused change. Verify from a clean dependency resolution path and backend typecheck.

### Task 11: Delete only proven redundant local Drax layers

**Files:** determine per domain during each migration.

**Rules:** compare the local behavior to the exact exported Drax symbol before deletion. The existing Services cleanup is the pattern: one `EntityCrud`, one provider boundary, no duplicate store/API plugin. Do not create deletion-only churn for already absent code.

## Completion criteria for the complete migration

1. Login, direct protected navigation, refresh and both logout controls have browser E2E proof.
2. Every visible navigation item maps to an authenticated working route; no UI link targets an unregistered route.
3. Each shipped list domain uses the Drax pagination contract or has an explicit approved reason not to.
4. No frontend page is migrated from `docker-fortes` without a corresponding ContainerHub backend capability and permission check.
5. Frontend build and backend typecheck pass after each domain; UI proof is reported separately from source/build/API proof.

## Explicitly skipped now

- Fake Home dashboard, because no aggregate data/API is defined.
- Registration, password recovery, profile and tenant screens, because their links are presently broken but exposure was not requested; hide them in the local login composition.
- Porting the legacy Docker monitoring/terminal/log screens, because ContainerHub does not currently expose their backend contracts.
- Custom table selection solely for batch actions, because Drax `CrudListTable` does not expose it.
