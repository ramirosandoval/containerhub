import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {appendStatisticsSample, pollIntervalMilliseconds, sparklinePoints, type TaskStatisticsMetrics} from '../taskStatistics.js'

const sample = (cpuPercentage: number | null): TaskStatisticsMetrics => ({
    sampledAt: `2026-09-09T12:00:0${cpuPercentage ?? 0}Z`,
    cpuUsage: {cpuPercentage, cpuCoreQuantity: 2},
    memoryUsage: {memoryTotalUsage: 1024, memoryLimitUsage: 2048},
    ioUsage: {readIoBytes: 10, writeIoBytes: 20},
    networksUsage: [{network: 'eth0', rxBytes: 30, txBytes: 40}]
})

test('task statistics keeps a bounded sample history and maps supported polling intervals', () => {
    assert.deepEqual(appendStatisticsSample([sample(1), sample(2)], sample(3), 2).map(entry => entry.cpuUsage.cpuPercentage), [2, 3])
    assert.equal(pollIntervalMilliseconds('5s'), 5_000)
    assert.equal(pollIntervalMilliseconds('60s'), 60_000)
    assert.throws(() => pollIntervalMilliseconds('1s'), /Unsupported polling interval/)
})

test('task statistics produces a native SVG sparkline without fabricating missing samples', () => {
    assert.equal(sparklinePoints([null, 10, 20], 100, 40), '50,40 100,0')
    assert.equal(sparklinePoints([5], 100, 40), '0,20')
    assert.equal(sparklinePoints([null], 100, 40), '')
})

test('services expose a protected task statistics page with bounded polling teardown', async () => {
    const [servicesPage, statisticsPage, router] = await Promise.all([
        readFile(new URL('../ServicesPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../TaskStatisticsPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../../router/index.ts', import.meta.url), 'utf8')
    ])

    assert.match(servicesPage, /openStatistics\(task\)/)
    assert.match(router, /path: '\/statistics\/:taskId'/)
    assert.match(router, /permission: 'DOCKER_VIEW'/)
    assert.match(statisticsPage, /\/api\/docker\/task\/\$\{encodeURIComponent\(taskId\.value\)\}\/stats/)
    assert.match(statisticsPage, /onBeforeUnmount\([^\n]*stopPolling\(\)/)
    assert.match(statisticsPage, /h\('svg'/)
})
