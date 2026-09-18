import {EntityCrud} from '@drax/crud-vue'
import {restGet} from '@/rest'
import type {IEntityCrud, IDraxCrudProvider, IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import {withClientCsvExport} from './clientCsvExport'

export type GitLabProject = {id: number; name: string; namespace?: {name?: string}; web_url?: string}
type PaginatedProjects = {items: GitLabProject[]; totalItems: number}

const gitLabProjectsProvider: IDraxCrudProvider<GitLabProject, never, never> = withClientCsvExport<GitLabProject, never, never>({
    async paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<GitLabProject>> {
        const page = options.page ?? 1
        const perPage = options.limit ?? 25
        const response = await restGet<PaginatedProjects>('/api/gitlab/project', {page, per_page: perPage})
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
            {title: 'id', key: 'id'},
            {title: 'namespace', key: 'namespace.name'},
            {title: 'name', key: 'name'},
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
    override get exportHeaders() { return ['id', 'namespace.name', 'name'] }
    override get isColumnSelectable(): boolean { return true }
    override get isGroupable(): boolean { return false }
    override get isRefreshable(): boolean { return true }
    override get searchEnable(): boolean { return false }
    override get containerFluid(): boolean { return true }
    override get filtersEnable(): boolean { return false }
    override get dynamicFiltersEnable(): boolean { return false }
    override get filterButtons(): boolean { return false }
    override get filters(): IEntityCrud['filters'] { return [] }
}

export default GitLabProjectsCrud
export {GitLabProjectsCrud}
