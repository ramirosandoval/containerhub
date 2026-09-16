export const menu = [
    {text: 'app.home', link: {name: 'home'}, icon: 'mdi-home', gallery: false},
    {
        text: 'menu.docker', icon: 'mdi-docker', gallery: true,
        children: [
            {text: 'app.stacks', link: {name: 'stacks'}, icon: 'mdi-layers-triple', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'app.services', link: {name: 'services'}, icon: 'mdi-docker', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'app.nodes', link: {name: 'nodes'}, icon: 'mdi-server-network', gallery: true, permission: 'DOCKER_NODES_FETCH'},
            {text: 'app.networks', link: {name: 'networks'}, icon: 'mdi-lan', gallery: true, permission: 'DOCKER_NETWORK_VIEW'},
            {text: 'app.registryImages', link: {name: 'registry-images'}, icon: 'mdi-package-variant-closed', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'app.gitLabProjects', link: {name: 'gitlab-projects'}, icon: 'mdi-gitlab', gallery: true, permission: 'DOCKER_VIEW'},
        ]
    },
    {
        text: 'menu.monitorization', icon: 'mdi-chart-line', gallery: true,
        children: [
            {text: 'cluster.title', link: {name: 'cluster'}, icon: 'mdi-server-network', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'monitoring.title', link: {name: 'monitoring'}, icon: 'mdi-chart-line', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'tasksMonitorization.title', link: {name: 'tasks-monitorization'}, icon: 'mdi-history', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'app.ghostContainers', link: {name: 'ghost-containers'}, icon: 'mdi-ghost', gallery: true, permission: 'DOCKER_VIEW'},
            {text: 'app.dockerVersion', link: {name: 'docker-version'}, icon: 'mdi-information-outline', gallery: true, permission: 'DOCKER_VIEW'},
        ]
    },
    {
        text: 'menu.administration', icon: 'mdi-shield-account', gallery: true,
        children: [
            {text: 'Usuarios', link: {name: 'CrudUser'}, icon: 'mdi-account-group', gallery: true, permission: 'user:manage'},
            {text: 'Roles', link: {name: 'CrudRole'}, icon: 'mdi-shield-account', gallery: true, permission: 'role:manage'},
            {text: 'API Keys', link: {name: 'CrudUserApiKey'}, icon: 'mdi-table-key', gallery: true, permission: 'userApiKey:manage'},
            {text: 'Historial de sesiones', link: {name: 'UserSessionCrudPage'}, icon: 'mdi-history', gallery: true, permission: 'usersession:manage'},
            {text: 'Fallos de inicio de sesión', link: {name: 'UserLoginFailCrudPage'}, icon: 'mdi-alert-circle', gallery: true, permission: 'userloginfail:manage'},
            {text: 'Configuraciones', link: {name: 'settings'}, icon: 'mdi-cog', gallery: true, permission: 'SETTINGS_SHOW'}
        ]
    }
]

export function getIconForRouteName(name: string): string | null {
    for (const group of menu) {
        if (group.link && group.link.name === name) return group.icon;
        if (group.children) {
            for (const child of group.children) {
                if (child.link && child.link.name === name) return child.icon;
            }
        }
    }
    return null;
}
