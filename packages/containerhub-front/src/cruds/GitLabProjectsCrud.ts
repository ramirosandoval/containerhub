import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'

export type GitLabProject = {
    id: number
    name: string
    path_with_namespace: string
    description?: string | null
    web_url?: string
    last_activity_at?: string
    default_branch?: string | null
    container_registry_image_prefix?: string
    namespace?: {name?: string; full_path?: string}
}
type PaginatedProjects = {items: GitLabProject[]; totalItems: number}

const gitLabProjectsProvider: IDraxCrudProvider<GitLabProject, never, never> = withClientCsvExport<GitLabProject, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<GitLabProject>> {
        const page = options.page ?? 1
        const perPage = options.limit ?? 25
        const params: Record<string, string | number> = {page, per_page: perPage}
        if (options.search) params.search = options.search
        const response = await restGet<PaginatedProjects>('/api/gitlab/project', params)
        return {
            items: response.items,
            total: response.totalItems,
            page,
            limit: perPage
        }
    },
    async fetchAll(): Promise<GitLabProject[]> {
        return []
    }
})

class GitLabProjectsCrud extends EntityCrud {
    private static singleton: GitLabProjectsCrud | null = null
    static get instance(): GitLabProjectsCrud { return this.singleton ??= new GitLabProjectsCrud() }

    override name = 'gitLabProject'
    override get identifier(): string { return 'id' }
    override get permissions(): IEntityCrud['permissions'] { return {view: 'DOCKER_VIEW', manage: 'DOCKER_VIEW', create: 'DOCKER_VIEW', update: 'DOCKER_VIEW', delete: 'DOCKER_VIEW'} }
    override get provider() { return gitLabProjectsProvider }

    override get headers(): IEntityCrud['headers'] {
        return [
            {title: 'project', key: 'name', sortable: false},
            {title: 'lastActivity', key: 'last_activity_at', sortable: false},
            {title: 'deployments', key: 'deployments', sortable: false},
            {title: 'tags', key: 'tags', sortable: false}
        ]
    }

    override get actionHeaders(): IEntityCrud['actionHeaders'] { return [] }
    override get fields(): IEntityCrud['fields'] { return [] }

    override get isCreatable(): boolean { return false }
    override get isEditable(): boolean { return false }
    override get isDeletable(): boolean { return false }
    override get isViewable(): boolean { return false }
    override get isImportable(): boolean { return false }
    override get isExportable(): boolean { return true }
    override get exportFormats() { return ['CSV'] }
    override get exportHeaders() { return ['id', 'path_with_namespace', 'last_activity_at', 'web_url'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return true }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get dynamicFiltersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default GitLabProjectsCrud
export {GitLabProjectsCrud}
