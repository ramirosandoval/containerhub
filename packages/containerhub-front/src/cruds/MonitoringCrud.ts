import {EntityCrud} from '@drax/crud-vue'
import {HttpRestClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {restGet, restPost} from '@/rest'
import {authorizationHeader} from '@/restHeaders'
import {activeMonitoringFilters} from './MonitoringFilters'

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
        const filters = activeMonitoringFilters(options.filters ?? [])
        return restGet(basePath, {
            page: options.page,
            limit: options.limit,
            orderBy: options.orderBy || 'serviceName',
            order: options.order || 'asc',
            search: options.search || '',
            filters: filters.length ? JSON.stringify(filters) : ''
        })
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
    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'status', key: 'status'},
            {title: 'service', key: 'serviceName'},
            {title: 'interval', key: 'collectionInterval'},
            {title: 'period', key: 'period', sortable: false}
        ]
    }
    override get actionHeaders(): IEntityCrud['actionHeaders'] {
        return [{title: 'monitoring.actions', key: 'actions', sortable: false}]
    }
    override get filters(): IEntityCrud['filters'] {
        return [
            {name: 'serviceName', type: 'string', label: 'service', default: null, operator: 'like'},
            {name: 'status', type: 'enum', label: 'status', default: null, operator: 'eq', enum: ['monitoring', 'paused']},
            {name: 'type', type: 'enum', label: 'type', default: null, operator: 'eq', enum: ['calendar', 'permanent']},
            {name: 'collectionType', type: 'enum', label: 'collectionType', default: null, operator: 'eq', enum: ['replic', 'global']}
        ]
    }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'serviceName', type: 'string', label: 'service', default: null},
            {name: 'status', type: 'enum', label: 'status', default: null, enum: ['monitoring', 'paused']},
            {name: 'type', type: 'enum', label: 'type', default: null, enum: ['calendar', 'permanent']},
            {name: 'collectionType', type: 'enum', label: 'collectionType', default: null, enum: ['replic', 'global']}
        ]
    }
    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isExportable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isSavedQueriesEnabled(): boolean { return false }
    override get searchEnable(): boolean { return true }
    override get filtersEnable(): boolean { return true }
    override get dynamicFiltersEnable(): boolean { return true }
    override get filterButtons(): boolean { return false }
}
export default MonitoringCrud
