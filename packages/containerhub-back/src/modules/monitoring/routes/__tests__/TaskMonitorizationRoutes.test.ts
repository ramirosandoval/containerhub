import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'

let taskQueries = 0
const taskMonitorizationModelMock = mock.module('../../models/TaskMonitorization.js', {
    namedExports: {
        TaskMonitorizationModel: {
            find: () => {
                taskQueries++
                const query = {
                    sort: () => query,
                    skip: () => query,
                    limit: async () => []
                }
                return query
            },
            countDocuments: async () => 0
        }
    }
})
const {TaskMonitorizationRoutes} = await import('../TaskMonitorizationRoutes.js')

test.after(() => taskMonitorizationModelMock.restore())

test('task lifecycle rejects invalid pagination before querying Mongo', async () => {
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.decorateRequest('rbac')
    server.addHook('onRequest', async (request: any) => {
        ;(request as any).rbac = {assertPermission: () => undefined}
    })
    await server.register(TaskMonitorizationRoutes)

    try {
        const response = await server.inject('/api/task-monitorizations?page=0&limit=20')
        assert.equal(response.statusCode, 422, response.body)
        assert.equal(taskQueries, 0)
    } finally {
        await server.close()
    }
})
