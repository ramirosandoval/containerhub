import type {IMonitoring} from '../interfaces/IMonitoring.js'
import type {IMonitoringMetrics} from '../interfaces/IMonitoringSample.js'
import type {MonitoringService} from './MonitoringService.js'
import type {MonitoringSampleService} from './MonitoringSampleService.js'

export type ServiceStatistics = Array<{task: {id: string; nodeId?: string; state?: string}; metrics: IMonitoringMetrics | null}>

export class MonitoringCollector {
    private timer?: ReturnType<typeof setInterval>
    private collecting = false
    private readonly nextCollection = new Map<string, number>()

    constructor(
        private readonly configurations: MonitoringService,
        private readonly samples: MonitoringSampleService,
        private readonly fetchStatistics: (serviceId: string) => Promise<ServiceStatistics>
    ) {}

    async collect(now = new Date()): Promise<{recorded: number; failures: string[]}> {
        if (this.collecting) return {recorded: 0, failures: []}
        this.collecting = true
        let recorded = 0
        const failures: string[] = []
        try {
            for (const configuration of await this.configurations.fetchAll()) {
                if (!this.isDue(configuration, now)) continue
                this.nextCollection.set(configuration._id, now.getTime() + Number.parseInt(configuration.collectionInterval) * 1_000)
                try {
                    const statistics = (await this.fetchStatistics(configuration.serviceId)).filter(entry => entry.task.id && entry.metrics && entry.task.state === 'running')
                    const selected = configuration.collectionType === 'replic' ? statistics.slice(0, 1) : statistics
                    for (const {task, metrics} of selected) {
                        if (!metrics) continue
                        await this.samples.record(configuration, task, metrics)
                        recorded++
                    }
                    await this.samples.prune(configuration, now)
                } catch {
                    failures.push(configuration.serviceId)
                }
            }
            return {recorded, failures}
        } finally {
            this.collecting = false
        }
    }

    start(): void {
        if (this.timer) return
        // ponytail: one in-process scheduler; add a distributed lease only if the backend is deployed with multiple replicas.
        void this.collect()
        this.timer = setInterval(() => void this.collect(), 1_000)
        this.timer.unref?.()
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }

    private isDue(configuration: IMonitoring, now: Date): boolean {
        if (configuration.status !== 'monitoring' || (this.nextCollection.get(configuration._id) ?? 0) > now.getTime()) return false
        if (configuration.type !== 'calendar') return true
        const date = now.toISOString().slice(0, 10)
        return Boolean(configuration.since && configuration.until && configuration.since <= date && date <= configuration.until)
    }
}
