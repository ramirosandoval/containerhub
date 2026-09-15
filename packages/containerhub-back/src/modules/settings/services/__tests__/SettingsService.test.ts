import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {ValidationError} from '@drax/common-back'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'

let settingsLookups = 0
const settingsModelMock = mock.module('../../models/Settings.js', {
    namedExports: {
        Settings: {
            findOne: async () => {
                settingsLookups++
                return {
                    maxLogsLines: 10000,
                    maxMonitoredTasksQuantity: 1000,
                    monitorizationTasksInterval: 60,
                    save: async () => undefined
                }
            }
        }
    }
})
const {SettingsService} = await import('../SettingsService.js')
const {SettingsRoutes} = await import('../../routes/SettingsRoutes.js')

test.after(() => settingsModelMock.restore())

test('settings reject non-positive values before persistence', async () => {
    await assert.rejects(
        SettingsService.updateSettings({maxLogsLines: 0}),
        ValidationError
    )
    assert.equal(settingsLookups, 0)
})

test('settings route preserves the Drax validation response with Fastify validation disabled', async () => {
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.addHook('onRequest', async (request: any) => {
        request.rbac = {assertPermission: () => undefined}
    })
    await server.register(SettingsRoutes)

    try {
        const response = await server.inject({method: 'PUT', url: '/api/settings', payload: {maxLogsLines: 0}})

        assert.equal(response.statusCode, 422)
        assert.equal(response.json().error, 'ValidationError')
        assert.equal(response.json().inputErrors[0]?.field, 'maxLogsLines')
        assert.equal(settingsLookups, 0)
    } finally {
        await server.close()
    }
})
