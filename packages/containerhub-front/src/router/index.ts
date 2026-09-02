import {useAuthStore} from '@drax/identity-vue'
import {AuthHelper} from '@drax/identity-front'
import {createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw} from 'vue-router'

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
        meta: {requiresAuth: true}
    },
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/pages/LoginPage.vue'),
        meta: {title: 'auth.signIn'}
    },
    {
        path: '/stacks',
        name: 'stacks',
        component: () => import('@/pages/StacksPage.vue'),
        meta: {title: 'stacks.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/nodes',
        name: 'nodes',
        component: () => import('@/pages/NodesPage.vue'),
        meta: {title: 'nodes.title', requiresAuth: true, permission: 'DOCKER_NODES_FETCH'}
    },
    {
        path: '/ghost-containers',
        name: 'ghost-containers',
        component: () => import('@/pages/GhostContainersPage.vue'),
        meta: {title: 'ghostContainers.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/networks',
        name: 'networks',
        component: () => import('@/pages/NetworksPage.vue'),
        meta: {title: 'networks.title', requiresAuth: true, permission: 'DOCKER_NETWORK_VIEW'}
    },
    {
        path: '/registry-images',
        name: 'registry-images',
        component: () => import('@/pages/RegistryImagesPage.vue'),
        meta: {title: 'registryImages.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/gitlab-projects',
        name: 'gitlab-projects',
        component: () => import('@/pages/GitLabProjectsPage.vue'),
        meta: {title: 'gitLabProjects.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/services',
        name: 'services',
        component: () => import('@/pages/services/ServicesPage.vue'),
        meta: {title: 'services.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/logs/:taskId',
        name: 'task-logs',
        component: () => import('@/pages/logs/TaskLogsPage.vue'),
        meta: {title: 'taskLogs.title', requiresAuth: true, permission: 'DOCKER_LOGS'}
    },
    {
        path: '/terminal/:taskId',
        name: 'task-terminal',
        component: () => import('@/pages/services/TaskTerminalPage.vue'),
        meta: {title: 'taskTerminal.title', requiresAuth: true, permission: 'DOCKER_TERMINAL'}
    }
]

export const router = createRouter({
    history: createWebHistory(),
    routes
})

function loginDestination(to: RouteLocationNormalized): string {
    const redirect = to.query.redirect
    return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/'
}

router.beforeEach((to) => {
    const authStore = useAuthStore()
    const isAuthenticated = Boolean(authStore.authUser && authStore.accessToken && AuthHelper.isJWTValid(authStore.accessToken))
    if (to.meta.requiresAuth && !isAuthenticated) {
        return {name: 'Login', query: {redirect: to.fullPath}}
    }
    if (to.meta.permission && !authStore.hasPermission(to.meta.permission as string)) {
        return {name: 'home'}
    }
    if (to.name === 'Login' && isAuthenticated) {
        return loginDestination(to)
    }
    return true
})
