import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import Fastify from 'fastify'

class DockerStub {
    version() {
        return Promise.resolve({Version: '28.3.3', ApiVersion: '1.51', GitCommit: 'internal'})
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => dockerodeMock.restore())

test('Docker version endpoint returns the legacy fields to a user with DOCKER_VIEW', async () => {
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

    try {
        const deniedResponse = await fastify.inject({method: 'GET', url: '/api/docker/version'})
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/docker/version',
            headers: {authorization: 'Bearer view-user'}
        })

        assert.equal(deniedResponse.statusCode, 403)
        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {Version: '28.3.3', ApiVersion: '1.51'})
    } finally {
        await fastify.close()
    }
})
