function registryUrl(path: string, query?: Record<string, string>) {
    const baseUrl = process.env.REGISTRY_URL
    if (!baseUrl) throw new Error('REGISTRY_URL must be configured')
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    return url
}

async function registryFetch(path: string, query?: Record<string, string>, headers?: Record<string, string>) {
    const response = await fetch(registryUrl(path, query), {headers, signal: AbortSignal.timeout(10_000)})
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

const manifestAccept = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

function encodedRepository(repository: string): string {
    if (!repository) throw new Error('valid repository is required')
    const segments = repository.split('/')
    if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('valid repository is required')
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
