import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {COMMON, CommonConfig, DraxConfig} from '@drax/common-back'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'

let paginateCalls = 0
let paginationQuery: Record<string, unknown> | undefined
let paginationOptions: Record<string, unknown> | undefined
const taskMonitorizationModelMock = mock.module('../../models/TaskMonitorization.js', {
    namedExports: {
        TaskMonitorizationModel: {
            schema: {path: () => undefined},
            find: () => {
                const query = {
                    sort: () => query,
                    skip: () => query,
                    limit: async () => []
                }
                return query
            },
            countDocuments: async () => 0,
            paginate: async (query: Record<string, unknown>, options: Record<string, unknown>) => {
                paginateCalls += 1
                paginationQuery = query
                paginationOptions = options
                return {
                    docs: [{taskId: 'task-1', serviceName: 'worker', status: 'running'}],
                    totalDocs: 1,
                }
            }
        }
    }
})
DraxConfig.set(CommonConfig.DbEngine, COMMON.DB_ENGINES.MONGODB)
const {TaskMonitorizationRoutes} = await import('../TaskMonitorizationRoutes.js')

test.after(() => taskMonitorizationModelMock.restore())

async function createServer() {
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.decorateRequest('rbac')
    server.addHook('onRequest', async (request: any) => {
        ;(request as any).rbac = {assertPermission: () => undefined}
    })
    await server.register(TaskMonitorizationRoutes)
    return server
}

test('task lifecycle rejects invalid pagination before querying Mongo', async () => {
    const server = await createServer()

    try {
        const response = await server.inject('/api/task-monitorizations?page=0&limit=20')
        assert.equal(response.statusCode, 422, response.body)
        assert.equal(paginateCalls, 0)
    } finally {
        await server.close()
    }
})

test('task lifecycle validates and forwards dynamic filters before pagination', async () => {
    const server = await createServer()
    const filters = encodeURIComponent(JSON.stringify([{field: 'status', operator: 'ne', value: 'removed'}]))

    try {
        const response = await server.inject(`/api/task-monitorizations?page=1&limit=20&orderBy=date&order=desc&search=worker&filters=${filters}`)
        assert.equal(response.statusCode, 200, response.body)
        assert.equal(response.json().total, 1)
        assert.equal(paginateCalls, 1)
        assert.match(JSON.stringify(paginationQuery), /status/)
        assert.match(JSON.stringify(paginationQuery), /serviceName/)
        assert.deepEqual(paginationOptions?.sort, {date: -1})

        const invalidFilters = encodeURIComponent(JSON.stringify([{field: 'unknown', operator: 'eq', value: 'x'}]))
        const invalidResponse = await server.inject(`/api/task-monitorizations?filters=${invalidFilters}`)
        assert.equal(invalidResponse.statusCode, 422, invalidResponse.body)
        assert.equal(paginateCalls, 1)
    } finally {
        await server.close()
    }
})
