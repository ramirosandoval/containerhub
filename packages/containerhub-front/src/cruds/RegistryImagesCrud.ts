import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'
import {applyClientFieldFilters} from './clientFieldFilters'

export type RegistryImage = {name: string; tags: string[] | null}

function matchesSearch(item: RegistryImage, search: string): boolean {
    const lower = search.toLowerCase()
    return [
        item.name,
        ...(item.tags || [])
    ].some(val => typeof val === 'string' && val.toLowerCase().includes(lower))
}

const registryImagesProvider: IDraxCrudProvider<RegistryImage, never, never> = withClientCsvExport<RegistryImage, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<RegistryImage>> {
        let items = await restGet<RegistryImage[]>('/api/registry/image')
        if (options.search) items = items.filter(item => matchesSearch(item, options.search!))
        items = applyClientFieldFilters(items, options.filters)
        if (options.orderBy) {
            const key = options.orderBy as keyof RegistryImage
            const direction = options.order === 'desc' ? -1 : 1
            items = [...items].sort((a, b) => {
                const va = key === 'tags' ? (a.tags || []).join(', ') : (a[key] ?? '')
                const vb = key === 'tags' ? (b.tags || []).join(', ') : (b[key] ?? '')
                return String(va).localeCompare(String(vb)) * direction
            })
        }
        const start = (options.page - 1) * options.limit
        return {items: items.slice(start, start + options.limit), total: items.length, page: options.page, limit: options.limit}
    },
    async fetchAll(): Promise<RegistryImage[]> {
        return restGet<RegistryImage[]>('/api/registry/image')
    }
})

class RegistryImagesCrud extends EntityCrud {
    private static singleton: RegistryImagesCrud | null = null
    static get instance(): RegistryImagesCrud { return this.singleton ??= new RegistryImagesCrud() }

    override name = 'registryImage'
    override get identifier(): string { return 'name' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return registryImagesProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'name', key: 'name'},
            {title: 'tags', key: 'tags'}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'name', type: 'string', label: 'Name', default: ''},
            {name: 'tags', type: 'string', label: 'Tags', default: ''}
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['name', 'tags'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default RegistryImagesCrud
export {RegistryImagesCrud}
