import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {MonitoringSqliteRepository} from '../repository/MonitoringSqliteRepository.js'
import {MonitoringSampleSqliteRepository} from '../repository/MonitoringSampleSqliteRepository.js'
import {MonitoringService} from '../services/MonitoringService.js'
import {MonitoringSampleService} from '../services/MonitoringSampleService.js'

test('bounded history returns the newest samples in chronological order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-monitoring-latest-'))
    const database = join(directory, 'monitoring.sqlite')
    const configurations = new MonitoringSqliteRepository(database)
    const samples = new MonitoringSampleSqliteRepository(database)
    configurations.build()
    samples.build()
    const monitoringService = new MonitoringService(configurations)
    const sampleService = new MonitoringSampleService(samples)
    try {
        const configuration = await monitoringService.create({
            serviceId: 'service-latest', serviceName: 'service-latest', serviceStack: 'stack',
            type: 'permanent', status: 'monitoring', collectionInterval: '15s',
            collectionType: 'replic', since: null, until: null, holdingTime: 1
        })
        for (const [index, timestamp] of ['2026-09-09T00:00:00.000Z', '2026-09-09T00:00:01.000Z', '2026-09-09T00:00:02.000Z'].entries()) {
            await sampleService.record(configuration, {id: 'task-one'}, {
                sampledAt: timestamp,
                cpuUsage: {cpuPercentage: index, cpuCoreQuantity: 2},
                memoryUsage: {memoryTotalUsage: 1024, memoryLimitUsage: 2048},
                ioUsage: {readIoBytes: 10, writeIoBytes: 20},
                networksUsage: [{network: 'eth0', rxBytes: 30, txBytes: 40}]
            })
        }
        const history = await sampleService.history(configuration._id, {limit: 2})
        assert.deepEqual(history.map(sample => sample.metrics.cpuUsage.cpuPercentage), [1, 2])
    } finally {
        samples.close()
        configurations.close()
        await rm(directory, {recursive: true, force: true})
    }
})
