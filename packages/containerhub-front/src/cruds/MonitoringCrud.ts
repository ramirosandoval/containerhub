import {EntityCrud} from '@drax/crud-vue'
import {HttpRestClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import type {IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {restGet, restPost} from '@/rest'
import {authorizationHeader} from '@/restHeaders'

export type MonitoringConfiguration = {
    _id: string; serviceId: string; serviceName: string; serviceStack: string | null
    type: 'calendar' | 'permanent'; status: 'monitoring' | 'paused'
    collectionInterval: string; collectionType: 'replic' | 'global'
    since: string | null; until: string | null; holdingTime: number | null
}
export type MonitoringCreate = {
    serviceIds: string[]; type: 'calendar' | 'permanent'; collectionInterval: string
    collectionType: 'replic' | 'global'; since?: string; until?: string; holdingTime?: number
}
const basePath = '/api/monitoring-configurations'
export const monitoringProvider = new class implements IDraxCrudProvider<MonitoringConfiguration, never, never> {
    paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<MonitoringConfiguration>> {
        return restGet(basePath, {page: options.page, limit: options.limit, orderBy: options.orderBy || 'serviceName', order: options.order || 'asc', search: options.search || ''})
    }
    createForServices(configuration: MonitoringCreate): Promise<{created: MonitoringConfiguration[]; skipped: string[]}> { return restPost(basePath, configuration) }
    setStatus(id: string, action: 'pause' | 'resume'): Promise<MonitoringConfiguration> { return restPost(`${basePath}/${encodeURIComponent(id)}/${action}`, {}) }
    delete(id: string): Promise<unknown> {
        return HttpRestClientFactory.getInstance(import.meta.env.VITE_BACK_URL ?? '').delete(`${basePath}/${encodeURIComponent(id)}`, undefined, {headers: authorizationHeader(useAuthStore().accessToken)})
    }
    statuses(serviceIds: string[]): Promise<{serviceId: string; status: string}[]> {
        return serviceIds.length ? restGet(`${basePath}/statuses`, {serviceIds: serviceIds.join(',')}) : Promise.resolve([])
    }
}
class MonitoringCrud extends EntityCrud {
    private static singleton: MonitoringCrud | null = null
    static get instance(): MonitoringCrud { return this.singleton ??= new MonitoringCrud() }
    override name = 'monitoring'
    override get provider() { return monitoringProvider }
    override get identifier(): string { return '_id' }
}
export default MonitoringCrud
