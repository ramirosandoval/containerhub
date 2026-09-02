import {HttpRestClientFactory} from '@drax/common-front'
import {useAuthStore} from '@drax/identity-vue'
import {authorizationHeader} from './restHeaders'

const REST_BASE = import.meta.env.VITE_BACK_URL ?? ''

export async function restGet<Response>(path: string, params?: Record<string, string | number>): Promise<Response> {
    const client = HttpRestClientFactory.getInstance(REST_BASE)
    const headers = authorizationHeader(useAuthStore().accessToken)
    return client.get(path, {params, headers}) as Promise<Response>
}

export async function restPost<Response>(path: string, body: unknown): Promise<Response> {
    const client = HttpRestClientFactory.getInstance(REST_BASE)
    const headers = authorizationHeader(useAuthStore().accessToken)
    return client.post(path, body, {headers}) as Promise<Response>
}
