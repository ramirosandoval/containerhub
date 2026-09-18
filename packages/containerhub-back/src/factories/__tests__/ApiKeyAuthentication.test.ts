import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

process.env.DRAX_APIKEY_CACHE_TTL = '1'

const {default: SetupContainerHub} = await import('../../setup/SetupContainerHub.js')
const {default: YogaFastifyServerFactory} = await import('../YogaFastifyServerFactory.js')

type LoginResponse = {accessToken?: string}
type UserApiKeyResponse = {_id?: string; secret?: string}

test('accepts a Drax user API key for a protected route and rejects it after deletion', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-api-key-'))
    const previousEnvironment = {...process.env}
    let server: ReturnType<typeof YogaFastifyServerFactory> | undefined
    try {
        Object.assign(process.env, {
            DRAX_DB_ENGINE: 'sqlite',
            DRAX_SQLITE_FILE: join(temporaryDirectory, 'identity.sqlite'),
            DRAX_JWT_SECRET: 'test-only-jwt-secret',
            DRAX_APIKEY_SECRET: 'test-only-api-key-secret',
            DRAX_APIKEY_CACHE_TTL: '1',
            CONTAINERHUB_BOOTSTRAP_ENABLED: 'true',
            CONTAINERHUB_BOOTSTRAP_NAME: 'API-key test administrator',
            CONTAINERHUB_BOOTSTRAP_USERNAME: 'api-key-test-admin',
            CONTAINERHUB_BOOTSTRAP_PASSWORD: 'ContainerHub.Test-123',
            CONTAINERHUB_BOOTSTRAP_EMAIL: 'api-key-test-admin@example.invalid',
            CONTAINERHUB_BOOTSTRAP_PHONE: '+15555550100'
        })
        await SetupContainerHub()
        server = YogaFastifyServerFactory()

        const loginResponse = await server.fastify.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {username: 'api-key-test-admin', password: 'ContainerHub.Test-123'}
        })
        assert.equal(loginResponse.statusCode, 200)
        const {accessToken} = loginResponse.json() as LoginResponse
        assert.ok(accessToken)

        const createKeyResponse = await server.fastify.inject({
            method: 'POST',
            url: '/api/user-api-keys',
            headers: {authorization: `Bearer ${accessToken}`},
            payload: {name: 'factory authentication test', ipv4: [], ipv6: []}
        })
        assert.equal(createKeyResponse.statusCode, 200)
        const createdApiKey = createKeyResponse.json() as UserApiKeyResponse
        assert.ok(createdApiKey._id)
        assert.ok(createdApiKey.secret)

        const jwtResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {authorization: `Bearer ${accessToken}`}
        })
        assert.equal(jwtResponse.statusCode, 200)

        const apiKeyResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {'x-api-key': createdApiKey.secret}
        })
        assert.equal(apiKeyResponse.statusCode, 200)

        const legacyBearerApiKeyResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {authorization: `Bearer ${createdApiKey.secret}`}
        })
        assert.equal(legacyBearerApiKeyResponse.statusCode, 200)

        const anonymousResponse = await server.fastify.inject({method: 'GET', url: '/api/services/health'})
        assert.equal(anonymousResponse.statusCode, 401)

        const invalidKeyResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {'x-api-key': '00000000-0000-4000-8000-000000000000'}
        })
        assert.equal(invalidKeyResponse.statusCode, 401)

        const deleteKeyResponse = await server.fastify.inject({
            method: 'DELETE',
            url: `/api/user-api-keys/${createdApiKey._id}`,
            headers: {authorization: `Bearer ${accessToken}`}
        })
        assert.equal(deleteKeyResponse.statusCode, 200)
        await new Promise((resolve) => setTimeout(resolve, 25))

        const revokedKeyResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {'x-api-key': createdApiKey.secret}
        })
        assert.equal(revokedKeyResponse.statusCode, 401)

        const revokedLegacyBearerResponse = await server.fastify.inject({
            method: 'GET',
            url: '/api/services/health',
            headers: {authorization: `Bearer ${createdApiKey.secret}`}
        })
        assert.equal(revokedLegacyBearerResponse.statusCode, 401)
    } finally {
        await server?.fastify.close()
        process.env = previousEnvironment
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})