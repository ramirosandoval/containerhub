export type DockerImageReference = {
    id: string
    fullname: string
    domain: string | null
    namespace: string | null
    name: string
    tag: string
    nameWithTag: string
}

export function parseDockerImageReference(inputImage = ''): DockerImageReference {
    const [rawName = '', rawDigest = ''] = inputImage.split('@', 2)
    const lastSlash = rawName.lastIndexOf('/')
    const lastColon = rawName.lastIndexOf(':')
    const hasTag = lastColon > lastSlash
    const repository = hasTag ? rawName.slice(0, lastColon) : rawName
    const tag = hasTag ? rawName.slice(lastColon + 1) : 'latest'
    const repositoryParts = repository.split('/').filter(Boolean)
    const name = repositoryParts.pop() ?? ''
    const firstRepositoryPart = repositoryParts[0]
    const hasDomain = Boolean(firstRepositoryPart && (
        firstRepositoryPart === 'localhost'
        || firstRepositoryPart.includes('.')
        || firstRepositoryPart.includes(':')
    ))
    const domain = hasDomain ? repositoryParts.shift() ?? null : null
    const namespace = repositoryParts.length ? repositoryParts.join('/') : null
    const nameWithTag = `${name}:${tag}`
    const fullname = hasTag
        ? `${repository}:${tag}`
        : rawDigest
            ? `${repository}@${rawDigest}`
            : `${repository}:${tag}`
    const digestSeparator = rawDigest.indexOf(':')
    const id = rawDigest ? rawDigest.slice(digestSeparator + 1) : ''

    return {id, fullname, domain, namespace, name, tag, nameWithTag}
}
