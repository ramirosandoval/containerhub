import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

const serviceFixture = {
    ID: 'service-1',
    Spec: {
        Name: 'payments_api',
        Labels: {'com.docker.stack.namespace': 'payments'},
        TaskTemplate: {ContainerSpec: {Image: 'registry.example:5000/team/api:2.4@sha256:abcdef'}}
    }
}

let inspectError: Error & {statusCode?: number} = Object.assign(new Error('not found'), {statusCode: 404})

class DockerStub {
    getService() {
        return {inspect: async () => { throw inspectError }}
    }

    listServices() {
        return Promise.resolve([serviceFixture])
    }
}

const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => dockerMock.restore())

async function serviceServer() {
    const fastify = Fastify()
    fastify.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {assertPermission(permission: string) {
            if (request.headers.authorization !== 'Bearer view-user' || permission !== 'DOCKER_VIEW') {
                throw Object.assign(new Error('Forbidden'), {statusCode: 403})
            }
        }}
    })
    await fastify.register(ServiceRoutes)
    await fastify.ready()
    return fastify
}

test('missing service returns 404 instead of an internal error', async () => {
    inspectError = Object.assign(new Error('not found'), {statusCode: 404})
    const fastify = await serviceServer()
    try {
        const response = await fastify.inject({
            url: '/api/docker/service/missing-service',
            headers: {authorization: 'Bearer view-user'}
        })
        assert.equal(response.statusCode, 404)
    } finally {
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
