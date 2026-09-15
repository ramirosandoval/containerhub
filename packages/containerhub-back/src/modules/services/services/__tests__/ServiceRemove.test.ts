import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const removedServiceIds: string[] = []
const auditRecords: Array<Record<string, unknown>> = []
let auditFailure: Error | undefined
const mutationContext = {
    user: {id: 'user-1', username: 'operator', roleName: 'Admin'},
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'request-1'
}

class DockerStub {
    getService(serviceId: string) {
        return {
            remove: async () => {
                if (serviceId === 'broken-service') throw new Error('service is unavailable')
                removedServiceIds.push(serviceId)
            }
        }
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const auditMock = mock.module('@drax/audit-back', {
    namedExports: {
        AuditServiceFactory: {instance: {create: async (record: Record<string, unknown>) => {
            if (auditFailure) throw auditFailure
            auditRecords.push(record)
        }}}
    }
})
const {dockerRemoveMany} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => {
    dockerodeMock.restore()
    auditMock.restore()
})
test.beforeEach(() => {
    removedServiceIds.length = 0
    auditRecords.length = 0
    auditFailure = undefined
})

test('remove many reports each service success and failure without aborting the batch', async () => {
    const results = await dockerRemoveMany(['healthy-service', 'broken-service', 'other-service'], mutationContext)

    assert.deepEqual(results, [
        {serviceId: 'healthy-service', success: true},
        {serviceId: 'broken-service', success: false, error: 'service is unavailable'},
        {serviceId: 'other-service', success: true}
    ])
    assert.deepEqual(removedServiceIds, ['healthy-service', 'other-service'])
    assert.deepEqual(auditRecords.map(({action, entity, resourceId}) => ({action, entity, resourceId})), [
        {action: 'DELETE', entity: 'Service', resourceId: 'healthy-service'},
        {action: 'DELETE', entity: 'Service', resourceId: 'other-service'}
    ])
})

test('remove many rejects an empty selection', async () => {
    await assert.rejects(() => dockerRemoveMany([], mutationContext), /serviceIds must be a non-empty array/)
})

test('remove many reports the Docker outcome when audit persistence fails afterwards', async () => {
    auditFailure = new Error('audit unavailable')

    const results = await dockerRemoveMany(['healthy-service'], mutationContext)

    assert.deepEqual(results, [{serviceId: 'healthy-service', success: true}])
    assert.deepEqual(removedServiceIds, ['healthy-service'])
})

async function removeServer() {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        const bearerToken = request.headers.authorization?.replace(/^Bearer /, '')
        ;(request as any).authUser = bearerToken ? {id: 'user-1', username: 'operator', roleName: 'Admin'} : null
        ;(request as any).rbac = {
            assertPermission(permission: string) {
                if (!bearerToken) throw Object.assign(new Error('Unauthenticated'), {statusCode: 401})
                if (bearerToken !== 'remove-user' || permission !== 'DOCKER_REMOVE') {
                    throw Object.assign(new Error('Forbidden'), {statusCode: 403})
                }
            }
        }
    })
    await fastify.register(ServiceRoutes)
    await fastify.ready()
    return fastify
}

test('remove selected accepts one service through the bulk route', async () => {
    const fastify = await removeServer()
    try {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/docker/service/remove',
            headers: {authorization: 'Bearer remove-user'},
            payload: {serviceIds: ['healthy-service']}
        })

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), [{serviceId: 'healthy-service', success: true}])
        assert.deepEqual(removedServiceIds, ['healthy-service'])
        assert.equal(auditRecords.length, 1)
        assert.equal(auditRecords[0]?.resourceId, 'healthy-service')
    } finally {
        await fastify.close()
    }
})

test('remove selected requires DOCKER_REMOVE', async () => {
    const fastify = await removeServer()
    try {
        const denied = await fastify.inject({
            method: 'POST', url: '/api/docker/service/remove',
            headers: {authorization: 'Bearer restart-user'}, payload: {serviceIds: ['healthy-service']}
        })
        const unauthenticated = await fastify.inject({
            method: 'POST', url: '/api/docker/service/remove', payload: {serviceIds: ['healthy-service']}
        })

        assert.equal(denied.statusCode, 403)
        assert.equal(unauthenticated.statusCode, 401)
        assert.deepEqual(removedServiceIds, [])
    } finally {
        await fastify.close()
    }
})