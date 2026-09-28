function registryUrl(path: string, query?: Record<string, string>) {
    const baseUrl = process.env.REGISTRY_URL
    if (!baseUrl) throw new Error('REGISTRY_URL must be configured')
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    return url
}

async function registryFetch(path: string | URL, query?: Record<string, string>, headers?: Record<string, string>) {
    const response = await fetch(path instanceof URL ? path : registryUrl(path, query), {headers, signal: AbortSignal.timeout(10_000)})
    if (!response.ok) throw new Error(`Registry request failed with status ${response.status}`)
    return response
}

async function registryList(path: string, field: 'repositories' | 'tags', query?: Record<string, string>): Promise<Record<string, unknown>> {
    // ponytail: load the full list for client-side search/export; paginate at the API if catalogs outgrow memory.
    const firstUrl = registryUrl(path, query)
    let url = firstUrl
    const visited = new Set<string>()
    const entries: string[] = []
    let firstPage: Record<string, unknown> = {}
    while (true) {
        if (visited.has(url.href)) throw new Error('Invalid Registry pagination link')
        visited.add(url.href)
        const response = await registryFetch(url)
        const page = await response.json() as Record<string, string[] | null>
        if (visited.size === 1) firstPage = page
        entries.push(...(page[field] ?? []))
        const link = response.headers.get('link')?.match(/<([^>]+)>\s*;\s*rel="?next"?/i)?.[1]
        if (!link) return visited.size === 1 ? firstPage : {...firstPage, [field]: entries}
        const next = new URL(link, url)
        next.hash = ''
        if (next.origin !== firstUrl.origin || next.pathname !== firstUrl.pathname || next.username || next.password) {
            throw new Error('Invalid Registry pagination link')
        }
        url = next
    }
}

export async function fetchImages(rows = '1000') {
    const payload = await registryList('_catalog', 'repositories', {n: rows}) as {repositories?: string[]}
    return (payload.repositories ?? []).map((name) => ({name, tags: null}))
}

export async function fetchImageTags(name: string) {
    return registryList(`${encodedRepository(name)}/tags/list`, 'tags')
}

const manifestAccept = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

function encodedRepository(repository: string): string {
    const segments = repository?.split('/')
    if (!segments || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw Object.assign(new Error('valid repository is required'), {statusCode: 400})
    }
    return segments.map(encodeURIComponent).join('/')
}

export async function fetchImageDetails(repository: string, reference: string) {
    if (!reference) throw new Error('reference is required')
    const response = await registryFetch(`${encodedRepository(repository)}/manifests/${encodeURIComponent(reference)}`, undefined, {Accept: manifestAccept})
    const payload = await response.json() as {
        schemaVersion?: number
        mediaType?: string
        config?: {size?: number}
        layers?: Array<{size?: number}>
        manifests?: Array<{digest?: string; platform?: {os?: string; architecture?: string; variant?: string}}>
    }
    const mediaType = payload.mediaType ?? response.headers.get('content-type')
    const isIndex = Array.isArray(payload.manifests)
    const layers = payload.layers ?? []
    const layerSizes = layers.map(({size}) => size).filter((size): size is number => typeof size === 'number')
    const compressedSize = isIndex || layerSizes.length !== layers.length || typeof payload.config?.size !== 'number'
        ? null
        : payload.config.size + layerSizes.reduce((total, size) => total + size, 0)
    return {
        repository,
        reference,
        digest: response.headers.get('docker-content-digest'),
        mediaType,
        schemaVersion: payload.schemaVersion ?? null,
        kind: isIndex ? 'index' as const : layers.length ? 'image' as const : 'unknown' as const,
        layerCount: layers.length,
        compressedSize,
        platforms: (payload.manifests ?? []).map((manifest) => ({
            digest: manifest.digest,
            os: manifest.platform?.os,
            architecture: manifest.platform?.architecture,
            variant: manifest.platform?.variant,
        })),
    }
}
