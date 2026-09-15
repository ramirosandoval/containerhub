export const menu = [
    {text: 'monitoring.title', link: {name: 'monitoring'}, icon: 'mdi-chart-line', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.home', link: {name: 'home'}, icon: 'mdi-home', gallery: true},
    {text: 'app.services', link: {name: 'services'}, icon: 'mdi-docker', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'tasksMonitorization.title', link: {name: 'tasks-monitorization'}, icon: 'mdi-history', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.stacks', link: {name: 'stacks'}, icon: 'mdi-layers-triple', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.nodes', link: {name: 'nodes'}, icon: 'mdi-server-network', gallery: true, permission: 'DOCKER_NODES_FETCH'},
    {text: 'cluster.title', link: {name: 'cluster'}, icon: 'mdi-server-network', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.ghostContainers', link: {name: 'ghost-containers'}, icon: 'mdi-ghost', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.networks', link: {name: 'networks'}, icon: 'mdi-lan', gallery: true, permission: 'DOCKER_NETWORK_VIEW'},
    {text: 'app.dockerVersion', link: {name: 'docker-version'}, icon: 'mdi-information-outline', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.registryImages', link: {name: 'registry-images'}, icon: 'mdi-package-variant-closed', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.gitLabProjects', link: {name: 'gitlab-projects'}, icon: 'mdi-gitlab', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'Usuarios', link: {name: 'CrudUser'}, icon: 'mdi-account-group', gallery: true, permission: 'user:manage'},
    {text: 'Roles', link: {name: 'CrudRole'}, icon: 'mdi-shield-account', gallery: true, permission: 'role:manage'},
    {text: 'Historial de sesiones', link: {name: 'UserSessionCrudPage'}, icon: 'mdi-history', gallery: true, permission: 'usersession:manage'},
    {text: 'Fallos de inicio de sesión', link: {name: 'UserLoginFailCrudPage'}, icon: 'mdi-alert-circle', gallery: true, permission: 'userloginfail:manage'},
    {text: 'Configuraciones', link: {name: 'settings'}, icon: 'mdi-cog', gallery: true, permission: 'SETTINGS_SHOW'}
]
