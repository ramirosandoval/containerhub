import {AbstractService} from '@drax/crud-back'
import type {IDraxCrudRepository, IDraxFieldFilter} from '@drax/crud-share'
import type {IMonitoring} from '../interfaces/IMonitoring.js'
import type {IMonitoringMetrics, IMonitoringSample, IMonitoringSampleBase} from '../interfaces/IMonitoringSample.js'
import {MonitoringSampleBaseSchema, MonitoringSampleSchema} from '../schemas/MonitoringSampleSchema.js'

export class MonitoringSampleService extends AbstractService<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>> {
    constructor(repository: IDraxCrudRepository<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>>) {
        super(repository, MonitoringSampleBaseSchema, MonitoringSampleSchema)
    }

    async record(configuration: IMonitoring, task: {id: string; nodeId?: string}, metrics: IMonitoringMetrics): Promise<IMonitoringSample> {
        const sampledAt = new Date(metrics.sampledAt ?? Date.now())
        return this.create({
            sampleKey: `${configuration._id}:${task.id}:${sampledAt.toISOString()}`,
            configurationId: configuration._id, serviceId: configuration.serviceId, serviceName: configuration.serviceName,
            taskId: task.id, nodeId: task.nodeId ?? null, sampledAt, metrics
        })
    }

    async history(configurationId: string, options: {since?: Date; until?: Date; limit?: number} = {}): Promise<IMonitoringSample[]> {
        const filters: IDraxFieldFilter[] = [{field: 'configurationId', operator: 'eq', value: configurationId}]
        if (options.since) filters.push({field: 'sampledAt', operator: 'gte', value: options.since})
        if (options.until) filters.push({field: 'sampledAt', operator: 'lte', value: options.until})
        return this.find({limit: Math.min(options.limit ?? 500, 1_000), orderBy: 'sampledAt', order: 'asc', search: '', filters})
    }

    async prune(configuration: IMonitoring, now = new Date()): Promise<number> {
        if (configuration.type !== 'permanent' || !configuration.holdingTime) return 0
        const before = new Date(now.getTime() - configuration.holdingTime * 86_400_000)
        return this.deleteMatching([
            {field: 'configurationId', operator: 'eq', value: configuration._id},
            {field: 'sampledAt', operator: 'lt', value: before}
        ])
    }

    async deleteForConfiguration(configurationId: string): Promise<number> {
        return this.deleteMatching([{field: 'configurationId', operator: 'eq', value: configurationId}])
    }

    private async deleteMatching(filters: IDraxFieldFilter[]): Promise<number> {
        let deleted = 0
        for (;;) {
            const samples = await this.find({limit: 500, orderBy: 'sampledAt', order: 'asc', search: '', filters})
            if (!samples.length) return deleted
            for (const sample of samples) { await this.delete(sample._id); deleted++ }
        }
    }
}
