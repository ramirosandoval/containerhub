import type {Service as DockerodeService} from 'dockerode'
import {parseDockerImageReference} from './parseDockerImageReference.js'

type DockerServicePort = {
    PublishedPort?: number
    TargetPort?: number
    Protocol?: string
}

type DockerServiceMount = {
    Type?: string
    Source?: string
    Target?: string
    ReadOnly?: boolean
}

type DockerHealthCheck = {
    Test?: string[]
    Interval?: number
    Timeout?: number
    Retries?: number
    StartPeriod?: number
}

type DockerServiceSpec = {
    Name?: string
    Labels?: Record<string, string>
    TaskTemplate?: {
        ContainerSpec?: {
            Image?: string
            Env?: string[]
            Labels?: Record<string, string>
            Mounts?: DockerServiceMount[]
            DNSConfig?: {Nameservers?: string[]}
            Hosts?: string[]
            HealthCheck?: DockerHealthCheck
        }
        Placement?: {
            Constraints?: string[]
            Preferences?: Array<{Spread?: {SpreadDescriptor?: string}}>
        }
        Resources?: {
            Limits?: {NanoCPUs?: number; MemoryBytes?: number}
            Reservations?: {NanoCPUs?: number; MemoryBytes?: number}
        }
    }
    Mode?: {Global?: object; Replicated?: {Replicas?: number}}
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
        portsProtocol: string
    }>
    envs?: Array<{name: string; value: string}>
    volumes?: Array<{type: string; hostVolume: string; containerVolume: string; readOnly: boolean}>
    files?: []
    labels?: Array<{name: string; value: string}>
    constraints?: Array<{name: string; operation: string; value: string}>
    limits?: {CPULimit?: number; memoryLimit?: number; CPUReservation?: number; memoryReservation?: number}
    preferences?: Array<{name: string; value: string}>
    mode?: 'global' | 'replic'
    replicas?: number
    extraHosts?: string[]
    dns?: string[]
    healthCheck?: {command?: string; interval?: number; timeout?: number; retries?: number; startPeriod?: number}
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

function mapEnvironment(values: string[] = []): Array<{name: string; value: string}> {
    return values.map(entry => {
        const separator = entry.indexOf('=')
        return separator === -1
            ? {name: entry, value: '[REDACTED]'}
            : {name: entry.slice(0, separator), value: '[REDACTED]'}
    })
}

function mapConstraint(value: string): {name: string; operation: string; value: string} {
    const match = /^(.*?)\s+(==|!=)\s+(.*)$/.exec(value)
    return match
        ? {name: match[1], operation: match[2], value: match[3]}
        : {name: value, operation: '', value: ''}
}

function nanosecondsToSeconds(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value / 1_000_000_000
}

function mapDockerHost(value: string): string {
    const separator = value.indexOf(' ')
    return separator === -1 ? value : `${value.slice(separator + 1)}:${value.slice(0, separator)}`
}

function mapHealthCheck(healthCheck: DockerHealthCheck | undefined): ServiceModel['healthCheck'] {
    if (!healthCheck) return undefined
    const test = healthCheck.Test ?? []
    return {
        command: test[0] === 'CMD-SHELL' ? test.slice(1).join(' ') : test.join(' '),
        interval: nanosecondsToSeconds(healthCheck.Interval),
        timeout: nanosecondsToSeconds(healthCheck.Timeout),
        retries: healthCheck.Retries,
        startPeriod: nanosecondsToSeconds(healthCheck.StartPeriod)
    }
}

export function mapInspectToServiceModel(item: DockerodeService | DockerServiceItem): ServiceModel {
    const spec = serviceSpec(item)
    const container = spec.TaskTemplate?.ContainerSpec
    const image = parseDockerImageReference(container?.Image ?? '')
    const serviceLabels = {...(spec.Labels ?? {})}
    const stack = serviceLabels['com.docker.stack.namespace'] ?? null
    delete serviceLabels['com.docker.stack.namespace']
    const labels = Object.keys({...serviceLabels, ...(container?.Labels ?? {})})
        .map((name) => ({name, value: '[REDACTED]'}))
    const portsRaw = spec.EndpointSpec?.Ports ?? []
    const resources = spec.TaskTemplate?.Resources
    const healthCheck = mapHealthCheck(container?.HealthCheck)

    return {
        id: serviceId(item),
        name: spec.Name,
        stack,
        image,
        ports: portsRaw.map((port) => {
            const protocol = port.Protocol?.toUpperCase() ?? 'TCP'
            return {hostPort: port.PublishedPort ?? null, containerPort: port.TargetPort ?? null, protocol, portsProtocol: protocol}
        }),
        envs: mapEnvironment(container?.Env),
        volumes: (container?.Mounts ?? []).map(mount => ({
            type: mount.Type ?? 'bind',
            hostVolume: mount.Source ?? '',
            containerVolume: mount.Target ?? '',
            readOnly: Boolean(mount.ReadOnly)
        })),
        files: [],
        labels,
        constraints: (spec.TaskTemplate?.Placement?.Constraints ?? []).map(mapConstraint),
        limits: {
            CPULimit: resources?.Limits?.NanoCPUs,
            memoryLimit: resources?.Limits?.MemoryBytes,
            CPUReservation: resources?.Reservations?.NanoCPUs,
            memoryReservation: resources?.Reservations?.MemoryBytes
        },
        preferences: (spec.TaskTemplate?.Placement?.Preferences ?? [])
            .map(preference => ({name: 'spread', value: preference.Spread?.SpreadDescriptor ?? ''})),
        mode: spec.Mode?.Global ? 'global' : 'replic',
        replicas: spec.Mode?.Replicated?.Replicas ?? 1,
        extraHosts: (container?.Hosts ?? []).map(mapDockerHost),
        dns: container?.DNSConfig?.Nameservers ?? [],
        ...(healthCheck ? {healthCheck} : {}),
        createdAt: item.CreatedAt ?? null,
        updatedAt: item.UpdatedAt ?? null
    }
}
