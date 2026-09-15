import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeContainerStats} from '../ContainerStats.js'

const sampledStats = {
    read: '2026-09-05T00:00:00Z',
    cpu_stats: {cpu_usage: {total_usage: 300}, system_cpu_usage: 2000, online_cpus: 4},
    precpu_stats: {cpu_usage: {total_usage: 100}, system_cpu_usage: 1000},
    memory_stats: {usage: 4096, limit: 8192, stats: {cache: 1024}},
    blkio_stats: {io_service_bytes_recursive: [
        {op: 'Read', value: 10}, {op: 'read', value: 20},
        {op: 'Write', value: 40}, {op: 'write', value: 50}, {op: 'Total', value: 120}
    ]},
    networks: {eth0: {rx_bytes: 100, tx_bytes: 200}, eth1: {rx_bytes: 300, tx_bytes: 400}}
}

test('normalizes legacy chart metrics with CPU deltas, total memory, every disk and interface', () => {
    assert.deepEqual(normalizeContainerStats(sampledStats), {
        sampledAt: sampledStats.read,
        cpuUsage: {cpuPercentage: 80, cpuCoreQuantity: 4},
        memoryUsage: {memoryTotalUsage: 4096, memoryLimitUsage: 8192},
        ioUsage: {readIoBytes: 30, writeIoBytes: 90},
        networksUsage: [{network: 'eth0', rxBytes: 100, txBytes: 200}, {network: 'eth1', rxBytes: 300, txBytes: 400}]
    })
    assert.equal(normalizeContainerStats({...sampledStats, cpu_stats: {...sampledStats.cpu_stats, online_cpus: undefined,
        cpu_usage: {total_usage: 300, percpu_usage: [100, 200]}}}).cpuUsage.cpuPercentage, 40)
})

test('unavailable samples and reset counters never become fabricated zero usage or non-finite percentages', () => {
    const emptyMetrics = normalizeContainerStats({cpu_stats: {}, memory_stats: {}})
    assert.deepEqual(emptyMetrics, {
        sampledAt: null, cpuUsage: {cpuPercentage: null, cpuCoreQuantity: null},
        memoryUsage: {memoryTotalUsage: null, memoryLimitUsage: null},
        ioUsage: {readIoBytes: null, writeIoBytes: null}, networksUsage: []
    })
    assert.equal(normalizeContainerStats({...sampledStats, precpu_stats: sampledStats.cpu_stats}).cpuUsage.cpuPercentage, null)
    assert.equal(normalizeContainerStats({...sampledStats, precpu_stats: {...sampledStats.precpu_stats, cpu_usage: {total_usage: 400}}}).cpuUsage.cpuPercentage, null)
    assert.equal(normalizeContainerStats({...sampledStats, precpu_stats: undefined}).cpuUsage.cpuPercentage, null)
    assert.deepEqual(normalizeContainerStats({...sampledStats, blkio_stats: {io_service_bytes_recursive: []}}).ioUsage,
        {readIoBytes: 0, writeIoBytes: 0})
    assert.throws(() => normalizeContainerStats({...sampledStats, networks: {eth0: {rx_bytes: 'bad', tx_bytes: 0}}}))
    assert.throws(() => normalizeContainerStats({...sampledStats, memory_stats: {usage: -1}}))
})
