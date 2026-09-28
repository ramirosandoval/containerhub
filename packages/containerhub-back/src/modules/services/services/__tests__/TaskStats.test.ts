import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const localTask = {ID: 'local-task', NodeID: 'manager', DesiredState: 'running', Status: {State: 'running', ContainerStatus: {ContainerID: 'local-container'}}}
const workerTask = {ID: 'worker-task', NodeID: 'worker', DesiredState: 'running', Status: {State: 'running', ContainerStatus: {ContainerID: 'worker-container'}}}
const unassignedTask = {ID: 'pending-task', DesiredState: 'running', Status: {}}
const failedTask = {ID: 'failed-task', NodeID: 'manager', DesiredState: 'running', Status: {State: 'failed', ContainerStatus: {ContainerID: 'dead-container'}}}
const staleTask = {ID: 'stale-task', NodeID: 'manager', DesiredState: 'shutdown', Status: {State: 'shutdown', ContainerStatus: {ContainerID: 'stale-container'}}}
const localTaskModel = {id: 'local-task', nodeId: 'manager', containerId: 'local-container', serviceId: undefined, state: 'running', message: undefined, createdAt: undefined, updatedAt: undefined}
const workerTaskModel = {id: 'worker-task', nodeId: 'worker', containerId: 'worker-container', serviceId: undefined, state: 'running', message: undefined, createdAt: undefined, updatedAt: undefined}
const unassignedTaskModel = {id: 'pending-task', nodeId: undefined, containerId: undefined, serviceId: undefined, state: undefined, message: undefined, createdAt: undefined, updatedAt: undefined}
const sampledStats = {
    cpu_stats: {cpu_usage: {total_usage: 300}, system_cpu_usage: 2000, online_cpus: 4},
    precpu_stats: {cpu_usage: {total_usage: 100}, system_cpu_usage: 1000},
    memory_stats: {usage: 4096, limit: 8192}
}
const expectedMetrics = {
    sampledAt: null, cpuUsage: {cpuPercentage: 80, cpuCoreQuantity: 4},
    memoryUsage: {memoryTotalUsage: 4096, memoryLimitUsage: 8192},
    ioUsage: {readIoBytes: null, writeIoBytes: null}, networksUsage: []
}
const expectedStats = {...sampledStats, cpu: '80', memoryUsage: '4096', memoryLimit: '8192'}
let workerAvailable = true
let requestedContainers: string[] = []
class DockerStub {
    getTask(taskId: string) { return {inspect: async () => taskId === localTask.ID ? localTask : taskId === unassignedTask.ID ? unassignedTask : workerTask} }
    getService() { return {inspect: async () => ({ID: 'service'})} }
    listTasks() { return Promise.resolve([localTask, workerTask, unassignedTask, failedTask, staleTask]) }
    info() { return Promise.resolve({Swarm: {NodeID: 'manager'}}) }
    getContainer(containerId: string) {
        requestedContainers.push(containerId)
        if (containerId === 'dead-container' || containerId === 'stale-container') throw new Error(`No such container: ${containerId}`)
        assert.equal(containerId, 'local-container', 'remote containers must never hit the manager daemon')
        return {stats: async (options: unknown) => {
            assert.deepEqual(options, {stream: false})
            return {id: containerId, ...sampledStats}
        }}
    }
}
const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const agentMock = mock.module('../AgentHealthClient.js', {namedExports: {
    createAgentHealthClient: () => ({fetchContainerStats: async (nodeId: string, containerId: string) => {
        assert.equal(nodeId, 'worker')
        assert.equal(containerId, 'worker-container')
        if (!workerAvailable) throw new Error('unavailable')
        return {id: containerId, ...sampledStats}
    }})
}})
const {fetchTaskStats, fetchServiceStats} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')
test.after(() => { dockerMock.restore(); agentMock.restore() })
test.beforeEach(() => { workerAvailable = true; requestedContainers = [] })

test('task stats select the task node while preserving local daemon access', async () => {
    assert.deepEqual(await fetchTaskStats('worker-task'), {task: workerTaskModel, stats: {id: 'worker-container', ...expectedStats}, metrics: expectedMetrics})
    assert.deepEqual(await fetchTaskStats('local-task'), {task: localTaskModel, stats: {id: 'local-container', ...expectedStats}, metrics: expectedMetrics})
    assert.deepEqual(requestedContainers, ['local-container'])
})

test('service stats include only effectively running tasks without querying failed containers', async () => {
    const samples = await fetchServiceStats('service')
    assert.deepEqual(samples, [
        {task: localTaskModel, stats: {id: 'local-container', ...expectedStats}, metrics: expectedMetrics},
        {task: workerTaskModel, stats: {id: 'worker-container', ...expectedStats}, metrics: expectedMetrics}
    ])
    assert.deepEqual(samples.map(sample => sample.task.id), ['local-task', 'worker-task'])
    assert.deepEqual(requestedContainers, ['local-container'])
    assert.deepEqual(await fetchTaskStats('pending-task'), {task: unassignedTaskModel, stats: null, metrics: null})
})

test('stats endpoint enforces permission and returns 503 rather than local fallback when the worker fails', async () => {
    const server = Fastify()
    server.setValidatorCompiler(() => () => true)
    server.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {assertPermission(permission: string) {
            if (request.headers.authorization !== 'Bearer stats-reader' || permission !== 'DOCKER_VIEW') {
                throw Object.assign(new Error('Forbidden'), {statusCode: 403})
            }
        }}
    })
    await server.register(ServiceRoutes)
    try {
        assert.equal((await server.inject('/api/docker/task/worker-task/stats')).statusCode, 403)
        const response = await server.inject({url: '/api/docker/task/worker-task/stats', headers: {authorization: 'Bearer stats-reader'}})
        assert.equal(response.statusCode, 200)
        assert.equal(response.json().stats.id, 'worker-container')
        assert.deepEqual({cpu: response.json().stats.cpu, memoryUsage: response.json().stats.memoryUsage, memoryLimit: response.json().stats.memoryLimit},
            {cpu: '80', memoryUsage: '4096', memoryLimit: '8192'})
        assert.deepEqual(response.json().metrics, expectedMetrics)
        for (const servicePath of ['/api/docker/service/id/service/stats', '/api/docker/service/service/stats']) {
            assert.equal((await server.inject(servicePath)).statusCode, 403)
            const serviceResponse = await server.inject({url: servicePath, headers: {authorization: 'Bearer stats-reader'}})
            assert.equal(serviceResponse.statusCode, 200)
            assert.deepEqual(serviceResponse.json().map((sample: {metrics: unknown}) => sample.metrics), [expectedMetrics, expectedMetrics])
        }
        requestedContainers = []
        workerAvailable = false
        const unavailable = await server.inject({url: '/api/docker/task/worker-task/stats', headers: {authorization: 'Bearer stats-reader'}})
        assert.equal(unavailable.statusCode, 503)
        assert.deepEqual(requestedContainers, [])
    } finally { await server.close() }
})
