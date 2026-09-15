import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const restartedServiceIds: string[] = []
const auditRecords: Array<Record<string, unknown>> = []
const mutationContext = {
    user: {id: 'user-1', username: 'operator', roleName: 'Admin'},
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'request-1'
}

class DockerStub {
    getService(serviceId: string) {
        return {
            inspect: async () => {
                if (serviceId === 'broken-service') throw new Error('service is unavailable')
                return {Spec: {TaskTemplate: {ForceUpdate: 2}}, Version: {Index: 7}}
            },
            update: async () => {
                restartedServiceIds.push(serviceId)
                return {Warnings: serviceId === 'warning-service' ? ['rolling restart warning'] : []}
            }
        }
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const auditMock = mock.module('@drax/audit-back', {
    namedExports: {
        AuditServiceFactory: {instance: {create: async (record: Record<string, unknown>) => auditRecords.push(record)}}
    }
})
const {dockerRestartMany} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => {
    dockerodeMock.restore()
    auditMock.restore()
})
test.beforeEach(() => {
    restartedServiceIds.length = 0
    auditRecords.length = 0
})

test('restart many reports each service success, warning and failure without aborting the batch', async () => {
    const results = await dockerRestartMany(['healthy-service', 'warning-service', 'broken-service'], mutationContext)

    assert.deepEqual(results, [
        {serviceId: 'healthy-service', success: true, warnings: []},
        {serviceId: 'warning-service', success: true, warnings: ['rolling restart warning']},
        {serviceId: 'broken-service', success: false, warnings: [], error: 'service is unavailable'}
    ])
    assert.deepEqual(restartedServiceIds, ['healthy-service', 'warning-service'])
    assert.deepEqual(auditRecords.map(({action, entity, resourceId}) => ({action, entity, resourceId})), [
        {action: 'RESTART', entity: 'Service', resourceId: 'healthy-service'},
        {action: 'RESTART', entity: 'Service', resourceId: 'warning-service'}
    ])
})

test('restart many rejects an empty selection', async () => {
    await assert.rejects(() => dockerRestartMany([], mutationContext), /serviceIds must be a non-empty array/)
})

async function restartServer() {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        const bearerToken = request.headers.authorization?.replace(/^Bearer /, '')
        ;(request as any).authUser = bearerToken ? {id: 'user-1', username: 'operator', roleName: 'Admin'} : null
        ;(request as any).rbac = {
            assertPermission(permission: string) {
                if (!bearerToken) throw Object.assign(new Error('Unauthenticated'), {statusCode: 401})
                if (bearerToken !== 'restart-user' || permission !== 'DOCKER_RESTART') {
                    throw Object.assign(new Error('Forbidden'), {statusCode: 403})
                }
            }
        }
    })
    await fastify.register(ServiceRoutes)
    await fastify.ready()
    return fastify
}

test('restart selected accepts one service through the bulk route', async () => {
    const fastify = await restartServer()
    try {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/docker/service/restart',
            headers: {authorization: 'Bearer restart-user'},
            payload: {serviceIds: ['healthy-service']}
        })

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), [{serviceId: 'healthy-service', success: true, warnings: []}])
        assert.deepEqual(restartedServiceIds, ['healthy-service'])
        assert.equal(auditRecords.length, 1)
        assert.deepEqual(auditRecords[0]?.user, {id: 'user-1', username: 'operator', rolName: 'Admin'})
        assert.equal(auditRecords[0]?.resourceId, 'healthy-service')
    } finally {
        await fastify.close()
    }
})

test('restart selected requires DOCKER_RESTART', async () => {
    const fastify = await restartServer()
    try {
        const denied = await fastify.inject({
            method: 'POST', url: '/api/docker/service/restart',
            headers: {authorization: 'Bearer view-user'}, payload: {serviceIds: ['healthy-service']}
        })
        const unauthenticated = await fastify.inject({
            method: 'POST', url: '/api/docker/service/restart', payload: {serviceIds: ['healthy-service']}
        })

        assert.equal(denied.statusCode, 403)
        assert.equal(unauthenticated.statusCode, 401)
        assert.deepEqual(restartedServiceIds, [])
    } finally {
        await fastify.close()
    }
})
