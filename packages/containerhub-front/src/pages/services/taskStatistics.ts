export type TaskStatisticsMetrics = {
    sampledAt: string | null
    cpuUsage: {cpuPercentage: number | null; cpuCoreQuantity: number | null}
    memoryUsage: {memoryTotalUsage: number | null; memoryLimitUsage: number | null}
    ioUsage: {readIoBytes: number | null; writeIoBytes: number | null}
    networksUsage: Array<{network: string; rxBytes: number; txBytes: number}>
}

export type TaskStatisticsEnvelope = {task: {id: string; serviceId?: string; nodeId?: string}; metrics: TaskStatisticsMetrics | null}

const pollingIntervals = {"5s": 5_000, "10s": 10_000, "15s": 15_000, "30s": 30_000, "45s": 45_000, "60s": 60_000} as const
export type PollingInterval = keyof typeof pollingIntervals

export function pollIntervalMilliseconds(interval: string): number {
    const milliseconds = pollingIntervals[interval as PollingInterval]
    if (!milliseconds) throw new Error(`Unsupported polling interval: ${interval}`)
    return milliseconds
}

export function appendStatisticsSample(samples: TaskStatisticsMetrics[], sample: TaskStatisticsMetrics, limit = 25): TaskStatisticsMetrics[] {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Sample limit must be a positive integer')
    return [...samples, sample].slice(-limit)
}

export function sparklinePoints(values: Array<number | null>, width = 100, height = 40): string {
    const available = values.flatMap((value, index) => value === null || !Number.isFinite(value) ? [] : [{value, index}])
    if (!available.length) return ''
    const minimum = Math.min(...available.map(({value}) => value))
    const maximum = Math.max(...available.map(({value}) => value))
    return available.map(({value, index}) => {
        const x = values.length === 1 ? 0 : index / (values.length - 1) * width
        const y = minimum === maximum ? height / 2 : height - (value - minimum) / (maximum - minimum) * height
        return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`
    }).join(' ')
}
