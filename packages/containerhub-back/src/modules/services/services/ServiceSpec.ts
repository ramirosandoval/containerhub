import {z} from 'zod'

type DockerServiceSpec = import('dockerode').ServiceSpec
type DockerContainerTaskSpec = import('dockerode').ContainerTaskSpec
type DockerNetworkAttachment = import('dockerode').NetworkAttachmentConfig
type DockerMountSettings = import('dockerode').MountSettings
type ContainerHealthcheck = import('dockerode').HealthConfig

const NamedValueInputSchema = z.object({name: z.string().min(1), value: z.string().optional()})
const VolumeInputSchema = z.object({
    type: z.enum(['bind', 'volume', 'tmpfs']).optional(),
    hostVolume: z.string().optional(),
    source: z.string().optional(),
    containerVolume: z.string().optional(),
    target: z.string().optional(),
    readOnly: z.boolean().optional()
}).refine(volume => Boolean(volume.hostVolume ?? volume.source) && Boolean(volume.containerVolume ?? volume.target), {
    message: 'Service volume requires source and target'
})
const NetworkInputSchema = z.union([
    z.string().min(1),
    z.object({
        id: z.string().optional(), target: z.string().optional(), Target: z.string().optional(),
        aliases: z.array(z.string()).optional(), Aliases: z.array(z.string()).optional()
    }).refine(network => Boolean(network.id ?? network.target ?? network.Target), {message: 'Service network requires a target'})
])
const LegacyHealthcheckInputSchema = z.object({
    test: z.union([z.string(), z.array(z.string())]).optional(),
    interval: z.number().finite().optional(), timeout: z.number().finite().optional(),
    retries: z.number().int().optional(), startPeriod: z.number().finite().optional()
}).strict()
const DockerHealthcheckInputSchema = z.object({
    Test: z.array(z.string()).optional(), Interval: z.number().finite().optional(),
    Timeout: z.number().finite().optional(), Retries: z.number().int().optional(),
    StartPeriod: z.number().finite().optional()
}).strict()
const NullishFiniteNumberSchema = z.number().finite().nullable().optional()
const CommandInputSchema = z.union([
    z.string().min(1),
    z.array(z.string().min(1))
]).nullable()
const PortInputSchema = z.object({
    protocol: z.string().optional(), portsProtocol: z.string().optional(),
    hostPort: z.number().int().optional(), publishedPort: z.number().int().optional(),
    containerPort: z.number().int().optional(), targetPort: z.number().int().optional()
})
const ServiceInputSchema = z.object({
    name: z.string().min(1),
    image: z.string().min(1),
    stack: z.string().nullable().optional(),
    labels: z.array(NamedValueInputSchema).optional(),
    command: CommandInputSchema.optional(),
    envs: z.array(NamedValueInputSchema).optional(),
    volumes: z.array(VolumeInputSchema).optional(),
    dns: z.array(z.string()).optional(),
    extraHosts: z.array(z.string()).optional(),
    healthcheck: z.union([DockerHealthcheckInputSchema, LegacyHealthcheckInputSchema]).optional(),
    limits: z.object({
        CPULimit: NullishFiniteNumberSchema, memoryLimit: NullishFiniteNumberSchema,
        CPUReservation: NullishFiniteNumberSchema, memoryReservation: NullishFiniteNumberSchema
    }).optional(),
    constraints: z.array(z.object({name: z.string().min(1), operation: z.string(), value: z.string()})).optional(),
    preferences: z.array(z.object({value: z.string().optional()})).optional(),
    deployMode: z.enum(['global', 'replicated', 'replic']).optional(),
    replicas: z.number().int().min(0).optional(),
    ports: z.array(PortInputSchema).optional(),
    networks: z.array(NetworkInputSchema).optional()
}).strict()

export const ServiceCreateInputSchema = ServiceInputSchema
export const ServiceUpdateInputSchema = ServiceInputSchema.partial().strict()
export type ServiceInput = z.infer<typeof ServiceUpdateInputSchema>
export type LabelInput = z.infer<typeof NamedValueInputSchema>
export type VolumeInput = z.infer<typeof VolumeInputSchema>
export type NetworkInput = z.infer<typeof NetworkInputSchema>
export type LegacyHealthcheckInput = z.infer<typeof LegacyHealthcheckInputSchema>

function labelsToObject(labels: LabelInput[] = []): Record<string, string> {
    return Object.fromEntries(
        labels
            .filter((label): label is LabelInput & {name: string} => Boolean(label?.name))
            .map((label) => [label.name, String(label.value ?? '')])
    )
}

const PROTOCOL_VALUES = new Set(['tcp', 'udp', 'sctp'] as const)
type PortProtocol = typeof PROTOCOL_VALUES extends Set<infer T> ? T : never

function toServicePortProtocol(value: string | undefined): PortProtocol | undefined {
    const normalized = (value ?? 'tcp').toLowerCase()
    return PROTOCOL_VALUES.has(normalized as PortProtocol) ? (normalized as PortProtocol) : 'tcp'
}

function toMountSettings(volume: VolumeInput): DockerMountSettings {
    const source = volume.hostVolume ?? volume.source
    const target = volume.containerVolume ?? volume.target
    if (!source || !target) throw new Error('Service volume requires source and target')
    return {
        Type: volume.type ?? 'bind',
        Source: source,
        Target: target,
        ReadOnly: Boolean(volume.readOnly)
    }
}

function toNetworkAttachment(network: NetworkInput): DockerNetworkAttachment {
    if (typeof network === 'string') return {Target: network}
    return {
        Target: network.id ?? network.target ?? network.Target,
        Aliases: network.aliases ?? network.Aliases
    }
}

function toContainerHealthcheck(healthcheck: ContainerHealthcheck | LegacyHealthcheckInput): ContainerHealthcheck {
    if ('Test' in healthcheck) return healthcheck
    const legacyHealthcheck = healthcheck as LegacyHealthcheckInput
    const toNanoseconds = (seconds: number | undefined) => seconds === undefined ? undefined : seconds * 1_000_000_000
    return {
        Test: legacyHealthcheck.test === undefined
            ? undefined
            : Array.isArray(legacyHealthcheck.test) ? legacyHealthcheck.test : ['CMD-SHELL', legacyHealthcheck.test],
        Interval: toNanoseconds(legacyHealthcheck.interval),
        Timeout: toNanoseconds(legacyHealthcheck.timeout),
        Retries: legacyHealthcheck.retries,
        StartPeriod: toNanoseconds(legacyHealthcheck.startPeriod)
    }
}

function toServiceResources(limits: NonNullable<ServiceInput['limits']>): DockerContainerTaskSpec['Resources'] {
    const dockerLimits = {
        ...(limits.CPULimit != null ? {NanoCPUs: limits.CPULimit} : {}),
        ...(limits.memoryLimit != null ? {MemoryBytes: limits.memoryLimit} : {})
    }
    const dockerReservations = {
        ...(limits.CPUReservation != null ? {NanoCPUs: limits.CPUReservation} : {}),
        ...(limits.memoryReservation != null ? {MemoryBytes: limits.memoryReservation} : {})
    }
    return {
        ...(Object.keys(dockerLimits).length ? {Limits: dockerLimits} : {}),
        ...(Object.keys(dockerReservations).length ? {Reservations: dockerReservations} : {})
    }
}

function toServiceNetworks(networkInputs: NetworkInput[] | undefined, stack: string | undefined, serviceName: string, previousTaskTemplate?: DockerContainerTaskSpec, previousServiceNetworks?: DockerNetworkAttachment[]): DockerNetworkAttachment[] | undefined {
    if (networkInputs === undefined && (previousTaskTemplate?.Networks ?? previousServiceNetworks)) {
        return previousTaskTemplate?.Networks ?? previousServiceNetworks
    }

    const networks = networkInputs?.map(toNetworkAttachment) ?? []
    if (stack) {
        const defaultNetwork = `${stack}_default`
        if (!networks.some((network) => network.Target === defaultNetwork)) {
            networks.push({Target: defaultNetwork, Aliases: [serviceName.replace(`${stack}_`, '')]})
        }
    }
    return networks.length ? networks : undefined
}

export function toServiceSpec(input: ServiceInput, previous?: DockerServiceSpec): DockerServiceSpec {
    const {Networks: previousServiceNetworks, ...previousSpec} = previous ?? {}
    const previousTaskTemplate = previous?.TaskTemplate
    const previousContainerTask = previousTaskTemplate?.Runtime === 'plugin' || previousTaskTemplate?.Runtime === 'attachment'
        ? undefined
        : previousTaskTemplate as DockerContainerTaskSpec | undefined
    const container = previousContainerTask?.ContainerSpec ?? {}
    const name = input.name ?? previous?.Name
    if (!name || (!input.image && !container.Image)) throw new Error('Service name and image are required')

    const stack = input.stack ?? previous?.Labels?.['com.docker.stack.namespace']
    const labels = {...(previous?.Labels ?? {}), ...labelsToObject(input.labels)}
    if (stack) labels['com.docker.stack.namespace'] = stack

    const taskTemplate: DockerContainerTaskSpec = {
        ...previousContainerTask,
        ContainerSpec: {
            ...container,
            Image: input.image ?? container.Image,
            Command: input.command === null
                ? undefined
                : typeof input.command === 'string' ? [input.command] : input.command ?? container.Command,
            Env: input.envs ? input.envs.map((env) => `${env.name}=${env.value ?? ''}`) : container.Env,
            Labels: {...(container.Labels ?? {}), ...labelsToObject(input.labels)},
            Mounts: input.volumes ? input.volumes.map(toMountSettings) : container.Mounts,
            DNSConfig: input.dns ? {Nameservers: input.dns} : container.DNSConfig,
            Hosts: input.extraHosts ? input.extraHosts.map((host) => {
                const [hostname, address] = host.split(':')
                return `${address} ${hostname}`
            }) : container.Hosts,
            HealthCheck: input.healthcheck ? toContainerHealthcheck(input.healthcheck) : container.HealthCheck
        },
        Placement: input.constraints || input.preferences ? {
            ...(previous?.TaskTemplate?.Placement ?? {}),
            Constraints: input.constraints?.map((constraint) => `${constraint.name} ${constraint.operation} ${constraint.value}`),
            Preferences: input.preferences?.map((preference) => ({Spread: {SpreadDescriptor: preference.value ?? ''}}))
        } : previous?.TaskTemplate?.Placement,
        Resources: input.limits ? toServiceResources(input.limits) : previous?.TaskTemplate?.Resources,
        RestartPolicy: {Condition: 'on-failure', Delay: 10_000_000_000, MaxAttempts: 10},
        Networks: toServiceNetworks(input.networks, stack, name, previousContainerTask, previousServiceNetworks)
    }

    const spec: DockerServiceSpec = {
        ...previousSpec,
        Name: name,
        Labels: labels,
        TaskTemplate: taskTemplate,
        Mode: input.deployMode === 'global'
            ? {Global: {}}
            : input.deployMode === 'replicated' || input.replicas !== undefined
                ? {Replicated: {Replicas: asServiceReplicas(input.replicas)}}
                : previous?.Mode,
        UpdateConfig: {
            Parallelism: 2, Delay: 1_000_000_000, FailureAction: 'pause', Monitor: 15_000_000_000, MaxFailureRatio: 0.15
        } as DockerServiceSpec['UpdateConfig'],
        RollbackConfig: {
            Parallelism: 1, Delay: 1_000_000_000, FailureAction: 'pause', Monitor: 15_000_000_000, MaxFailureRatio: 0.15
        } as DockerServiceSpec['RollbackConfig'],
        EndpointSpec: input.ports ? {
            Ports: input.ports.map((port) => ({
                Protocol: toServicePortProtocol(port.protocol ?? port.portsProtocol),
                PublishedPort: asServicePort(port.hostPort ?? port.publishedPort),
                TargetPort: asServicePort(port.containerPort ?? port.targetPort)
            }))
        } : previous?.EndpointSpec
    }

    return spec
}

function asServicePort(value: string | number | undefined): number {
    const port = Number(value)
    if (!Number.isFinite(port)) throw new Error('Service port must be a number')
    return port
}

function asServiceReplicas(value: number | undefined): number {
    return value ?? 1
}
