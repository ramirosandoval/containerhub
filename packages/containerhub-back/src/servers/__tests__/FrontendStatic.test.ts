import assert from 'node:assert/strict'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import Fastify from 'fastify'
import {registerFrontendStatic} from '../FrontendStatic.js'

test('serves built frontend assets and falls back to the SPA outside API routes', async () => {
    const frontDirectory = await mkdtemp(join(tmpdir(), 'containerhub-front-'))
    await writeFile(join(frontDirectory, 'index.html'), '<main>ContainerHub</main>')
    await writeFile(join(frontDirectory, 'app.js'), 'console.log("ContainerHub")')
    const fastify = Fastify()
    await registerFrontendStatic(fastify, frontDirectory)
    await fastify.ready()

    try {
        const asset = await fastify.inject({method: 'GET', url: '/app.js'})
        assert.equal(asset.statusCode, 200)
        assert.equal(asset.body, 'console.log("ContainerHub")')

        const applicationRoute = await fastify.inject({method: 'GET', url: '/nodes'})
        assert.equal(applicationRoute.statusCode, 200)
        assert.equal(applicationRoute.body, '<main>ContainerHub</main>')

        const missingApiRoute = await fastify.inject({method: 'GET', url: '/api/missing'})
        assert.equal(missingApiRoute.statusCode, 404)
    } finally {
        await fastify.close()
    }
})
