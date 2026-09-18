import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'
import {applyClientFieldFilters} from './clientFieldFilters'

export type GhostContainer = {Created: number; Image?: string; Status?: string; Id?: string; NodeID?: string}

function matchesSearch(item: GhostContainer, search: string): boolean {
    const lower = search.toLowerCase()
    return [item.Image, item.Status, item.Id, item.NodeID].some(val => typeof val === 'string' && val.toLowerCase().includes(lower))
}

const ghostContainersProvider: IDraxCrudProvider<GhostContainer, never, never> = withClientCsvExport<GhostContainer, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<GhostContainer>> {
        let items = await restGet<GhostContainer[]>('/api/docker/ghostContainers')
        if (options.search) items = items.filter(item => matchesSearch(item, options.search!))
        items = applyClientFieldFilters(items, options.filters)
        if (options.orderBy) {
            const key = options.orderBy as keyof GhostContainer
            const direction = options.order === 'desc' ? -1 : 1
            items = [...items].sort((a, b) => {
                const va = a[key] ?? ''
                const vb = b[key] ?? ''
                return String(va).localeCompare(String(vb)) * direction
            })
        }
        const start = (options.page - 1) * options.limit
        return {items: items.slice(start, start + options.limit), total: items.length, page: options.page, limit: options.limit}
    },
    async fetchAll(): Promise<GhostContainer[]> {
        return restGet<GhostContainer[]>('/api/docker/ghostContainers')
    }
})

class GhostContainersCrud extends EntityCrud {
    private static singleton: GhostContainersCrud | null = null
    static get instance(): GhostContainersCrud { return this.singleton ??= new GhostContainersCrud() }

    override name = 'ghostContainer'
    override get identifier(): string { return 'Id' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return ghostContainersProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'created', key: 'Created'}, {title: 'image', key: 'Image'},
            {title: 'status', key: 'Status'}, {title: 'id', key: 'Id'}, {title: 'node', key: 'NodeID'}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'Created', type: 'number', label: 'created', default: 0},
            {name: 'Image', type: 'string', label: 'image', default: ''},
            {name: 'Status', type: 'string', label: 'status', default: ''},
            {name: 'Id', type: 'string', label: 'id', default: ''},
            {name: 'NodeID', type: 'string', label: 'node', default: ''}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['Created', 'Image', 'Status', 'Id', 'NodeID'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default GhostContainersCrud
export {GhostContainersCrud}
