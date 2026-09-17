import type {IMonitoring} from '../interfaces/IMonitoring.js'
import type {IMonitoringMetrics} from '../interfaces/IMonitoringSample.js'
import type {MonitoringService} from './MonitoringService.js'
import type {MonitoringSampleService} from './MonitoringSampleService.js'

export type ServiceStatistics = Array<{task: {id: string; nodeId?: string; state?: string}; metrics: IMonitoringMetrics | null}>

export class MonitoringCollector {
    private timer?: ReturnType<typeof setInterval>
    private scheduledCollection?: Promise<unknown>
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
                    const statistics = (await this.fetchConfigurationStatistics(configuration)).filter(entry => entry.task.id && entry.metrics && entry.task.state === 'running')
                    const selected = configuration.collectionType === 'replic' ? statistics.slice(0, 1) : statistics
                    for (const {task, metrics} of selected) {
                        if (!metrics) continue
                        await this.samples.record(configuration, task, metrics)
                        recorded++
                    }
                    await this.samples.prune(configuration, now)
                } catch (error) {
                    failures.push(configuration.serviceId)
                    console.error('Monitoring collection failed', {
                        serviceId: configuration.serviceId,
                        serviceName: configuration.serviceName,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })
                }
            }
            if (recorded || failures.length) console.info('Monitoring collection completed', {recorded, failures: failures.length})
            return {recorded, failures}
        } finally {
            this.collecting = false
        }
    }

    start(): void {
        if (this.timer) return
        // ponytail: one in-process scheduler; add a distributed lease only if the backend is deployed with multiple replicas.
        this.collectScheduled()
        this.timer = setInterval(() => this.collectScheduled(), 1_000)
        this.timer.unref?.()
    }

    async stop(): Promise<void> {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
        await this.scheduledCollection
    }

    private collectScheduled(): void {
        if (this.collecting) return
        const collection = this.collect()
        this.scheduledCollection = collection
        void collection.then(
            () => {
                if (this.scheduledCollection === collection) this.scheduledCollection = undefined
            },
            () => {
                if (this.scheduledCollection === collection) this.scheduledCollection = undefined
            }
        )
    }

    private async fetchConfigurationStatistics(configuration: IMonitoring): Promise<ServiceStatistics> {
        try {
            return await this.fetchStatistics(configuration.serviceId)
        } catch (error) {
            if (!(error instanceof Error) || error.message !== 'Service not found' || configuration.serviceName === configuration.serviceId) throw error
            return await this.fetchStatistics(configuration.serviceName)
        }
    }

    private isDue(configuration: IMonitoring, now: Date): boolean {
        if (configuration.status !== 'monitoring' || (this.nextCollection.get(configuration._id) ?? 0) > now.getTime()) return false
        if (configuration.type !== 'calendar') return true
        const date = now.toISOString().slice(0, 10)
        return Boolean(configuration.since && configuration.until && configuration.since <= date && date <= configuration.until)
    }
}
