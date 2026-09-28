import {HttpGqlClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import type {IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'
import type {Service} from '../cruds/ServiceCrud'
import fetchServicesDocument from './graphql/FetchServices.graphql?raw'
import paginateServicesDocument from './graphql/PaginateServices.graphql?raw'
import serviceFieldsDocument from './graphql/ServiceFields.graphql?raw'

const url = import.meta.env.VITE_BACK_URL ? `${import.meta.env.VITE_BACK_URL}/graphql` : '/graphql'

async function query<Response>(document: string, variables: object): Promise<Response> {
    const token = useAuthStore().accessToken
    const client = HttpGqlClientFactory.getInstance(url)
    return await client.query(document, variables, {
        headers: {Authorization: token ? `Bearer ${token}` : ''}, timeout: 10_000
    }) as Response
}

export async function fetchAllServices(): Promise<Service[]> {
    const response = await query<{fetchService: Service[]}>(
        `${fetchServicesDocument}\n${serviceFieldsDocument}`, {}
    )
    return response.fetchService
}

export async function paginateServiceList(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<Service>> {
    const filters = (options.filters ?? []).filter(filter => filter.field)
    const response = await query<{paginateServices: IDraxPaginateResult<Service>}>(
        `${paginateServicesDocument}\n${serviceFieldsDocument}`,
        {page: options.page, limit: options.limit, orderBy: options.orderBy,
         order: options.order, search: options.search,
         filters: filters.length ? JSON.stringify(filters) : undefined}
    )
    return response.paginateServices
}
