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
import {MonitoringCollector} from '../services/MonitoringCollector.js'
import {MonitoringRoutes} from '../routes/MonitoringRoutes.js'

const metrics = (cpuPercentage: number, sampledAt: string) => ({
    sampledAt,
    cpuUsage: {cpuPercentage, cpuCoreQuantity: 2},
    memoryUsage: {memoryTotalUsage: 1024, memoryLimitUsage: 2048},
    ioUsage: {readIoBytes: 10, writeIoBytes: 20},
    networksUsage: [{network: 'eth0', rxBytes: 30, txBytes: 40}]
})

const permanent = (serviceId: string, collectionType: 'replic' | 'global' = 'replic') => ({
    serviceId, serviceName: serviceId, serviceStack: 'stack', type: 'permanent' as const, status: 'monitoring' as const,
    collectionInterval: '15s' as const, collectionType, since: null, until: null, holdingTime: 1
})

test('monitoring collector persists bounded history, follows replicas and exposes protected samples', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-monitoring-history-'))
    const database = join(directory, 'monitoring.sqlite')
    const configurations = new MonitoringSqliteRepository(database)
    const samples = new MonitoringSampleSqliteRepository(database)
    configurations.build()
    samples.build()
    const monitoringService = new MonitoringService(configurations)
    const sampleService = new MonitoringSampleService(samples)
    const replicConfiguration = await monitoringService.create(permanent('service-replic'))
    const globalConfiguration = await monitoringService.create(permanent('service-global', 'global'))
    const now = new Date('2026-09-09T12:00:00.000Z')
    const fetchServiceStats = async (serviceId: string) => [
        {task: {id: `${serviceId}-one`, nodeId: 'manager', state: 'running'}, metrics: metrics(10, now.toISOString())},
        {task: {id: `${serviceId}-two`, nodeId: 'worker', state: 'running'}, metrics: metrics(20, now.toISOString())},
        {task: {id: `${serviceId}-old`, nodeId: 'worker', state: 'shutdown'}, metrics: null}
    ]
    const collector = new MonitoringCollector(monitoringService, sampleService, fetchServiceStats)
    const server = Fastify()
    server.decorateRequest('rbac')
    server.addHook('onRequest', async request => {
        request.rbac = new Rbac({id: 'test-user', username: 'tester', roleId: 'test-role', roleName: 'Test', session: 'test-session'}, {
            _id: 'test-role', name: 'Test', permissions: String(request.headers['x-permissions'] ?? '').split(','), childRoles: [], readonly: false
        })
    })
    await server.register(MonitoringRoutes, {service: monitoringService, sampleService, listServices: async () => []})
    try {
        assert.deepEqual(await collector.collect(now), {recorded: 3, failures: []})
        assert.deepEqual(await collector.collect(now), {recorded: 0, failures: []}, 'the same interval must not be sampled twice')
        assert.equal((await sampleService.history(replicConfiguration._id)).length, 1)
        assert.equal((await sampleService.history(globalConfiguration._id)).length, 2)

        const forbidden = await server.inject(`/api/monitoring-configurations/${replicConfiguration._id}/samples`)
        assert.equal(forbidden.statusCode, 403)
        const response = await server.inject({url: `/api/monitoring-configurations/${replicConfiguration._id}/samples?limit=25`, headers: {'x-permissions': 'DOCKER_VIEW'}})
        assert.equal(response.statusCode, 200, response.body)
        assert.equal(response.json().items[0].metrics.cpuUsage.cpuPercentage, 10)

        await sampleService.record(replicConfiguration, {id: 'expired', nodeId: 'manager'}, metrics(1, '2026-09-07T11:59:59.000Z'))
        assert.equal(await sampleService.prune(replicConfiguration, now), 1)
        assert.equal((await sampleService.history(replicConfiguration._id)).length, 1)
    } finally {
        collector.stop()
        await server.close()
        samples.close()
        configurations.close()
        await rm(directory, {recursive: true, force: true})
    }
})

test('monitoring collector follows the stored service name when a Swarm service is recreated', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-monitoring-recreated-service-'))
    const database = join(directory, 'monitoring.sqlite')
    const configurations = new MonitoringSqliteRepository(database)
    const samples = new MonitoringSampleSqliteRepository(database)
    configurations.build()
    samples.build()
    const monitoringService = new MonitoringService(configurations)
    const sampleService = new MonitoringSampleService(samples)
    const configuration = await monitoringService.create({...permanent('retired-service-id'), serviceName: 'containerhub_app'})
    const now = new Date('2026-09-09T12:00:00.000Z')
    const identifiers: string[] = []
    const collector = new MonitoringCollector(monitoringService, sampleService, async (identifier) => {
        identifiers.push(identifier)
        if (identifier === 'retired-service-id') throw new Error('Service not found')
        return [{task: {id: 'current-task', nodeId: 'manager', state: 'running'}, metrics: metrics(10, now.toISOString())}]
    })
    try {
        assert.deepEqual(await collector.collect(now), {recorded: 1, failures: []})
        assert.deepEqual(identifiers, ['retired-service-id', 'containerhub_app'])
        assert.equal((await sampleService.history(configuration._id)).length, 1)
    } finally {
        await collector.stop()
        samples.close()
        configurations.close()
        await rm(directory, {recursive: true, force: true})
    }
})
