import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'

type ServiceStack = {stack: string | null}
export type StackSummary = {name: string; services: number}

function matchesSearch(item: StackSummary, search: string): boolean {
    return item.name.toLowerCase().includes(search.toLowerCase())
}

const stacksProvider: IDraxCrudProvider<StackSummary, never, never> = withClientCsvExport<StackSummary, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<StackSummary>> {
        const services = await restGet<ServiceStack[]>('/api/services')
        const counts = new Map<string, number>()
        for (const service of services) {
            if (service.stack) counts.set(service.stack, (counts.get(service.stack) ?? 0) + 1)
        }
        let items: StackSummary[] = [...counts].map(([name, serviceCount]) => ({name, services: serviceCount}))
        if (options.search) items = items.filter(item => matchesSearch(item, options.search!))
        const orderBy = options.orderBy ?? 'name'
        const direction = options.order === 'desc' ? -1 : 1
        items.sort((a, b) => {
            const va = String((a as Record<string, unknown>)[orderBy] ?? '')
            const vb = String((b as Record<string, unknown>)[orderBy] ?? '')
            return va.localeCompare(vb) * direction
        })
        const start = (options.page - 1) * options.limit
        return {items: items.slice(start, start + options.limit), total: items.length, page: options.page, limit: options.limit}
    },
    async fetchAll(): Promise<StackSummary[]> {
        const services = await restGet<ServiceStack[]>('/api/services')
        const counts = new Map<string, number>()
        for (const service of services) {
            if (service.stack) counts.set(service.stack, (counts.get(service.stack) ?? 0) + 1)
        }
        return [...counts].map(([name, serviceCount]) => ({name, services: serviceCount})).sort((a, b) => a.name.localeCompare(b.name))
    }
})

class StacksCrud extends EntityCrud {
    private static singleton: StacksCrud | null = null
    static get instance(): StacksCrud { return this.singleton ??= new StacksCrud() }

    override name = 'stack'
    override get identifier(): string { return 'name' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return stacksProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'name', key: 'name'}, {title: 'services', key: 'services'}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [{title: 'stacks.open', key: 'actions', sortable: false}] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'name', type: 'string', label: 'name', default: ''},
            {name: 'services', type: 'number', label: 'services', default: 0}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['name', 'services'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default StacksCrud
export {StacksCrud}
