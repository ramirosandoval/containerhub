import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const localNodeId = 'node-manager'
let listedContainerOptions: unknown
let dockerContainers: Array<Record<string, unknown>> = []
let dockerTasks: Array<Record<string, unknown>> = []
let dockerNodes: Array<Record<string, unknown>> = []
let workerUnavailable = false
const remoteNodeId = 'node-worker'
const remoteContainerId = 'container-worker-orphan'

class DockerStub {
    listNodes() {
        return Promise.resolve(dockerNodes)
    }

    listContainers(options: unknown) {
        listedContainerOptions = options
        return Promise.resolve(dockerContainers)
    }

    listTasks() {
        return Promise.resolve(dockerTasks)
    }

    info() {
        return Promise.resolve({Swarm: {NodeID: localNodeId}})
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const agentClientMock = mock.module('../AgentHealthClient.js', {namedExports: {
    createAgentHealthClient: () => ({
        async fetchRunningContainers(nodeId: string) {
            assert.equal(nodeId, remoteNodeId)
            if (workerUnavailable) throw new Error('worker unavailable')
            return [
                {Id: remoteContainerId, State: 'running', Labels: {'com.docker.swarm.node.id': 'stale-node', 'com.docker.swarm.task.id': 'missing-worker-task'}},
                {Id: 'container-worker-healthy', State: 'running', Labels: {'com.docker.swarm.task.id': 'task-worker-healthy'}}
            ]
        }
    })
}})
const {fetchGhostContainers} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => { dockerodeMock.restore(); agentClientMock.restore() })
test.beforeEach(() => {
    dockerNodes = [{ID: localNodeId, Status: {Addr: '10.0.0.1'}}]
    workerUnavailable = false
    listedContainerOptions = undefined
    dockerContainers = [
        {
            Id: 'container-healthy', State: 'running', Labels: {
                'com.docker.swarm.task.id': 'task-healthy',
                'com.docker.swarm.node.id': localNodeId
            }
        },
        {Id: 'container-standalone', State: 'running', Labels: {}},
        {
            Id: 'container-stale-task', State: 'running', Labels: {
                'com.docker.swarm.task.id': 'task-stale',
                'com.docker.swarm.node.id': localNodeId
            }
        },
        {
            Id: 'container-missing-task', State: 'running', Labels: {
                'com.docker.swarm.task.id': 'task-missing',
                'com.docker.swarm.node.id': localNodeId
            }
        },
        {Id: 'container-with-user-label', State: 'running', Labels: {application: 'manual'}}
    ]
    dockerTasks = [
        {ID: 'task-healthy', NodeID: localNodeId, Status: {State: 'running', ContainerStatus: {ContainerID: 'container-healthy'}}},
        {ID: 'task-stale', NodeID: localNodeId, Status: {State: 'shutdown', ContainerStatus: {ContainerID: 'container-stale-task'}}}
    ]
})

test('ghost reconciliation excludes a healthy Swarm task and returns orphan running containers with their node', async () => {
    const containers = await fetchGhostContainers()

    assert.deepEqual(containers.map(({Id, NodeID}) => ({Id, NodeID})), [
        {Id: 'container-standalone', NodeID: localNodeId},
        {Id: 'container-stale-task', NodeID: localNodeId},
        {Id: 'container-missing-task', NodeID: localNodeId}
    ])
    assert.deepEqual(listedContainerOptions, {all: false})
})

async function ghostContainerServer() {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {
            assertPermission(permission: string) {
                if (request.headers.authorization !== 'Bearer view-user' || permission !== 'DOCKER_VIEW') {
                    throw Object.assign(new Error('Forbidden'), {statusCode: 403})
                }
            }
        }
    })
    await fastify.register(ServiceRoutes)
    await fastify.ready()
    return fastify
}

test('ghost endpoint reconciles worker containers and assigns their scanned node rather than stale labels', async () => {
    dockerNodes.push({ID: remoteNodeId, Status: {Addr: '10.0.0.8'}})
    dockerTasks.push({ID: 'task-worker-healthy', NodeID: remoteNodeId, Status: {State: 'running', ContainerStatus: {ContainerID: 'container-worker-healthy'}}})
    const fastify = await ghostContainerServer()
    try {
        const response = await fastify.inject({method: 'GET', url: '/api/docker/ghostContainers', headers: {authorization: 'Bearer view-user'}})
        assert.equal(response.statusCode, 200)
        const ghosts = response.json()
        assert.equal(ghosts.find((container: {Id: string}) => container.Id === remoteContainerId)?.NodeID, remoteNodeId)
        assert.equal(ghosts.some((container: {Id: string}) => container.Id === 'container-worker-healthy'), false)

        workerUnavailable = true
        const unavailableResponse = await fastify.inject({method: 'GET', url: '/api/docker/ghostContainers', headers: {authorization: 'Bearer view-user'}})
        assert.equal(unavailableResponse.statusCode, 503)
        assert.match(unavailableResponse.json().message, /node-worker/)
    } finally {
        await fastify.close()
    }
})

test('ghost endpoint returns the reconciled read-only list to a user with DOCKER_VIEW', async () => {
    const fastify = await ghostContainerServer()
    try {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/docker/ghostContainers',
            headers: {authorization: 'Bearer view-user'}
        })

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json().map(({Id}: {Id: string}) => Id), [
            'container-standalone',
            'container-stale-task',
            'container-missing-task'
        ])
    } finally {
        await fastify.close()
    }
})
