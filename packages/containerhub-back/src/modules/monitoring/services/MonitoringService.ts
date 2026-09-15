import {AbstractService} from '@drax/crud-back'
import {NotFoundError, ValidationError} from '@drax/common-back'
import type {IDraxCrudRepository} from '@drax/crud-share'
import type {IMonitoring, IMonitoringBase, IMonitoringCreate} from '../interfaces/IMonitoring.js'
import {MonitoringBaseSchema, MonitoringSchema} from '../schemas/MonitoringSchema.js'

export class MonitoringService extends AbstractService<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>> {
    constructor(repository: IDraxCrudRepository<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>>) {
        super(repository, MonitoringBaseSchema, MonitoringSchema)
    }
    async createForServices(configuration: IMonitoringCreate, services: {id: string; name: string; stack: string | null}[]) {
        const serviceIds = [...new Set(configuration.serviceIds)]
        for (const serviceId of serviceIds) {
            if (!services.some(service => service.id === serviceId)) throw new NotFoundError(`Service ${serviceId}`)
        }
        const created: IMonitoring[] = []
        const skipped: string[] = []
        for (const serviceId of serviceIds) {
            if (await this.findOneBy('serviceId', serviceId)) { skipped.push(serviceId); continue }
            const service = services.find(service => service.id === serviceId)!
            try {
                created.push(await this.create({
                    serviceId, serviceName: service.name, serviceStack: service.stack,
                    type: configuration.type, status: 'monitoring', collectionInterval: configuration.collectionInterval,
                    collectionType: configuration.collectionType,
                    since: configuration.type === 'calendar' ? configuration.since! : null,
                    until: configuration.type === 'calendar' ? configuration.until! : null,
                    holdingTime: configuration.type === 'permanent' ? configuration.holdingTime! : null
                }))
            } catch (error) {
                if (!(error instanceof ValidationError) || !error.errors.some(field => field.field === 'serviceId') || !await this.findOneBy('serviceId', serviceId)) throw error
                skipped.push(serviceId)
            }
        }
        return {created, skipped}
    }
    async setStatus(id: string, status: IMonitoringBase['status']): Promise<IMonitoring> {
        if (!await this.findById(id)) throw new NotFoundError(`MonitoringConfiguration ${id}`)
        return this.updatePartial(id, {status})
    }
}
