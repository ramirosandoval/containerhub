import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'

export interface ITaskMonitorization {
    _id: string; date: string; status: 'running' | 'removed'
    taskId: string; nodeId: string; nodeName: string
    serviceId: string; serviceName: string; modifiedBy: string | null
}

interface PaginatedTaskMonitorizations {
    items: ITaskMonitorization[]; total: number; page: number; limit: number; totalPages: number
}

const taskMonitorizationProvider: IDraxCrudProvider<ITaskMonitorization, never, never> = {
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<ITaskMonitorization>> {
        const response = await restGet<PaginatedTaskMonitorizations>('/api/task-monitorizations', {page: options.page, limit: options.limit})
        return {items: response.items, total: response.total, page: response.page, limit: response.limit}
    }
}

class TaskMonitorizationCrud extends EntityCrud {
    private static singleton: TaskMonitorizationCrud | null = null
    static get instance(): TaskMonitorizationCrud { return this.singleton ??= new TaskMonitorizationCrud() }

    override name = 'taskMonitorization'
    override get identifier(): string { return '_id' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return taskMonitorizationProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'date', key: 'date'}, {title: 'status', key: 'status'},
            {title: 'taskId', key: 'taskId'}, {title: 'nodeName', key: 'nodeName'},
            {title: 'serviceName', key: 'serviceName'}, {title: 'modifiedBy', key: 'modifiedBy'}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: '_id', type: 'string', label: 'id', default: ''},
            {name: 'date', type: 'date', label: 'date', default: ''},
            {name: 'status', type: 'string', label: 'status', default: ''},
            {name: 'taskId', type: 'string', label: 'taskId', default: ''},
            {name: 'nodeName', type: 'string', label: 'nodeName', default: ''},
            {name: 'serviceName', type: 'string', label: 'serviceName', default: ''},
            {name: 'modifiedBy', type: 'string', label: 'modifiedBy', default: null}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return false }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return false }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default TaskMonitorizationCrud
export {TaskMonitorizationCrud}
