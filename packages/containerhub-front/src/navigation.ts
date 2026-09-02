export const menu = [
    {text: 'app.home', link: {name: 'home'}, icon: 'mdi-home', gallery: true},
    {text: 'app.services', link: {name: 'services'}, icon: 'mdi-docker', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.stacks', link: {name: 'stacks'}, icon: 'mdi-layers-triple', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.nodes', link: {name: 'nodes'}, icon: 'mdi-server-network', gallery: true, permission: 'DOCKER_NODES_FETCH'},
    {text: 'app.ghostContainers', link: {name: 'ghost-containers'}, icon: 'mdi-ghost', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.networks', link: {name: 'networks'}, icon: 'mdi-lan', gallery: true, permission: 'DOCKER_NETWORK_VIEW'},
    {text: 'app.registryImages', link: {name: 'registry-images'}, icon: 'mdi-package-variant-closed', gallery: true, permission: 'DOCKER_VIEW'},
    {text: 'app.gitLabProjects', link: {name: 'gitlab-projects'}, icon: 'mdi-gitlab', gallery: true, permission: 'DOCKER_VIEW'},
]
