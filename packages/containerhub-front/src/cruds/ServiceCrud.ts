import {EntityCrud} from '@drax/crud-vue'
import type {IEntityCrud, IDraxCrudProvider} from '@drax/crud-share'
import {ref} from 'vue'
import {buildServiceFilterOptions} from './ServiceFilterOptions'
import {fetchAllServices, paginateServiceList} from '../services/serviceGraphql'

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

const serviceProvider: IDraxCrudProvider<Service, never, never> = {
    paginate: paginateServiceList,
    fetchAll: fetchAllServices
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
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isSavedQueriesEnabled(): boolean { return false }
    override get searchEnable(): boolean { return true }
    override get filtersEnable(): boolean { return true }
    override get dynamicFiltersEnable(): boolean { return true }
    override get filterButtons(): boolean { return false }

    override get fields(): IEntityCrud['fields'] {
        return [
            {name: 'id', type: 'string', label: 'id', default: ''},
            {name: 'name', type: 'string', label: 'name', default: ''},
            {name: 'stack', type: 'string', label: 'stack', default: null},
            {name: 'image', type: 'string', label: 'image', default: null},
            {name: 'ports', type: 'string', label: 'ports', default: null},
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
        this.setFilterOptions(await fetchAllServices())
    }
}

export default ServiceCrud
export {ServiceCrud}
