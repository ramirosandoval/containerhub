import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const serviceFixture = {
    ID: 'service-1',
    Spec: {
        Name: 'payments_api',
        Labels: {'com.docker.stack.namespace': 'payments'},
        TaskTemplate: {
            ContainerSpec: {
                Image: 'registry.example:5000/team/api:2.4@sha256:abcdef',
                Env: ['TOKEN=secret-value'],
                Labels: {component: 'api'}
            }
        }
    }
}

let inspectError: Error & {statusCode?: number} = Object.assign(new Error('not found'), {statusCode: 404})
let listedServices = [serviceFixture]

class DockerStub {
    getService() {
        return {inspect: async () => { throw inspectError }}
    }

    listServices() {
        return Promise.resolve(listedServices)
    }
}

const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => dockerMock.restore())

async function serviceServer() {
    const fastify = Fastify()
    fastify.setValidatorCompiler(() => () => true)
    fastify.addHook('onRequest', async (request) => {
        const authorization = request.headers.authorization
        const permissions = authorization === 'Bearer config-user'
            ? new Set(['DOCKER_VIEW', 'DOCKER_CONFIGURATION_VIEW'])
            : authorization === 'Bearer view-user'
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
    await fastify.ready()
    return fastify
}

test('missing service name returns null, missing Docker ID remains 404', async () => {
    inspectError = Object.assign(new Error('not found'), {statusCode: 404})
    listedServices = []
    const fastify = await serviceServer()
    try {
        for (const name of ['missing-service', 'shortidbutlooksreal']) {
            const response = await fastify.inject({
                url: `/api/docker/service/${name}`,
                headers: {authorization: 'Bearer view-user'}
            })
            assert.equal(response.statusCode, 200)
            assert.equal(response.body, 'null')
        }
        const missingId = await fastify.inject({
            url: '/api/docker/service/abcdefghijklmnopqrstuvwxy',
            headers: {authorization: 'Bearer view-user'}
        })
        assert.equal(missingId.statusCode, 404)
    } finally {
        listedServices = [serviceFixture]
        await fastify.close()
    }
})

test('docker failures other than not-found are not masked as missing services', async () => {
    inspectError = Object.assign(new Error('docker unavailable'), {statusCode: 503})
    const fastify = await serviceServer()
    try {
        const response = await fastify.inject({
            url: '/api/docker/service/payments_api',
            headers: {authorization: 'Bearer view-user'}
        })
        assert.equal(response.statusCode, 503)
    } finally {
        await fastify.close()
    }
})

test('service image status reports whether the exact deployed reference is in use', async () => {
    const fastify = await serviceServer()
    try {
        for (const [image, status] of [
            ['registry.example:5000/team/api:2.4', 'useful'],
            ['registry.example:5000/team/api:1.0', 'useless']
        ]) {
            const response = await fastify.inject({
                url: `/api/docker/service/status/${encodeURIComponent(image)}`,
                headers: {authorization: 'Bearer view-user'}
            })
            assert.equal(response.statusCode, 200)
            assert.deepEqual(response.json(), {status})
        }
    } finally {
        await fastify.close()
    }
})

test('legacy service list reveals configuration only to the dedicated permission', async () => {
    const fastify = await serviceServer()
    try {
        const redactedResponse = await fastify.inject({
            url: '/api/docker/service',
            headers: {authorization: 'Bearer view-user'}
        })
        assert.equal(redactedResponse.statusCode, 200)
        assert.deepEqual(redactedResponse.json()[0].envs, [{name: 'TOKEN', value: '[REDACTED]'}])
        assert.deepEqual(redactedResponse.json()[0].labels, [{name: 'component', value: '[REDACTED]'}])

        const integrationResponse = await fastify.inject({
            url: '/api/docker/service',
            headers: {authorization: 'Bearer config-user'}
        })
        assert.equal(integrationResponse.statusCode, 200)
        assert.deepEqual(integrationResponse.json()[0].envs, [{name: 'TOKEN', value: 'secret-value'}])
        assert.deepEqual(integrationResponse.json()[0].labels, [{name: 'component', value: 'api'}])
    } finally {
        await fastify.close()
    }
})

test('native REST service lists are retired without changing legacy Docker reads', async () => {
    const fastify = await serviceServer()
    try {
        for (const url of ['/api/services', '/api/services/paginate?page=1&limit=10']) {
            const response = await fastify.inject({url, headers: {authorization: 'Bearer view-user'}})
            assert.equal(response.statusCode, 404)
        }
        const legacy = await fastify.inject({url: '/api/docker/service', headers: {authorization: 'Bearer config-user'}})
        assert.equal(legacy.statusCode, 200)
        assert.deepEqual(legacy.json()[0].envs, [{name: 'TOKEN', value: 'secret-value'}])
    } finally { await fastify.close() }
})
