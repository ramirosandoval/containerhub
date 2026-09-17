import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {filterNetworks, networkFiltersFromDrax} from '@/pages/networkFilters'
import {withClientCsvExport} from './clientCsvExport'

export type Network = {
    Id: string
    Name: string
    Created: string
    Scope: string
    Driver: string
    EnableIPv6: boolean
    IPAM: {Driver: string; Config: {Subnet?: string; Gateway?: string}[]}
    Internal: boolean
    Attachable: boolean
    Ingress: boolean
    Labels: Record<string, string>
}

function matchesSearch(item: Network, search: string): boolean {
    const lower = search.toLowerCase()
    const subnet = item.IPAM?.Config?.[0]?.Subnet || ''
    const gateway = item.IPAM?.Config?.[0]?.Gateway || ''
    return [
        item.Name,
        item.Created,
        item.Driver,
        item.IPAM?.Driver,
        subnet,
        gateway
    ].some(val => typeof val === 'string' && val.toLowerCase().includes(lower))
}

const networksProvider: IDraxCrudProvider<Network, never, never> = withClientCsvExport<Network, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<Network>> {
        let items = await restGet<Network[]>('/api/docker/network')
        if (options.search) items = items.filter(item => matchesSearch(item, options.search!))
        items = filterNetworks(items, networkFiltersFromDrax(options.filters)) as Network[]
        if (options.orderBy) {
            const key = options.orderBy as string
            const direction = options.order === 'desc' ? -1 : 1
            items = [...items].sort((a, b) => {
                let va: any = (a as any)[key] ?? ''
                let vb: any = (b as any)[key] ?? ''

                if (key === 'subnet') {
                    va = a.IPAM?.Config?.[0]?.Subnet ?? ''
                    vb = b.IPAM?.Config?.[0]?.Subnet ?? ''
                } else if (key === 'gateway') {
                    va = a.IPAM?.Config?.[0]?.Gateway ?? ''
                    vb = b.IPAM?.Config?.[0]?.Gateway ?? ''
                } else if (key === 'IPAM.Driver') {
                    va = a.IPAM?.Driver ?? ''
                    vb = b.IPAM?.Driver ?? ''
                }

                return String(va).localeCompare(String(vb)) * direction
            })
        }
        const start = (options.page - 1) * options.limit
        return {items: items.slice(start, start + options.limit), total: items.length, page: options.page, limit: options.limit}
    },
    async fetchAll(): Promise<Network[]> {
        return restGet<Network[]>('/api/docker/network')
    }
})

class NetworksCrud extends EntityCrud {
    private static singleton: NetworksCrud | null = null
    static get instance(): NetworksCrud { return this.singleton ??= new NetworksCrud() }

    override name = 'network'
    override get identifier(): string { return 'Id' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return networksProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'name', key: 'Name'},
            {title: 'created', key: 'Created'},
            {title: 'driver', key: 'Driver'},
            {title: 'attachable', key: 'Attachable'},
            {title: 'ipamDriver', key: 'IPAM.Driver'},
            {title: 'subnet', key: 'subnet'},
            {title: 'gateway', key: 'gateway'}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'Name', type: 'string', label: 'Name', default: ''},
            {name: 'Created', type: 'string', label: 'Created', default: ''},
            {name: 'Driver', type: 'string', label: 'Driver', default: ''},
            {name: 'Attachable', type: 'boolean', label: 'Attachable', default: false},
            {name: 'IPAM.Driver', type: 'string', label: 'IPAM Driver', default: ''},
            {name: 'subnet', type: 'string', label: 'Subnet', default: ''},
            {name: 'gateway', type: 'string', label: 'Gateway', default: ''}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['Name', 'Created', 'Driver', 'Attachable', 'IPAM.Driver', 'IPAM.Config.0.Subnet', 'IPAM.Config.0.Gateway'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return true }
    override get dynamicFiltersEnable(): boolean { return true }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] {
        return [
            {name: 'name', type: 'string', label: 'name', default: null, operator: 'like'},
            {name: 'attachable', type: 'boolean', label: 'attachable', default: null, operator: 'eq'},
            {name: 'driver', type: 'string', label: 'driver', default: null, operator: 'eq'},
            {name: 'created', type: 'date', label: 'created', default: null, operator: 'range'},
            {name: 'subnet', type: 'string', label: 'subnet', default: null, operator: 'like'}
        ]
    }
}

export default NetworksCrud
export {NetworksCrud}
