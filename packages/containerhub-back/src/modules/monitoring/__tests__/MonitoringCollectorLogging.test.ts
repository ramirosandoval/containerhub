import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import type {MonitoringService} from '../services/MonitoringService.js'
import type {MonitoringSampleService} from '../services/MonitoringSampleService.js'
import {MonitoringCollector} from '../services/MonitoringCollector.js'

const configuration = {
    _id: 'monitoring-configuration', serviceId: 'service-id', serviceName: 'service-name', serviceStack: 'stack',
    type: 'permanent', status: 'monitoring', collectionInterval: '15s', collectionType: 'global',
    since: null, until: null, holdingTime: 1
}
const metrics = {
    sampledAt: '2026-09-17T14:40:00.000Z',
    cpuUsage: {cpuPercentage: 50, cpuCoreQuantity: 2},
    memoryUsage: {memoryTotalUsage: 1024, memoryLimitUsage: 2048},
    ioUsage: {readIoBytes: 1, writeIoBytes: 2},
    networksUsage: []
}
const now = new Date('2026-09-17T14:40:00.000Z')

test('monitoring collector logs persisted sample count', async () => {
    const loggedCollections: unknown[][] = []
    const consoleInfo = mock.method(console, 'info', (...arguments_: unknown[]) => loggedCollections.push(arguments_))
    const collector = new MonitoringCollector(
        {fetchAll: async () => [configuration]} as MonitoringService,
        {record: async () => undefined, prune: async () => 0} as unknown as MonitoringSampleService,
        async () => [{task: {id: 'running-task', nodeId: 'manager', state: 'running'}, metrics}]
    )
    try {
        assert.deepEqual(await collector.collect(now), {recorded: 1, failures: []})
        assert.deepEqual(loggedCollections, [['Monitoring collection completed', {recorded: 1, failures: 0}]])
    } finally {
        consoleInfo.mock.restore()
        await collector.stop()
    }
})

test('monitoring collector logs the failing service without task statistics', async () => {
    const loggedFailures: unknown[][] = []
    const consoleError = mock.method(console, 'error', (...arguments_: unknown[]) => loggedFailures.push(arguments_))
    const consoleInfo = mock.method(console, 'info', () => undefined)
    const collector = new MonitoringCollector(
        {fetchAll: async () => [configuration]} as MonitoringService,
        {record: async () => undefined, prune: async () => 0} as unknown as MonitoringSampleService,
        async () => { throw new Error('Agent for node worker is unavailable') }
    )
    try {
        assert.deepEqual(await collector.collect(now), {recorded: 0, failures: ['service-id']})
        assert.deepEqual(loggedFailures, [[
            'Monitoring collection failed',
            {serviceId: 'service-id', serviceName: 'service-name', error: 'Agent for node worker is unavailable'}
        ]])
    } finally {
        consoleError.mock.restore()
        consoleInfo.mock.restore()
        await collector.stop()
    }
})
