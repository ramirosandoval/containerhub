import assert from 'node:assert/strict'
import test, {mock} from 'node:test'

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
const records: {taskId: string}[] = []

const serviceMock = mock.module('../factory/MonitoringServiceFactory.js', {namedExports: {
    MonitoringServiceFactory: () => ({fetchAll: async () => [configuration]})
}})
const samplesMock = mock.module('../factory/MonitoringSampleServiceFactory.js', {namedExports: {
    MonitoringSampleServiceFactory: () => ({
        record: async (_configuration: unknown, task: {id: string}) => { records.push({taskId: task.id}) },
        prune: async () => 0
    })
}})
const statisticsMock = mock.module('../../services/services/ServiceService.js', {namedExports: {
    fetchServiceStats: async () => [{task: {id: 'running-task', nodeId: 'manager', state: 'running'}, metrics}],
    toServiceTaskModel: (task: {ID?: string; Status?: {State?: string}}) => ({id: task.ID ?? '', state: task.Status?.State})
}})
const {MonitoringCollectorFactory} = await import('../factory/MonitoringCollectorFactory.js')
const consoleInfo = mock.method(console, 'info', () => undefined)

test.after(() => { consoleInfo.mock.restore(); serviceMock.restore(); samplesMock.restore(); statisticsMock.restore() })
test.beforeEach(() => { records.length = 0 })

test('monitoring collector factory preserves normalized running task statistics', async () => {
    const result = await MonitoringCollectorFactory().collect(new Date('2026-09-17T14:40:00.000Z'))

    assert.deepEqual(result, {recorded: 1, failures: []})
    assert.deepEqual(records, [{taskId: 'running-task'}])
})
