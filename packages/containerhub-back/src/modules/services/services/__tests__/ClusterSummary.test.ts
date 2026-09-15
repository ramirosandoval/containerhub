import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const retainedTasks = [{Status: {State: 'running'}}, {Status: {State: 'shutdown'}}, {Status: {State: 'failed'}}]
let emptyCluster = false
let failTasks = false
const calls: string[] = []
class DockerStub {
    async listNodes(...options: unknown[]) {
        assert.deepEqual(options, [])
        calls.push('nodes')
        return emptyCluster ? [] : [{ID: 'manager'}, {ID: 'worker'}]
    }
    async listServices(...options: unknown[]) {
        assert.deepEqual(options, [])
        calls.push('services')
        return emptyCluster ? [] : [{ID: 'web'}]
    }
    async listTasks(...options: unknown[]) {
        assert.deepEqual(options, [])
        calls.push('tasks')
        if (failTasks) throw new Error('Docker unavailable')
        return emptyCluster ? [] : retainedTasks
    }
}
const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')
test.after(() => dockerodeMock.restore())

test('cluster summary preserves retained tasks, empty counts, permission and Docker failure semantics', async () => {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {assertPermission(permission: string) {
            assert.equal(permission, 'DOCKER_VIEW')
            if (request.headers.authorization !== 'Bearer view-user') {
                throw Object.assign(new Error('Forbidden'), {statusCode: 403})
            }
        }}
    })
    await fastify.register(ServiceRoutes)
    const summaryRequest = {method: 'GET' as const, url: '/api/docker/cluster', headers: {authorization: 'Bearer view-user'}}
    try {
        const denied = await fastify.inject({method: 'GET', url: summaryRequest.url})
        assert.equal(denied.statusCode, 403)
        assert.deepEqual(calls, [])
        const populated = await fastify.inject(summaryRequest)
        assert.equal(populated.statusCode, 200)
        assert.deepEqual(populated.json(), {nodesQuantity: 2, servicesQuantity: 1, tasksQuantity: 3})
        assert.deepEqual(calls.sort(), ['nodes', 'services', 'tasks'])
        emptyCluster = true
        const empty = await fastify.inject(summaryRequest)
        assert.equal(empty.statusCode, 200)
        assert.deepEqual(empty.json(), {nodesQuantity: 0, servicesQuantity: 0, tasksQuantity: 0})
        failTasks = true
        const failed = await fastify.inject(summaryRequest)
        assert.equal(failed.statusCode, 500)
        assert.equal(failed.json().nodesQuantity, undefined)
    } finally {
        await fastify.close()
    }
})
