import {z} from 'zod'

const counter = z.number().finite().nonnegative()
const cpuSample = z.object({
    cpu_usage: z.object({total_usage: counter.optional(), percpu_usage: z.array(counter).optional()}).optional(),
    system_cpu_usage: counter.optional(), online_cpus: counter.int().optional()
})
const containerStatsSchema = z.object({
    read: z.string().optional(),
    cpu_stats: cpuSample,
    precpu_stats: cpuSample.optional(),
    memory_stats: z.object({usage: counter.optional(), limit: counter.optional()}),
    blkio_stats: z.object({io_service_bytes_recursive: z.array(z.object({op: z.string(), value: counter})).nullish()}).optional(),
    networks: z.record(z.string(), z.object({rx_bytes: counter, tx_bytes: counter})).optional()
})

export function normalizeContainerStats(rawStats: unknown) {
    const stats = containerStatsSchema.parse(rawStats)
    const cpuCoreQuantity = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage?.percpu_usage?.length ?? null
    const cpuDelta = (stats.cpu_stats.cpu_usage?.total_usage ?? NaN) - (stats.precpu_stats?.cpu_usage?.total_usage ?? NaN)
    const systemDelta = (stats.cpu_stats.system_cpu_usage ?? NaN) - (stats.precpu_stats?.system_cpu_usage ?? NaN)
    // Docker Engine v1.47, ContainerStats: https://docs.docker.com/reference/api/engine/version/v1.47/#tag/Container/operation/ContainerStats
    const cpuPercentage = cpuDelta >= 0 && systemDelta > 0 && cpuCoreQuantity
        ? cpuDelta / systemDelta * cpuCoreQuantity * 100 : NaN
    const diskCounters = stats.blkio_stats?.io_service_bytes_recursive
    return {
        sampledAt: stats.read ?? null,
        cpuUsage: {cpuPercentage: Number.isFinite(cpuPercentage) ? cpuPercentage : null, cpuCoreQuantity},
        // Preserve legacy total usage (including cache), not Docker CLI working-set memory.
        memoryUsage: {memoryTotalUsage: stats.memory_stats.usage ?? null, memoryLimitUsage: stats.memory_stats.limit ?? null},
        ioUsage: {
            readIoBytes: diskCounters?.filter((entry) => entry.op.toLowerCase() === 'read').reduce((total, entry) => total + entry.value, 0) ?? null,
            writeIoBytes: diskCounters?.filter((entry) => entry.op.toLowerCase() === 'write').reduce((total, entry) => total + entry.value, 0) ?? null
        },
        networksUsage: Object.entries(stats.networks ?? {}).map(([network, counters]) => ({network, rxBytes: counters.rx_bytes, txBytes: counters.tx_bytes}))
    }
}
