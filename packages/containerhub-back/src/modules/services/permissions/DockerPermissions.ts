export const DockerPermissions = {
    View: 'DOCKER_VIEW',
    Create: 'DOCKER_CREATE',
    Update: 'DOCKER_UPDATE',
    Restart: 'DOCKER_RESTART',
    Remove: 'DOCKER_REMOVE',
    Logs: 'DOCKER_LOGS',
    Terminal: 'DOCKER_TERMINAL',
    NodesFetch: 'DOCKER_NODES_FETCH',
    NetworkView: 'DOCKER_NETWORK_VIEW',
    NetworkCreate: 'DOCKER_NETWORK_CREATE',
    NetworkUpdate: 'DOCKER_NETWORK_UPDATE',
    NetworkRemove: 'DOCKER_NETWORK_REMOVE'
} as const

export const dockerPermissions = Object.values(DockerPermissions)
