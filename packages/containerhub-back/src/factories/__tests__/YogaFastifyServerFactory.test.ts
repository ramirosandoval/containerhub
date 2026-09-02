import assert from 'node:assert/strict'
import test from 'node:test'
import YogaFastifyServerFactory from '../YogaFastifyServerFactory.js'

type DocumentedOperation = {
    summary?: string
    parameters?: Array<{name?: string}>
    responses?: Record<string, unknown>
    security?: Array<{bearerAuth?: string[]}>
}
type DocumentedPath = {
    get?: DocumentedOperation
    post?: DocumentedOperation
    put?: DocumentedOperation
    delete?: DocumentedOperation
}

process.env.DRAX_DB_ENGINE = 'mongo'

test('publishes an OpenAPI document for ContainerHub REST routes', async () => {
    const server = YogaFastifyServerFactory()
    try {
        await server.fastify.ready()
        const openApiDocument = (server.fastify as {swagger(): {openapi: string; paths: Record<string, unknown>; components?: {securitySchemes?: Record<string, unknown>}}}).swagger()

        assert.equal(openApiDocument.openapi, '3.0.3')
        assert.ok(openApiDocument.paths['/api/services'])
        assert.deepEqual(openApiDocument.components?.securitySchemes?.bearerAuth, {
            type: 'http', scheme: 'bearer', bearerFormat: 'JWT'
        })
        const documentedPaths = openApiDocument.paths as Record<string, DocumentedPath>
        assert.deepEqual(documentedPaths['/api/services']?.get?.security, [{bearerAuth: []}])
        const paginatedServices = documentedPaths['/api/services/paginate']?.get
        assert.equal(paginatedServices?.parameters?.some((parameter) => parameter.name === 'orderBy'), true)
        assert.equal(documentedPaths['/api/registry/image']?.get?.summary, 'List registry images')
        assert.equal(documentedPaths['/api/gitlab/project']?.get?.summary, 'List GitLab projects')

        const localOperations = Object.entries(documentedPaths)
            .filter(([path]) => /^\/api\/(services|docker|registry|gitlab)/.test(path))
            .flatMap(([, path]) => Object.values(path).filter((operation): operation is DocumentedOperation => Boolean(operation)))
        for (const operation of localOperations) {
            assert.ok(operation.summary)
            assert.deepEqual(operation.security, [{bearerAuth: []}])
            assert.ok(operation.responses?.['200'])
        }

        const documentationResponse = await server.fastify.inject({method: 'GET', url: '/documentation'})
        assert.equal(documentationResponse.statusCode, 200)
    } finally {
        await server.fastify.close()
    }
})
