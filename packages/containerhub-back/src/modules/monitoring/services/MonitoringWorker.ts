export interface MonitoringWorkerCollector {
    start(): void
    stop(): void | Promise<void>
}

export interface MonitoringWorkerSignals {
    once(signal: NodeJS.Signals, listener: () => void): unknown
}

export async function runMonitoringWorker(
    collector: MonitoringWorkerCollector,
    signals: MonitoringWorkerSignals = process
): Promise<void> {
    collector.start()
    const keepAlive = setInterval(() => undefined, 2 ** 31 - 1)
    try {
        await new Promise<void>((resolve) => {
            signals.once('SIGINT', resolve)
            signals.once('SIGTERM', resolve)
        })
    } finally {
        clearInterval(keepAlive)
        await collector.stop()
    }
}