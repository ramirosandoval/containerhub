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
        Labels: {component: 'api'},
        Command: ['/bin/tool'],
        Args: ['--token', 'value-to-hide'],
        CredentialSpec: {Config: 'registry://credential-id'},
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
        const permissions = request.headers.authorization === 'Bearer config-user'
            ? new Set(['DOCKER_VIEW', 'DOCKER_CONFIGURATION_VIEW'])
            : request.headers.authorization === 'Bearer view-user'
                ? new Set(['DOCKER_VIEW'])
                : new Set<string>()
        ;(request as any).rbac = {
            assertPermission(permission: string) {
                if (!permissions.has(permission)) throw Object.assign(new Error('Forbidden'), {statusCode: 403})
            },
            hasPermission(permission: string) {
                return permissions.has(permission)
            }
        }
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
                Labels: {component: '[REDACTED]'},
                Command: '[REDACTED]',
                Args: '[REDACTED]',
                CredentialSpec: '[REDACTED]',
                RegistryAuth: '[REDACTED]',
                ApiKey: '[REDACTED]'
            }}
        })
        assert.deepEqual(stoppedTaskInspect.Spec.ContainerSpec.Env, ['MODE=production', 'DB_PASSWORD=value-to-hide'])
        const privilegedResponse = await fastify.inject({url: '/api/docker/task/stopped-task/inspect', headers: {authorization: 'Bearer config-user'}})
        assert.equal(privilegedResponse.statusCode, 200)
        assert.deepEqual(privilegedResponse.json(), stoppedTaskInspect)
        const missingResponse = await fastify.inject({url: '/api/docker/task/missing-task/inspect', headers: {authorization: 'Bearer view-user'}})
        assert.equal(missingResponse.statusCode, 404)
    } finally {
        await fastify.close()
    }
})
