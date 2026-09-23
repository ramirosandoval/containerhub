import {projectRegistryTarget, serviceRegistryTarget, type ServiceImageLike} from './registryImageReference'

export type ServiceImageUsageInput = {
    id: string
    name: string
    stack: string | null
    image: ServiceImageLike & {fullname: string; nameWithTag: string}
}

export type RepositoryUsage = {
    services: ServiceImageUsageInput[]
    tags: Map<string, ServiceImageUsageInput[]>
}

export function buildServiceImageUsage(services: ServiceImageUsageInput[]): Map<string, RepositoryUsage> {
    const usage = new Map<string, RepositoryUsage>()
    for (const service of services) {
        const {repository, tag} = serviceRegistryTarget(service.image)
        const repositoryUsage = usage.get(repository) ?? {services: [], tags: new Map<string, ServiceImageUsageInput[]>()}
        repositoryUsage.services.push(service)
        if (tag) repositoryUsage.tags.set(tag, [...(repositoryUsage.tags.get(tag) ?? []), service])
        usage.set(repository, repositoryUsage)
    }
    return usage
}

export function projectServiceUsage(services: ServiceImageUsageInput[], registryPrefix: string): ServiceImageUsageInput[] {
    const projectTarget = projectRegistryTarget(registryPrefix)
    return services.filter((service) => {
        const serviceTarget = serviceRegistryTarget(service.image)
        return serviceTarget.repository === projectTarget.repository
            && (!projectTarget.registryDomain || !service.image.domain || projectTarget.registryDomain === service.image.domain)
    })
}
