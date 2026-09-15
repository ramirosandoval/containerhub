import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import Fastify from 'fastify'
import {Rbac} from '@drax/identity-back'
import {MonitoringSqliteRepository} from '../repository/MonitoringSqliteRepository.js'
import {MonitoringSampleSqliteRepository} from '../repository/MonitoringSampleSqliteRepository.js'
import {MonitoringService} from '../services/MonitoringService.js'
import {MonitoringSampleService} from '../services/MonitoringSampleService.js'
import {MonitoringRoutes} from '../routes/MonitoringRoutes.js'

test('monitoring configurations persist, skip duplicates, search, pause/resume and delete with separate permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-monitoring-'))
    const database = join(directory, 'monitoring.sqlite')
    const repository = new MonitoringSqliteRepository(database)
    const sampleRepository = new MonitoringSampleSqliteRepository(database)
    repository.build()
    sampleRepository.build()
    const service = new MonitoringService(repository)
    const sampleService = new MonitoringSampleService(sampleRepository)
    const server = Fastify()
    const services = [{id: 'service-api', name: 'shop_api', stack: 'shop'}, {id: 'service-web', name: 'shop_web', stack: null}]
    server.decorateRequest('rbac')
    server.addHook('onRequest', async (request) => {
        request.rbac = new Rbac({id: 'test-user', username: 'tester', roleId: 'test-role', roleName: 'Test', session: 'test-session'}, {
            _id: 'test-role', name: 'Test', permissions: String(request.headers['x-permissions'] ?? '').split(','), childRoles: [], readonly: false
        })
    })
    await server.register(MonitoringRoutes, {service, sampleService, listServices: async () => services})
    const permissions = 'DOCKER_VIEW,DOCKER_MONITORING_CREATE,DOCKER_MONITORING_PAUSE,DOCKER_MONITORING_DELETE'
    const headers = {'x-permissions': permissions}
    const permanentConfiguration = {serviceIds: ['service-api', 'service-web'], type: 'permanent', collectionInterval: '15s', collectionType: 'replic', holdingTime: 30}
    try {
        assert.equal((await server.inject({method: 'POST', url: '/api/monitoring-configurations', payload: permanentConfiguration})).statusCode, 403)
        const createdResponse = await server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: permanentConfiguration})
        assert.equal(createdResponse.statusCode, 200, createdResponse.body)
        const created = createdResponse.json().created
        assert.equal(created.length, 2)
        const configurationId = created[0]._id
        const pauseResponse = await server.inject({method: 'POST', url: `/api/monitoring-configurations/${configurationId}/pause`, headers, payload: {}})
        assert.equal(pauseResponse.statusCode, 200, pauseResponse.body)
        assert.equal(pauseResponse.json().status, 'paused')
        const duplicateResponse = await server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: permanentConfiguration})
        assert.deepEqual(duplicateResponse.json().skipped, ['service-api', 'service-web'])
        assert.equal((await service.findById(configurationId))?.status, 'paused')
        const restoredRepository = new MonitoringSqliteRepository(join(directory, 'monitoring.sqlite'))
        try { assert.equal((await restoredRepository.findById(configurationId))?.status, 'paused') } finally { restoredRepository.close() }
        const searchResponse = await server.inject({url: '/api/monitoring-configurations?page=1&limit=5&search=API&orderBy=serviceName&order=asc', headers})
        assert.equal(searchResponse.json().total, 1, searchResponse.body)
        assert.equal(searchResponse.json().items[0].serviceName, 'shop_api')
        assert.equal((await server.inject({url: '/api/monitoring-configurations?orderBy=unknown', headers})).statusCode, 400)
        const statuses = await server.inject({url: '/api/monitoring-configurations/statuses?serviceIds=service-api,service-web', headers})
        assert.equal(statuses.json().length, 2)
        assert.equal((await server.inject({method: 'POST', url: `/api/monitoring-configurations/${configurationId}/resume`, headers: {'x-permissions': 'DOCKER_VIEW'}, payload: {}})).statusCode, 403)
        const resume = await server.inject({method: 'POST', url: `/api/monitoring-configurations/${configurationId}/resume`, headers, payload: {status: 'processing'}})
        assert.equal(resume.statusCode, 400)
        assert.equal((await server.inject({method: 'POST', url: `/api/monitoring-configurations/${configurationId}/resume`, headers, payload: {}})).json().status, 'monitoring')
        const invalidCalendar = {...permanentConfiguration, type: 'calendar', since: '2026-09-10', until: '2026-09-09'}
        assert.equal((await server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: invalidCalendar})).statusCode, 400)
        assert.equal((await server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: {...permanentConfiguration, serviceIds: ['missing-service']}})).statusCode, 404)
        assert.equal((await server.inject({method: 'DELETE', url: `/api/monitoring-configurations/${configurationId}`, headers})).statusCode, 200)
        assert.ok(!await service.findById(configurationId))
        assert.equal((await server.inject({method: 'POST', url: `/api/monitoring-configurations/${configurationId}/pause`, headers, payload: {}})).statusCode, 404)
        const calendarConfiguration = {...permanentConfiguration, serviceIds: ['service-api'], type: 'calendar', since: '2026-09-10', until: '2026-09-11'}
        const concurrentCreations = await Promise.all([
            server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: calendarConfiguration}),
            server.inject({method: 'POST', url: '/api/monitoring-configurations', headers, payload: calendarConfiguration})
        ])
        for (const response of concurrentCreations) assert.equal(response.statusCode, 200, response.body)
        const calendarCreations = concurrentCreations.flatMap(response => response.json().created)
        assert.equal(calendarCreations.length, 1)
        assert.equal(calendarCreations[0].since, '2026-09-10')
        assert.equal(concurrentCreations.flatMap(response => response.json().skipped).length, 1)
    } finally {
        await server.close()
        sampleRepository.close()
        repository.close()
        await rm(directory, {recursive: true, force: true})
    }
})
