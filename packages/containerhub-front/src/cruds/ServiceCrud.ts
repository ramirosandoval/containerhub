import {EntityCrud} from '@drax/crud-vue'
import {HttpRestClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import type {IEntityCrud, IDraxCrudProvider, IDraxFieldFilter, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {ref} from 'vue'
import {buildServiceFilterOptions} from './ServiceFilterOptions'

interface ServicePort {
    hostPort: number | null
    containerPort: number | null
    protocol: string
}

interface ServiceImage {
    name: string
    nameWithTag: string
    namespace: string | null
    domain: string | null
    fullname: string
    tag: string
}

export interface Service {
    id: string
    name: string
    stack: string | null
    image: ServiceImage
    ports: ServicePort[]
    createdAt: string | null
    updatedAt: string | null
}

const REST_BASE = (import.meta.env.VITE_BACK_URL as string | undefined) ?? ''
const serviceProvider = new class implements IDraxCrudProvider<Service, never, never> {
    private get client() {
        return HttpRestClientFactory.getInstance(REST_BASE)
    }

    private get authHeader(): Record<string, string> {
        const token = useAuthStore().accessToken
        return token ? {Authorization: `Bearer ${token}`} : {}
    }

    async paginate(opts: IDraxPaginateOptions): Promise<IDraxPaginateResult<Service>> {
        const filters: IDraxFieldFilter[] = (opts.filters ?? []).filter((filter) => filter.field)
        const params: Record<string, string | number> = {page: opts.page, limit: opts.limit}
        if (opts.orderBy) params.orderBy = opts.orderBy
        if (opts.order) params.order = opts.order
        if (opts.search) params.search = opts.search
        if (filters.length) params.filters = JSON.stringify(filters)
        return (await this.client.get('/api/services/paginate', {params, headers: this.authHeader})) as IDraxPaginateResult<Service>
    }

    async fetchAll(): Promise<Service[]> {
        return (await this.client.get('/api/services', {headers: this.authHeader})) as Service[]
    }
}

class ServiceCrud extends EntityCrud {
    private static singleton: ServiceCrud | null = null
    private readonly stackOptions = ref<string[]>([])
    private readonly imageOptions = ref<string[]>([])

    static get instance(): ServiceCrud {
        return this.singleton ??= new ServiceCrud()
    }

    override name = 'service'

    override get identifier(): string { return 'id' }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'name', key: 'name', align: 'start'},
            {title: 'stack', key: 'stack', align: 'start'},
            {title: 'image', key: 'image.nameWithTag', align: 'start'},
            {title: 'ports', key: 'ports', align: 'start', sortable: false},
            {title: 'createdAt', key: 'createdAt', align: 'start'},
            {title: 'updatedAt', key: 'updatedAt', align: 'start'},
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] {
        return []
    }

    override get permissions(): IEntityCrud['permissions'] {
        return {view: 'DOCKER_VIEW', manage: 'DOCKER_UPDATE', create: 'DOCKER_CREATE', update: 'DOCKER_UPDATE', delete: 'DOCKER_REMOVE'}
    }

    override get filters(): IEntityCrud['filters'] {
        return [
            {name: 'stack', type: 'enum', label: 'stack', default: null, operator: 'eq', enum: this.stackOptions.value},
            {name: 'image', type: 'enum', label: 'image', default: null, operator: 'like', enum: this.imageOptions.value},
            {name: 'ports', type: 'string', label: 'ports', default: null, operator: 'like'},
            {name: 'createdAt', type: 'date', label: 'createdAt', default: null, operator: 'range', endOfDay: true},
            {name: 'updatedAt', type: 'date', label: 'updatedAt', default: null, operator: 'range', endOfDay: true},
        ]
    }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get isExportable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isColumnSelectable(): boolean { return false }
    override get isGroupable(): boolean { return false }
    override get isSavedQueriesEnabled(): boolean { return false }
    override get searchEnable(): boolean { return true }
    override get filtersEnable(): boolean { return true }
    override get dynamicFiltersEnable(): boolean { return false }

    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'id', type: 'string', label: 'id', default: ''},
            {name: 'name', type: 'string', label: 'name', default: ''},
            {name: 'stack', type: 'string', label: 'stack', default: null},
            {name: 'createdAt', type: 'date', label: 'createdAt', default: null},
            {name: 'updatedAt', type: 'date', label: 'updatedAt', default: null},
        ]
    }

    override get provider(): IDraxCrudProvider<Service, never, never> { return serviceProvider }

    setFilterOptions(services: Service[]): void {
        const {stacks, images} = buildServiceFilterOptions(services)
        this.stackOptions.value = stacks
        this.imageOptions.value = images
    }

    async loadFilterOptions(): Promise<void> {
        this.setFilterOptions(await serviceProvider.fetchAll())
    }
}

export default ServiceCrud
export {ServiceCrud}
