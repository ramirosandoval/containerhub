import type {Service as DockerodeService} from 'dockerode'

type DockerServicePort = {
    PublishedPort?: number
    TargetPort?: number
    Protocol?: string
}

type DockerServiceSpec = {
    Name?: string
    Labels?: Record<string, string>
    TaskTemplate?: {
        ContainerSpec?: {
            Image?: string
        }
    }
    EndpointSpec?: {
        Ports?: DockerServicePort[]
    }
}

type DockerServiceItem = {
    ID?: string
    CreatedAt?: string
    UpdatedAt?: string
    Spec?: DockerServiceSpec
}

export type ServiceModel = {
    id: string
    name?: string
    stack: string | null
    image: {
        name: string
        nameWithTag: string
        namespace: string | null
        domain: string | null
        fullname: string
        tag: string
    }
    ports: Array<{
        hostPort: number | null
        containerPort: number | null
        protocol: string
    }>
    createdAt: string | null
    updatedAt: string | null
}

function serviceSpec(item: DockerodeService | DockerServiceItem): DockerServiceSpec {
    if ('Spec' in item) return (item.Spec as unknown as DockerServiceSpec | undefined) ?? {}
    return {}
}

function serviceId(item: DockerodeService | DockerServiceItem): string {
    if ('ID' in item && typeof item.ID === 'string') return item.ID
    if ('id' in item && typeof item.id === 'string') return item.id
    throw new Error('Docker service response is missing ID')
}

export function mapInspectToServiceModel(item: DockerodeService | DockerServiceItem): ServiceModel {
    const spec = serviceSpec(item)

    const image = spec.TaskTemplate?.ContainerSpec?.Image ?? ''
    const split = image.includes(':') ? image.split(':') : [image, 'latest']

    const repoPath = split[0]
    const tag = split[1]

    const repoParts = repoPath.split('/')
    const name = repoParts[repoParts.length - 1]

    const namespace = repoParts.length > 1
        ? repoParts[0]
        : null

    const domain = repoParts.length > 2
        ? repoParts.slice(0, -1).join('/')
        : null

    const labels: Array<{name: string; value: string}> = spec.Labels
        ? Object.entries(spec.Labels).map(([name, value]) => ({
            name,
            value: String(value)
        }))
        : []

    const stackLabel = labels.find(
        (label) => label.name === 'com.docker.stack.namespace'
    )

    const portsRaw = spec.EndpointSpec?.Ports ?? []

    return {
        id: serviceId(item),
        name: spec.Name,
        stack: stackLabel?.value ?? null,
        image: {
            name,
            nameWithTag: image,
            namespace,
            domain,
            fullname: repoPath,
            tag
        },
        ports: portsRaw.map((port) => ({
            hostPort: port.PublishedPort ?? null,
            containerPort: port.TargetPort ?? null,
            protocol: port.Protocol?.toUpperCase() ?? 'TCP'
        })),
        createdAt: item.CreatedAt ?? null,
        updatedAt: item.UpdatedAt ?? null
    }
}
