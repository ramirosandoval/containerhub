import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'
import {applyClientFieldFilters} from './clientFieldFilters'

export type Node = {
    id?: string; hostname?: string; ip?: string; role?: string
    availability?: string; state?: string; engine?: string
    leader: boolean; reachability: string | null
    resources: {NanoCPUs?: number; MemoryBytes?: number} | null
    agentHealthy: boolean | null
}

function matchesSearch(item: Record<string, unknown>, search: string): boolean {
    const lower = search.toLowerCase()
    return Object.values(item).some(value => typeof value === 'string' && value.toLowerCase().includes(lower))
}

const nodesProvider: IDraxCrudProvider<Node, never, never> = withClientCsvExport<Node, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<Node>> {
        let items = await restGet<Node[]>('/api/docker/nodes')
        if (options.search) items = items.filter(item => matchesSearch(item as unknown as Record<string, unknown>, options.search!))
        items = applyClientFieldFilters(items, options.filters)
        if (options.orderBy) {
            const key = options.orderBy as keyof Node
            const direction = options.order === 'desc' ? -1 : 1
            items = [...items].sort((a, b) => {
                const va = String(a[key] ?? '')
                const vb = String(b[key] ?? '')
                return va.localeCompare(vb) * direction
            })
        }
        const start = (options.page - 1) * options.limit
        return {items: items.slice(start, start + options.limit), total: items.length, page: options.page, limit: options.limit}
    },
    async fetchAll(): Promise<Node[]> {
        return restGet<Node[]>('/api/docker/nodes')
    }
})

class NodesCrud extends EntityCrud {
    private static singleton: NodesCrud | null = null
    static get instance(): NodesCrud { return this.singleton ??= new NodesCrud() }

    override name = 'node'
    override get identifier(): string { return 'id' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_NODES_FETCH', manage: 'DOCKER_NODES_FETCH', create: 'DOCKER_NODES_FETCH', update: 'DOCKER_NODES_FETCH', delete: 'DOCKER_NODES_FETCH'} }
    override get provider() { return nodesProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'id', key: 'id'}, {title: 'hostname', key: 'hostname'}, {title: 'ip', key: 'ip'},
            {title: 'role', key: 'role'}, {title: 'availability', key: 'availability'}, {title: 'state', key: 'state'},
            {title: 'engine', key: 'engine'}, {title: 'leader', key: 'leader'}, {title: 'reachability', key: 'reachability'},
            {title: 'agentHealthy', key: 'agentHealthy', sortable: false}, {title: 'resources', key: 'resources', sortable: false}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'id', type: 'string', label: 'id', default: ''}, {name: 'hostname', type: 'string', label: 'hostname', default: ''},
            {name: 'ip', type: 'string', label: 'ip', default: ''}, {name: 'role', type: 'string', label: 'role', default: ''},
            {name: 'availability', type: 'string', label: 'availability', default: ''}, {name: 'state', type: 'string', label: 'state', default: ''},
            {name: 'engine', type: 'string', label: 'engine', default: ''}, {name: 'leader', type: 'boolean', label: 'leader', default: false},
            {name: 'reachability', type: 'string', label: 'reachability', default: null}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['id', 'hostname', 'ip', 'role', 'availability', 'state', 'engine', 'leader', 'reachability'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default NodesCrud
export {NodesCrud}
