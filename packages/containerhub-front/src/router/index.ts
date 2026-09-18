import {IdentityRoutes} from '@drax/identity-vue'
import {useAuthStore} from '@drax/identity-vue'
import {AuthHelper} from '@drax/identity-front'
import {createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw} from 'vue-router'
import {i18n} from '@/plugins/i18n'
import {getIconForRouteName} from '@/navigation'

const appRoutes: RouteRecordRaw[] = [
    {
        path: '/monitoring', name: 'monitoring', component: () => import('@/pages/MonitoringPage.vue'),
        meta: {title: 'monitoring.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/monitoring/:id', name: 'monitoring-history', component: () => import('@/pages/MonitoringHistoryPage.vue'),
        meta: {title: 'monitoring.history', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/tasks-monitorization', name: 'tasks-monitorization', component: () => import('@/pages/TasksMonitorizationPage.vue'),
        meta: {title: 'tasksMonitorization.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
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
        path: '/docker/version',
        name: 'docker-version',
        component: () => import('@/pages/DockerVersionPage.vue'),
        meta: {title: 'dockerVersion.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/cluster',
        name: 'cluster',
        component: () => import('@/pages/ClusterInformationPage.vue'),
        meta: {title: 'cluster.title', requiresAuth: true, permission: 'DOCKER_VIEW'}
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
        path: '/inspect/:taskId',
        name: 'task-inspect',
        component: () => import('@/pages/services/TaskInspectPage.vue'),
        meta: {title: 'taskInspect.title', favicon: '/file-document.svg', requiresAuth: true, permission: 'DOCKER_VIEW'}
    },
    {
        path: '/statistics/:taskId',
        name: 'task-statistics',
        component: () => import('@/pages/services/TaskStatisticsPage.vue'),
        meta: {title: 'taskStatistics.title', favicon: '/poll.svg', requiresAuth: true, permission: 'DOCKER_VIEW'}
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
        meta: {title: 'taskTerminal.title', favicon: '/console.svg', requiresAuth: true, permission: 'DOCKER_TERMINAL'}
    },
    {
        path: '/settings',
        name: 'settings',
        component: () => import('@/pages/settings/SettingsPage.vue'),
        meta: {title: 'settings.title', requiresAuth: true, permission: 'SETTINGS_SHOW'}
    }
]

// Filter out CrudTenant and map to use requiresAuth for containerhub router guards.
const draxRoutes = [...IdentityRoutes]
    .filter(route => route.name !== 'CrudTenant')
    .map(route => {
        if (route.meta && (route.meta.auth === true || route.meta.auth === false)) {
            const { auth, ...restMeta } = route.meta as any
            return {
                ...route,
                meta: { ...restMeta, requiresAuth: auth }
            }
        }
        return route
    })

export const router = createRouter({
    history: createWebHistory(),
    routes: [...appRoutes, ...draxRoutes]
})

router.afterEach((to) => {
    document.title = typeof to.meta.title === 'string'
        ? i18n.global.t(to.meta.title)
        : 'ContainerHub'

    const sectionIcon = typeof to.name === 'string' && to.name !== 'home'
        ? getIconForRouteName(to.name)
        : null
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (favicon) {
        favicon.href = sectionIcon
            ? `/favicons/${sectionIcon}.svg`
            : typeof to.meta.favicon === 'string'
                ? to.meta.favicon
                : '/favicon.ico'
    }
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
