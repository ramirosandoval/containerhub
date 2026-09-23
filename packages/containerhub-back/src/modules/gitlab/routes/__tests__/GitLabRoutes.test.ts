import assert from 'node:assert/strict'
import {mock, test} from 'node:test'
import Fastify from 'fastify'
import {GitLabRoutes} from '../GitLabRoutes.js'

test('tag pipeline route checks permission before forwarding project and tag', async () => {
    process.env.GITLAB_URL = 'https://gitlab.example/api/v4/'
    process.env.GITLAB_TOKEN = 'test-token'
    const server = Fastify()
    server.setValidatorCompiler(() => () => true)
    let permitted = false
    const permissions: string[] = []
    server.addHook('onRequest', async (request) => {
        ;(request as any).rbac = {assertPermission(permission: string) {
            permissions.push(permission)
            if (!permitted) throw Object.assign(new Error('Forbidden'), {statusCode: 403})
        }}
    })
    server.register(GitLabRoutes)
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('[]'))

    try {
        const url = '/api/gitlab/project/7/tag-pipeline?tag=release%2F2.4'
        const denied = await server.inject(url)
        assert.equal(denied.statusCode, 403)
        assert.equal(fetchMock.mock.callCount(), 0)

        permitted = true
        const allowed = await server.inject(url)
        assert.equal(allowed.statusCode, 200)
        assert.deepEqual(allowed.json(), {tag: 'release/2.4', pipeline: null, jobs: []})
        assert.deepEqual(permissions, ['DOCKER_VIEW', 'DOCKER_VIEW'])
        const requestedUrl = new URL(String(fetchMock.mock.calls[0].arguments[0]))
        assert.equal(requestedUrl.pathname, '/api/v4/projects/7/pipelines')
        assert.equal(requestedUrl.searchParams.get('ref'), 'release/2.4')
        assert.equal(requestedUrl.searchParams.get('scope'), 'tags')
        assert.equal(fetchMock.mock.callCount(), 1)
        assert.equal((await server.inject('/api/gitlab/project/7/container-scan')).statusCode, 404)
    } finally {
        mock.restoreAll()
        await server.close()
    }
})