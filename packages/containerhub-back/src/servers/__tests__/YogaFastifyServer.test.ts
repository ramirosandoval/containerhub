import assert from 'node:assert/strict'
import test from 'node:test'
import YogaFastifyServer from '../YogaFastifyServer.js'

test('keeps route JSON schemas as documentation without validating or coercing requests', async () => {
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}})
    server.fastify.get('/validated', {
        schema: {
            querystring: {
                type: 'object',
                required: ['page'],
                properties: {page: {type: 'integer', minimum: 1}}
            }
        }
    }, async (request: {query: {page: string}}) => ({page: request.query.page}))

    try {
        const response = await server.fastify.inject({method: 'GET', url: '/validated?page=0'})

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {page: '0'})
    } finally {
        await server.fastify.close()
    }
})
