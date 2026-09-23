export type ServiceImageLike = {
    domain: string | null
    namespace: string | null
    name: string
    tag: string | null
}

export type RegistryTarget = {
    repository: string
    tag: string | null
    fullReference: string
}

function imageRepository(namespace: string | null, name: string): string {
    if (!name) throw new Error('image name is required')
    return namespace ? `${namespace}/${name}` : name
}

export function serviceRegistryTarget(image: ServiceImageLike): RegistryTarget {
    const repository = imageRepository(image.namespace, image.name)
    const registryRepository = image.domain ? `${image.domain}/${repository}` : repository
    return {
        repository,
        tag: image.tag,
        fullReference: image.tag ? `${registryRepository}:${image.tag}` : registryRepository,
    }
}

export function projectRegistryTarget(prefix: string): {repository: string; registryDomain: string | null} {
    if (!prefix) throw new Error('registry prefix is required')
    const parts = prefix.split('/').filter(Boolean)
    const firstPart = parts[0] ?? ''
    const hasDomain = firstPart === 'localhost' || firstPart.includes('.') || firstPart.includes(':')
    const registryDomain = hasDomain ? parts.shift() ?? null : null
    const repository = parts.join('/')
    if (!repository) throw new Error('registry repository is required')
    return {repository, registryDomain}
}
