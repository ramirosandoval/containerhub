function registryUrl(path: string, query?: Record<string, string>) {
    const baseUrl = process.env.REGISTRY_URL
    if (!baseUrl) throw new Error('REGISTRY_URL must be configured')
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    return url
}

async function registryFetch(path: string, query?: Record<string, string>) {
    const response = await fetch(registryUrl(path, query), {signal: AbortSignal.timeout(10_000)})
    if (!response.ok) throw new Error(`Registry request failed with status ${response.status}`)
    return response
}

export async function fetchImages(rows = '1000') {
    const payload = await (await registryFetch('_catalog', {n: rows})).json() as {repositories?: string[]}
    return (payload.repositories ?? []).map((name) => ({name, tags: null}))
}

export async function fetchImageTags(name: string) {
    if (!name) throw new Error('name is required')
    return (await registryFetch(`${name}/tags/list`)).json()
}
