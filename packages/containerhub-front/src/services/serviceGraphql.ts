import {HttpGqlClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import type {IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import type {Service} from '../cruds/ServiceCrud'

const url = import.meta.env.VITE_BACK_URL ? `${import.meta.env.VITE_BACK_URL}/graphql` : '/graphql'
const fields = `fragment ServiceFields on Service {
    id name stack createdAt updatedAt
    image { name nameWithTag namespace domain fullname tag }
    ports { hostPort containerPort protocol }
}`

async function query<Response>(document: string, variables: object): Promise<Response> {
    const token = useAuthStore().accessToken
    const client = HttpGqlClientFactory.getInstance(url)
    return await client.query(document, variables, {
        headers: {Authorization: token ? `Bearer ${token}` : ''}, timeout: 10_000
    }) as Response
}

export async function fetchAllServices(): Promise<Service[]> {
    const response = await query<{fetchService: Service[]}>(
        `query FetchServices { fetchService { ...ServiceFields } } ${fields}`, {}
    )
    return response.fetchService
}

export async function paginateServiceList(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<Service>> {
    const filters = (options.filters ?? []).filter(filter => filter.field)
    const response = await query<{paginateServices: IDraxPaginateResult<Service>}>(
        `query PaginateServices($page: Int!, $limit: Int!, $orderBy: String, $order: ServiceOrder, $search: String, $filters: String) {
            paginateServices(page: $page, limit: $limit, orderBy: $orderBy, order: $order, search: $search, filters: $filters) {
                page limit total items { ...ServiceFields }
            }
        } ${fields}`,
        {page: options.page, limit: options.limit, orderBy: options.orderBy,
         order: options.order, search: options.search,
         filters: filters.length ? JSON.stringify(filters) : undefined}
    )
    return response.paginateServices
}
