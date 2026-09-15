import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const stoppedTaskInspect = {
    ID: 'stopped-task',
    ServiceID: 'service-id',
    Status: {State: 'shutdown'},
    Spec: {ContainerSpec: {
        Image: 'alpine',
        ReadOnly: false,
        Env: ['MODE=production', 'DB_PASSWORD=value-to-hide'],
        RegistryAuth: 'registry-secret',
        ApiKey: 'value-to-hide'
    }},
    Slot: 0
}
const inspectedTaskIds: string[] = []
class DockerStub {
    getTask(taskId: string) {
        return {inspect: async () => {
            inspectedTaskIds.push(taskId)
            if (taskId === 'missing-task') throw Object.assign(new Error('Task not found'), {statusCode: 404})
            return stoppedTaskInspect
        }}
    }
}
const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')
test.after(() => dockerodeMock.restore())

test('task inspect requires DOCKER_VIEW, redacts secret values and reports missing tasks', async () => {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {assertPermission(permission: string) {
            if (request.headers.authorization !== 'Bearer view-user' || permission !== 'DOCKER_VIEW') {
                throw Object.assign(new Error('Forbidden'), {statusCode: 403})
            }
        }}
    })
    await fastify.register(ServiceRoutes)
    try {
        const deniedResponse = await fastify.inject('/api/docker/task/stopped-task/inspect')
        assert.equal(deniedResponse.statusCode, 403)
        assert.deepEqual(inspectedTaskIds, [])
        const inspectResponse = await fastify.inject({url: '/api/docker/task/stopped-task/inspect', headers: {authorization: 'Bearer view-user'}})
        assert.equal(inspectResponse.statusCode, 200)
        assert.deepEqual(inspectResponse.json(), {
            ...stoppedTaskInspect,
            Spec: {ContainerSpec: {
                Image: 'alpine',
                ReadOnly: false,
                Env: ['MODE=[REDACTED]', 'DB_PASSWORD=[REDACTED]'],
                RegistryAuth: '[REDACTED]',
                ApiKey: '[REDACTED]'
            }}
        })
        assert.deepEqual(stoppedTaskInspect.Spec.ContainerSpec.Env, ['MODE=production', 'DB_PASSWORD=value-to-hide'])
        const missingResponse = await fastify.inject({url: '/api/docker/task/missing-task/inspect', headers: {authorization: 'Bearer view-user'}})
        assert.equal(missingResponse.statusCode, 404)
    } finally {
        await fastify.close()
    }
})
