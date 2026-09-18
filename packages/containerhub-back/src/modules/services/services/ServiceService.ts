import Docker from 'dockerode'
import {constants} from 'node:fs'
import {lstat, mkdir, open, realpath, stat} from 'node:fs/promises'
import path from 'node:path'
import type {Duplex} from 'node:stream'
import {z} from 'zod'
import {mapInspectToServiceModel, type ServiceModel} from '../helpers/mapInspectToServiceModel.js'
import {parseDockerImageReference} from '../helpers/parseDockerImageReference.js'
import {registerServiceMutation, type ServiceMutationContext} from './ServiceMutationAudit.js'
import {connectTaskAgentTerminal} from './AgentTerminalClient.js'
import {createAgentHealthClient} from './AgentHealthClient.js'
import {legacyContainerStats, normalizeContainerStats} from './ContainerStats.js'

type DockerServiceListOptions = import('dockerode').ServiceListOptions
type DockerServiceSpec = import('dockerode').ServiceSpec
type DockerContainerTaskSpec = import('dockerode').ContainerTaskSpec
type DockerTask = import('dockerode').Task
type DockerContainer = import('dockerode').ContainerInfo
type DockerNetworkCreateOptions = import('dockerode').NetworkCreateOptions
type DockerNetworkAttachment = import('dockerode').NetworkAttachmentConfig
type DockerMountSettings = import('dockerode').MountSettings
type ContainerHealthcheck = import('dockerode').HealthConfig

type DockerTaskLogOptions = {
    follow?: boolean
    stdout: boolean
    stderr: boolean
    tail: number
    since?: number
    timestamps?: boolean
}

type DockerTaskWithLogs = DockerTask & {
    logs(options: DockerTaskLogOptions): Promise<Buffer | NodeJS.ReadableStream>
}

type ServiceFilterOperator = 'like' | 'gte' | 'lte' | 'eq'
type ServiceFilterValue = string | number | boolean
type ServiceField = 'id' | 'name' | 'stack' | 'createdAt' | 'updatedAt'
type ServiceFilterField = ServiceField | 'image' | 'ports'

const SERVICE_FILTER_FIELDS = new Set<string>([
    'id', 'name', 'stack', 'image', 'ports', 'createdAt', 'updatedAt'
])

export type ServiceFilter = {
    field: ServiceFilterField
    operator: ServiceFilterOperator
    value: ServiceFilterValue | null
}

function isServiceFilterField(field: string): field is ServiceFilterField {
    return SERVICE_FILTER_FIELDS.has(field)
}

function parseServiceFilterField(field: unknown, index: number): ServiceFilterField {
    if (typeof field !== 'string' || !isServiceFilterField(field)) {
        throw new Error(`filter at index ${index} has invalid field "${String(field)}"`)
    }
    return field
}

type ServiceListFilterOptions = {
    stack?: string | null
    filters?: ServiceFilter[]
}

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
])
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
type ServiceInput = z.infer<typeof ServiceUpdateInputSchema>
type LabelInput = z.infer<typeof NamedValueInputSchema>
type VolumeInput = z.infer<typeof VolumeInputSchema>
type NetworkInput = z.infer<typeof NetworkInputSchema>
type LegacyHealthcheckInput = z.infer<typeof LegacyHealthcheckInputSchema>

type PaginateServicesOptions = {
    page: number
    limit: number
    orderBy?: string
    order?: 'asc' | 'desc'
    search?: string
    stack?: string | null
    filters?: ServiceFilter[]
}

const FolderInputSchema = z.union([
    z.string().min(1),
    z.object({hostPath: z.string().min(1).optional(), path: z.string().min(1).optional()})
        .refine((folder) => Boolean(folder.hostPath ?? folder.path), {message: 'Folder path is required'})
])
const FolderInputsSchema = z.array(FolderInputSchema)
const FileInputSchema = z.object({
    fileName: z.string().min(1),
    fileContent: z.any().refine((value) => value !== undefined, {message: 'fileContent is required'}),
    hostPath: z.string().min(1)
}).passthrough()
const FileInputsSchema = z.array(FileInputSchema)
type FolderInput = z.infer<typeof FolderInputSchema>
type FileInput = z.infer<typeof FileInputSchema>

type NetworkUpdateInput = Partial<DockerNetworkCreateOptions>

export function parseServiceFilters(raw: unknown): ServiceFilter[] {
    if (raw === undefined || raw === null || raw === '') return []
    let parsed: unknown
    try {
        parsed = JSON.parse(String(raw))
    } catch {
        throw new Error('filters must be a JSON-encoded array')
    }
    if (!Array.isArray(parsed)) throw new Error('filters must be a JSON-encoded array')

    return parsed.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
            throw new Error(`filter at index ${index} must be an object`)
        }
        const candidate = entry as Record<string, unknown>
        const field = parseServiceFilterField(candidate.field, index)
        const operator = candidate.operator
        const value = candidate.value
        if (typeof operator !== 'string' || !['like', 'gte', 'lte', 'eq'].includes(operator)) {
            throw new Error(`filter at index ${index} has invalid operator "${String(operator)}"`)
        }
        if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new Error(`filter at index ${index} value must be string, number, boolean or null`)
        }
        return {field, operator: operator as ServiceFilterOperator, value: value as ServiceFilterValue | null}
    })
}

function asServiceIdArray(serviceIds: unknown): string[] {
    if (!Array.isArray(serviceIds) || !serviceIds.length || serviceIds.some((serviceId) => typeof serviceId !== 'string' || !serviceId)) {
        throw new Error('serviceIds must be a non-empty array of service IDs')
    }
    return serviceIds
}

const docker = new Docker({socketPath: process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock'})
const agentHealthClient = createAgentHealthClient()

export async function fetchService(stack?: string | null): Promise<ServiceModel[]> {
    const dockerServices = await docker.listServices(buildDockerListFilters({stack}))
    return dockerServices.map((dockerService) => mapInspectToServiceModel(dockerService))
}

function buildDockerListFilters({stack, filters}: ServiceListFilterOptions = {}): DockerServiceListOptions {
    const labels: string[] = []
    if (stack) labels.push(`com.docker.stack.namespace=${stack}`)
    for (const filter of filters ?? []) {
        if (filter.field === 'stack' && filter.value) labels.push(`com.docker.stack.namespace=${String(filter.value)}`)
    }
    return labels.length ? {filters: {label: labels}} : {}
}

export function serviceOrderValue(service: ServiceModel, orderBy: string): string | null {
    switch (orderBy) {
        case 'id': return service.id
        case 'name': return service.name ?? null
        case 'stack': return service.stack
        case 'createdAt': return service.createdAt
        case 'updatedAt': return service.updatedAt
        case 'image.nameWithTag': return service.image.nameWithTag
        default: return null
    }
}

function matchesServiceFilters(service: ServiceModel, filters: ServiceFilter[] = []): boolean {
    return filters.every((filter) => {
        if (filter.value === null || filter.value === undefined || filter.value === '') return true

        const value = filter.field === 'image'
            ? service.image.nameWithTag
            : filter.field === 'ports'
                ? service.ports.map((port) => `${port.hostPort}:${port.containerPort}`).join(',')
                : service[filter.field]

        if (filter.operator === 'like') {
            return String(value ?? '').toLowerCase().includes(String(filter.value).toLowerCase())
        }

        if (filter.operator === 'gte' || filter.operator === 'lte') {
            const serviceTime = Date.parse(String(value ?? ''))
            const filterTime = Date.parse(String(filter.value))
            if (Number.isNaN(serviceTime) || Number.isNaN(filterTime)) return false
            return filter.operator === 'gte' ? serviceTime >= filterTime : serviceTime <= filterTime
        }

        return String(value ?? '') === String(filter.value)
    })
}

export async function paginateServices(opts: PaginateServicesOptions): Promise<{
    page: number
    limit: number
    total: number
    items: ServiceModel[]
}> {
    const dockerServices = await docker.listServices(buildDockerListFilters({stack: opts.stack, filters: opts.filters}))
    const all = dockerServices.map((dockerService) => mapInspectToServiceModel(dockerService))

    const q = (opts.search ?? '').trim().toLowerCase()
    const filtered = all.filter((service) => matchesServiceFilters(service, opts.filters) && (!q || service.name?.toLowerCase().includes(q)))

    const orderBy = opts.orderBy ?? 'name'
    const order = opts.order ?? 'asc'
    filtered.sort((leftService, rightService) => {
        const leftOrderValue = serviceOrderValue(leftService, orderBy)
        const rightOrderValue = serviceOrderValue(rightService, orderBy)
        if (leftOrderValue == null && rightOrderValue == null) return 0
        if (leftOrderValue == null) return 1
        if (rightOrderValue == null) return -1

        const comparison = leftOrderValue.localeCompare(rightOrderValue, undefined, {
            numeric: true,
            sensitivity: 'base'
        })
        return comparison * (order === 'desc' ? -1 : 1)
    })

    const total = filtered.length
    const start = (opts.page - 1) * opts.limit
    const items = filtered.slice(start, start + opts.limit)
    return {page: opts.page, limit: opts.limit, total, items}
}

export async function findServiceById(serviceId: string): Promise<ServiceModel> {
    const inspected = await docker.getService(serviceId).inspect()
    if (!inspected) throw new Error('Service not found')
    return mapInspectToServiceModel(inspected)
}

function isDockerNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'statusCode' in error
        && (error as {statusCode?: unknown}).statusCode === 404
}

export async function findServiceByIdOrName(identifier: string): Promise<ServiceModel> {
    try {
        return await findServiceById(identifier)
    } catch (error) {
        if (!isDockerNotFound(error)) throw error
        const services = await fetchService()
        const service = services.find((item) => item.name === identifier)
        if (!service) {
            const {NotFoundError} = await import('@drax/common-back')
            throw new NotFoundError(`Service ${identifier}`)
        }
        return service
    }
}

export async function findServiceTag(name: string): Promise<string | null> {
    const service = await findServiceByIdOrName(name)
    return service.image.tag
}

export async function fetchImageStatus(image: string): Promise<{status: 'useful' | 'useless'}> {
    const services = await fetchService()
    return {status: services.some(service => service.image.fullname === image) ? 'useful' : 'useless'}
}

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

function toServiceSpec(input: ServiceInput, previous?: DockerServiceSpec): DockerServiceSpec {
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
            Command: typeof input.command === 'string' ? [input.command] : input.command ?? container.Command,
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

async function parseServiceInput<T>(schema: z.ZodType<T>, input: unknown): Promise<T> {
    try {
        return await schema.parseAsync(input)
    } catch (error) {
        if (error instanceof z.ZodError) {
            const {ZodErrorToValidationError} = await import('@drax/common-back')
            throw ZodErrorToValidationError(error, input)
        }
        throw error
    }
}

export async function createService(input: ServiceInput, mutationContext: ServiceMutationContext): Promise<ServiceModel> {
    const validatedInput = await parseServiceInput(ServiceCreateInputSchema, input)
    const serviceSpec = toServiceSpec(validatedInput)
    await ensureServiceNetworks(serviceSpec, validatedInput.stack)
    const created = await docker.createService(serviceSpec)
    const service = await findServiceById(created.id)
    await registerServiceMutation('CREATE', service.id, mutationContext)
    return service
}

export async function updateService(serviceId: string, input: ServiceInput, mutationContext: ServiceMutationContext): Promise<ServiceModel> {
    const validatedInput = await parseServiceInput(ServiceUpdateInputSchema, input)
    const service = docker.getService(serviceId)
    const inspected = await service.inspect()
    const currentSpec: DockerServiceSpec = inspected.Spec
    const serviceSpec = toServiceSpec(validatedInput, currentSpec)
    await ensureServiceNetworks(serviceSpec, validatedInput.stack ?? currentSpec.Labels?.['com.docker.stack.namespace'])
    await service.update({...serviceSpec, version: inspected.Version.Index})
    const updatedService = await findServiceById(serviceId)
    await registerServiceMutation('UPDATE', serviceId, mutationContext)
    return updatedService
}

export async function dockerRestart(serviceId: string, mutationContext: ServiceMutationContext): Promise<{Warnings: string[]}> {
    const service = docker.getService(serviceId)
    const inspected = await service.inspect()
    const currentSpec: DockerServiceSpec = inspected.Spec
    const version = parseInt(String(inspected.Version?.Index ?? 0), 10)
    const updateOptions = {
        ...currentSpec,
        version,
        TaskTemplate: {
            ...currentSpec.TaskTemplate,
            ForceUpdate: (currentSpec.TaskTemplate?.ForceUpdate ?? 0) + 1
        }
    }
    const warnings = await service.update(updateOptions)
    await registerServiceMutation('RESTART', serviceId, mutationContext)
    return {Warnings: warnings?.Warnings ?? []}
}

export type ServiceRestartResult = {
    serviceId: string
    success: boolean
    warnings: string[]
    error?: string
}

export async function dockerRestartMany(serviceIds: unknown, mutationContext: ServiceMutationContext): Promise<ServiceRestartResult[]> {
    const validatedIds = asServiceIdArray(serviceIds)
    const results: ServiceRestartResult[] = []
    for (const serviceId of validatedIds) {
        try {
            const {Warnings: warnings} = await dockerRestart(serviceId, mutationContext)
            results.push({serviceId, success: true, warnings})
        } catch (error) {
            results.push({serviceId, success: false, warnings: [], error: error instanceof Error ? error.message : 'Unknown error'})
        }
    }
    return results
}

export async function dockerRemove(serviceId: string, mutationContext: ServiceMutationContext): Promise<{message: string}> {
    const service = docker.getService(serviceId)
    await service.remove()
    await registerServiceMutation('DELETE', serviceId, mutationContext)
    return {message: `Service ${serviceId} removed`}
}

export type ServiceRemoveResult = {
    serviceId: string
    success: boolean
    error?: string
}

export async function dockerRemoveMany(serviceIds: unknown, mutationContext: ServiceMutationContext): Promise<ServiceRemoveResult[]> {
    const validatedIds = asServiceIdArray(serviceIds)
    const results: ServiceRemoveResult[] = []
    for (const serviceId of validatedIds) {
        try {
            await dockerRemove(serviceId, mutationContext)
            results.push({serviceId, success: true})
        } catch (error) {
            results.push({serviceId, success: false, error: error instanceof Error ? error.message : 'Unknown error'})
        }
    }
    return results
}

async function fetchRawTasks(serviceIdentifier: string): Promise<DockerTask[]> {
    const service = await findServiceByIdOrName(serviceIdentifier)
    return docker.listTasks({filters: JSON.stringify({service: [service.id]})})
}

export async function fetchTasks(serviceIdentifier: string): Promise<ServiceTaskModel[]> {
    return (await fetchRawTasks(serviceIdentifier)).map(toServiceTaskModel)
}

export async function fetchTaskInspect(taskId: string) {
    return redactTaskInspect(await docker.getTask(taskId).inspect())
}

const sensitiveInspectField = /password|passwd|secret|token|credential|authorization|authentication|auth(?:config|data|header)|auth$|api.?key|access.?key|private.?key|client.?key/i

export function redactTaskInspect(value: unknown, field?: string): unknown {
    if (field === 'Command' || field === 'Args') return '[REDACTED]'
    if (field === 'Env' && Array.isArray(value)) {
        return value.map((entry) => {
            if (typeof entry !== 'string') return '[REDACTED]'
            const separator = entry.indexOf('=')
            return separator < 0 ? '[REDACTED]' : `${entry.slice(0, separator)}=[REDACTED]`
        })
    }
    if (field === 'Labels' && value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.keys(value).map((key) => [key, '[REDACTED]']))
    }
    if (field && sensitiveInspectField.test(field)) return '[REDACTED]'
    if (Array.isArray(value)) return value.map((entry) => redactTaskInspect(entry))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactTaskInspect(entry, key)]))
}

function getRecordField(record: unknown, key: string): Record<string, unknown> | undefined {
    if (!record || typeof record !== 'object') return undefined
    const value = (record as Record<string, unknown>)[key]
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function getOptionalField(record: unknown, key: string): string | undefined {
    if (!record || typeof record !== 'object') return undefined
    const value = (record as Record<string, unknown>)[key]
    return value == null ? undefined : String(value)
}

function getContainerId(record: unknown): string | undefined {
    const status = getRecordField(record, 'Status')
    const containerStatus = getRecordField(status, 'ContainerStatus')
    const id = containerStatus?.ContainerID
    return typeof id === 'string' ? id : undefined
}

export function getImageObject(inputImage = '') {
    return parseDockerImageReference(inputImage)
}

export type ServiceTaskModel = {
    id: string
    serviceId?: string
    nodeId?: string
    containerId?: string
    state?: string
    message?: string
    createdAt?: string
    updatedAt?: string
}

export function toServiceTaskModel(task: unknown): ServiceTaskModel {
    const status = getRecordField(task, 'Status')
    return {
        id: getOptionalField(task, 'ID') ?? '',
        serviceId: getOptionalField(task, 'ServiceID'),
        nodeId: getOptionalField(task, 'NodeID'),
        containerId: getContainerId(task),
        state: getOptionalField(status, 'State'),
        message: getOptionalField(status, 'Message'),
        createdAt: getOptionalField(task, 'CreatedAt'),
        updatedAt: getOptionalField(task, 'UpdatedAt')
    }
}

export type TaskTerminalConnection = {
    stream: Duplex
    resize(columns: number, rows: number): Promise<void>
    close(): void
}

export async function openTaskTerminalConnection(taskId: string, shell: 'sh' | 'bash'): Promise<TaskTerminalConnection> {
    if (shell !== 'sh' && shell !== 'bash') throw new Error('invalid terminal shell')
    const task = await docker.getTask(taskId).inspect()
    const containerId = getContainerId(task)
    const nodeId = getOptionalField(task, 'NodeID')
    if (!containerId || !nodeId || getOptionalField(getRecordField(task, 'Status'), 'State') !== 'running') {
        throw new Error('task has no running container')
    }
    const localNodeId = getOptionalField(getRecordField(await docker.info(), 'Swarm'), 'NodeID')
    if (!localNodeId) throw new Error('local Swarm node identity unavailable')
    if (nodeId !== localNodeId) {
        return connectTaskAgentTerminal(nodeId, containerId, task.ID, shell)
    }
    const terminalExec = await docker.getContainer(containerId).exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: [shell, '-c', 'stty -ixon; exec "$0" -i', shell]
    })
    const stream = await terminalExec.start({hijack: true, stdin: true, Tty: true})
    return {
        stream,
        resize: async (columns, rows) => { await terminalExec.resize({w: columns, h: rows}) },
        close: () => stream.destroy()
    }
}

export async function openTaskTerminal(taskId: string, shell: 'sh' | 'bash'): Promise<Duplex> {
    return (await openTaskTerminalConnection(taskId, shell)).stream
}

export async function fetchTaskStats(taskId: string) {
    const task = await docker.getTask(taskId).inspect()
    return taskStatistics(task)
}

export async function fetchServiceStats(serviceIdentifier: string) {
    const runningTasks = (await fetchRawTasks(serviceIdentifier)).filter(task => getOptionalField(task, 'DesiredState') === 'running')
    return Promise.all(runningTasks.map(taskStatistics))
}

async function taskStatistics(task: DockerTask) {
    const stats = await fetchTaskContainerStats(task)
    try {
        const metrics = stats === null ? null : normalizeContainerStats(stats)
        return {task: toServiceTaskModel(task), stats: metrics === null ? null : legacyContainerStats(stats, metrics), metrics}
    } catch {
        throw Object.assign(new Error(`Invalid container stats for task ${getOptionalField(task, 'ID') ?? 'unknown'}`), {statusCode: 503})
    }
}

async function fetchTaskContainerStats(task: DockerTask) {
    const containerId = getContainerId(task)
    if (!containerId) return null
    const nodeId = getOptionalField(task, 'NodeID')
    const localNodeId = getOptionalField(getRecordField(await docker.info(), 'Swarm'), 'NodeID')
    if (nodeId && nodeId === localNodeId) return docker.getContainer(containerId).stats({stream: false})
    try {
        if (!nodeId || !agentHealthClient) throw new Error('Node agent is not configured')
        return await agentHealthClient.fetchContainerStats(nodeId, containerId)
    } catch {
        throw Object.assign(new Error(`Cannot fetch stats on node ${nodeId ?? 'unknown'}`), {statusCode: 503})
    }
}


export function parseTaskLogTail(rawTail: unknown, maxTail: number = 10000): number {
    if (typeof rawTail === 'string') {
        const parsed = parseInt(rawTail, 10)
        if (isNaN(parsed)) throw new Error('Tail must be an integer.')
        rawTail = parsed
    }
    if (typeof rawTail === 'number') {
        if (rawTail <= 0) throw new Error('Tail must be a positive integer.')
        if (rawTail > maxTail) throw new Error(`Tail must be at most ${maxTail}.`)
        return rawTail
    }
    throw new Error('Invalid tail parameter.')
}

function toLogLines(logOutput: string): string[] {
    const lines = logOutput.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return lines
}

function hasDockerMultiplexedLogHeader(output: Buffer, offset: number): boolean {
    const streamType = output[offset]
    return (streamType === 1 || streamType === 2) && output[offset + 1] === 0 && output[offset + 2] === 0 && output[offset + 3] === 0
}

export function decodeDockerLogOutput(output: Buffer): string[] {
    if (!output.length || !hasDockerMultiplexedLogHeader(output, 0)) return toLogLines(output.toString('utf8'))

    const payloads: Buffer[] = []
    let offset = 0
    while (offset < output.length) {
        if (offset + 8 > output.length || !hasDockerMultiplexedLogHeader(output, offset)) return toLogLines(output.toString('utf8'))
        const payloadLength = output.readUInt32BE(offset + 4)
        const payloadStart = offset + 8
        const payloadEnd = payloadStart + payloadLength
        if (payloadEnd > output.length) return toLogLines(output.toString('utf8'))
        payloads.push(output.subarray(payloadStart, payloadEnd))
        offset = payloadEnd
    }

    return toLogLines(Buffer.concat(payloads).toString('utf8'))
}

export type TaskLogFilters = {
    tail: number
    since: number
    timestamps: boolean
    include: string[]
    exclude: string[]
}

export function createDockerLogLineDecoder(onLogLine: (logLine: string) => void) {
    let bufferedOutput = Buffer.alloc(0)
    let pendingLine = ''

    function emitText(text: string): void {
        const completeLines = `${pendingLine}${text}`.split(/\r?\n/)
        pendingLine = completeLines.pop() ?? ''
        for (const logLine of completeLines) if (logLine) onLogLine(logLine)
    }

    return {
        push(chunk: Buffer): void {
            bufferedOutput = Buffer.concat([bufferedOutput, chunk])
            while (bufferedOutput.length) {
                if (!hasDockerMultiplexedLogHeader(bufferedOutput, 0)) {
                    emitText(bufferedOutput.toString('utf8'))
                    bufferedOutput = Buffer.alloc(0)
                    return
                }
                if (bufferedOutput.length < 8) return
                const payloadLength = bufferedOutput.readUInt32BE(4)
                const payloadEnd = 8 + payloadLength
                if (bufferedOutput.length < payloadEnd) return
                emitText(bufferedOutput.subarray(8, payloadEnd).toString('utf8'))
                bufferedOutput = bufferedOutput.subarray(payloadEnd)
            }
        },
        end(): void {
            if (bufferedOutput.length) emitText(bufferedOutput.toString('utf8'))
            if (pendingLine) onLogLine(pendingLine)
            bufferedOutput = Buffer.alloc(0)
            pendingLine = ''
        }
    }
}

function matchesTaskLogFilters(logLine: string, filters: TaskLogFilters): boolean {
    const normalizedLogLine = logLine.replace(/\u001b\[[0-9;]*m/g, '').toLowerCase()
    const matchesTerm = (term: string) => {
        try { return new RegExp(term.replace(/\*/g, '.*'), 'i').test(normalizedLogLine) }
        catch { return normalizedLogLine.includes(term.toLowerCase()) }
    }
    if (filters.exclude.some(matchesTerm)) return false
    return filters.include.every((includeFilter) => includeFilter.split(',').map((term) => term.trim()).filter(Boolean).some(matchesTerm))
}

export async function streamTaskLogs(taskId: string, filters: TaskLogFilters, onLogLine: (logLine: string) => void, onClose: () => void): Promise<() => void> {
    const output = await (docker.getTask(taskId) as DockerTaskWithLogs).logs({
        follow: true, stdout: true, stderr: true, tail: filters.tail, since: filters.since, timestamps: filters.timestamps
    })
    const decoder = createDockerLogLineDecoder((logLine) => {
        if (matchesTaskLogFilters(logLine, filters)) onLogLine(logLine)
    })
    if (Buffer.isBuffer(output)) {
        decoder.push(output)
        decoder.end()
        onClose()
        return () => undefined
    }
    const closeStream = () => {
        decoder.end()
        onClose()
    }
    output.on('data', (chunk: Buffer | string) => decoder.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    output.once('end', closeStream)
    output.once('error', closeStream)
    return () => {
        const destroyableOutput = output as NodeJS.ReadableStream & {destroy?: () => void}
        destroyableOutput.destroy?.()
    }
}

export async function fetchTaskLogs(taskId: string, tail: number): Promise<string[]> {
    const output = await (docker.getTask(taskId) as DockerTaskWithLogs).logs({stdout: true, stderr: true, tail})
    return Buffer.isBuffer(output) ? decodeDockerLogOutput(output) : []
}

export async function fetchLogs(stackName: string, serviceName: string, lines = 30): Promise<string[] | null> {
    const tasks = await fetchTasks(`${stackName}_${serviceName}`)
    const taskId = tasks.find((task) => task.state === 'running')?.id
    if (!taskId) return null

    return fetchTaskLogs(taskId, lines)
}

export async function fetchNodes() {
    return Promise.all((await docker.listNodes()).map(async (node) => {
        const description = getRecordField(node, 'Description')
        const status = getRecordField(node, 'Status')
        const specification = getRecordField(node, 'Spec')
        const managerStatus = getRecordField(node, 'ManagerStatus')
        const id = getOptionalField(node, 'ID')
        const ip = getOptionalField(status, 'Addr')
        const role = getOptionalField(specification, 'Role')
        return {
            id,
            hostname: getOptionalField(description, 'Hostname'),
            ip,
            role,
            availability: getOptionalField(specification, 'Availability'),
            state: getOptionalField(status, 'State'),
            engine: getOptionalField(getRecordField(description, 'Engine'), 'EngineVersion'),
            leader: managerStatus?.Leader === true,
            reachability: getOptionalField(managerStatus, 'Reachability') ?? null,
            resources: description?.Resources ?? null,
            agentHealthy: agentHealthClient && id && role === 'worker' ? await agentHealthClient.isHealthy(id) : null
        }
    }))
}

export async function fetchNodeAndTasks() {
    const [nodes, tasks] = await Promise.all([
        docker.listNodes(),
        docker.listTasks()
    ])

    return nodes.map(node => {
        const nodeId = (node as any).ID
        const nodeTasks = tasks
            .filter((task: any) => task.NodeID === nodeId)
            .map((task: any) => ({
                id: task.ID,
                nodeId: task.NodeID,
                createdAt: task.CreatedAt,
                updatedAt: task.UpdatedAt,
                state: task.Status?.State,
                message: task.Status?.Message,
                image: getImageObject(task.Spec?.ContainerSpec?.Image),
                serviceId: task.ServiceID,
                containerId: task.Status?.ContainerStatus?.ContainerID,
            }))

        return {
            id: nodeId,
            hostname: (node as any).Description?.Hostname,
            ip: (node as any).Status?.Addr,
            role: (node as any).Spec?.Role,
            availability: (node as any).Spec?.Availability,
            state: (node as any).Status?.State,
            engine: (node as any).Description?.Engine?.EngineVersion,
            leader: (node as any).ManagerStatus?.Leader,
            reachability: (node as any).ManagerStatus?.Reachability,
            resources: (node as any).Description?.Resources,
            labels: (node as any).Spec?.Labels,
            tasks: nodeTasks
        }
    })
}

export async function fetchClusterSummary(): Promise<{nodesQuantity: number; servicesQuantity: number; tasksQuantity: number}> {
    const [nodes, services, tasks] = await Promise.all([docker.listNodes(), docker.listServices(), docker.listTasks()])
    return {nodesQuantity: nodes.length, servicesQuantity: services.length, tasksQuantity: tasks.length}
}

export async function fetchDockerVersion(): Promise<{Version?: string; ApiVersion?: string}> {
    const {Version, ApiVersion} = await docker.version()
    return {Version, ApiVersion}
}

export async function fetchNetworks() {
    return docker.listNetworks()
}

export async function fetchNetwork(network: string) {
    return docker.getNetwork(network).inspect()
}

export async function createNetwork(input: DockerNetworkCreateOptions) {
    return docker.createNetwork(input)
}

export async function updateNetwork(networkId: string, input: NetworkUpdateInput) {
    if (!input || Object.keys(input).length < 1) throw new Error('You must provide the new network information!')

    const originalNetwork = await fetchNetwork(networkId)
    const replacement: DockerNetworkCreateOptions = {
        ...(originalNetwork as Partial<DockerNetworkCreateOptions>),
        ...input,
        Name: (input.Name ?? (originalNetwork as {Name?: string}).Name) ?? networkId
    }
    await removeNetwork(networkId)
    return createNetwork(replacement)
}

export async function removeNetwork(network: string) {
    return docker.getNetwork(network).remove()
}

export async function getOrCreateNetwork(network: string, stack?: string | null) {
    try {
        return await fetchNetwork(network)
    } catch {
        return createNetwork({
            Name: network,
            Driver: 'overlay',
            Attachable: true,
            Labels: stack ? {'com.docker.stack.namespace': stack} : undefined
        })
    }
}

async function ensureServiceNetworks(serviceSpec: DockerServiceSpec, stack?: string | null): Promise<void> {
    for (const network of serviceSpec.TaskTemplate?.Networks ?? []) {
        if (network.Target) await getOrCreateNetwork(network.Target, stack)
    }
}

export type GhostContainer = Pick<DockerContainer, 'Id' | 'Created' | 'Image' | 'Status' | 'State' | 'Labels'> & {NodeID?: string}

export async function fetchGhostContainers(): Promise<GhostContainer[]> {
    const [localContainers, tasks, dockerInfo, nodes] = await Promise.all([
        docker.listContainers({all: false}),
        docker.listTasks(),
        docker.info(),
        docker.listNodes()
    ])
    const tasksById = new Map(tasks.map((task) => [task.ID, task]))
    const localNodeId = getOptionalField(getRecordField(dockerInfo, 'Swarm'), 'NodeID')
    const containers: GhostContainer[] = localContainers.map((container) => ({...container, NodeID: localNodeId}))
    for (const node of nodes) {
        if (node.ID === localNodeId) continue
        try {
            if (!agentHealthClient) throw new Error('Node agent is not configured')
            const nodeContainers = await agentHealthClient.fetchRunningContainers(node.ID)
            containers.push(...nodeContainers.map((container) => ({...container, NodeID: node.ID})))
        } catch {
            throw Object.assign(new Error(`Cannot scan containers on node ${node.ID}`), {statusCode: 503})
        }
    }

    return containers.flatMap((container) => {
        const labels = container.Labels ?? {}
        const taskId = labels['com.docker.swarm.task.id']
        if (Object.keys(labels).length && !taskId) return []

        const task = taskId ? tasksById.get(taskId) : undefined
        if (task && getOptionalField(getRecordField(task, 'Status'), 'State') === 'running' && getContainerId(task) === container.Id) return []

        return [container]
    })
}

function isPathInside(target: string, root: string): boolean {
    return target === root || target.startsWith(`${root}${path.sep}`)
}

function configuredHostVolumeRoots(): string[] {
    const configuredRoots = process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
        ?.split(',')
        .map((root) => root.trim())
        .filter(Boolean)
    const roots = configuredRoots?.length ? configuredRoots : [process.env.DOCKER_DATA_PATH?.trim() ?? '']
    if (!roots.length || roots.some((root) => !path.isAbsolute(root))) {
        throw new Error('CONTAINERHUB_HOST_VOLUME_ROOTS must contain absolute paths')
    }
    return [...new Set(roots.map((root) => path.resolve(root)))]
}

async function existingRealPath(target: string): Promise<string> {
    let candidate = target
    while (true) {
        try {
            return await realpath(candidate)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            const parent = path.dirname(candidate)
            if (parent === candidate) throw new Error('Invalid host path')
            candidate = parent
        }
    }
}

async function rejectSymlinkComponents(root: string, target: string): Promise<void> {
    let candidate = root
    for (const component of path.relative(root, target).split(path.sep).filter(Boolean)) {
        candidate = path.join(candidate, component)
        try {
            if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Invalid host path')
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
            throw error
        }
    }
}

function protectedDatabasePaths(): string[] {
    const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
    const databasePaths = [
        process.env.DRAX_SQLITE_FILE?.trim(),
        dockerDataPath && path.join(dockerDataPath, 'containerhub.sqlite')
    ].filter((databasePath): databasePath is string => Boolean(databasePath && path.isAbsolute(databasePath)))
    return [...new Set(databasePaths.map((databasePath) => path.resolve(databasePath)))]
}

async function isDatabaseFile(target: string, databasePaths: string[]): Promise<boolean> {
    for (const databasePath of databasePaths) {
        if (target === databasePath) return true
        try {
            const [targetStats, databaseStats] = await Promise.all([stat(target), stat(databasePath)])
            if (targetStats.dev === databaseStats.dev && targetStats.ino === databaseStats.ino) return true
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }
    return false
}

type SafeDataPath = {root: string; target: string}

async function safeDataPath(hostPath: string, fileName?: string): Promise<SafeDataPath> {
    const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
    const target = path.isAbsolute(hostPath)
        ? path.resolve(hostPath, fileName ?? '')
        : dockerDataPath
            ? path.resolve(dockerDataPath, hostPath, fileName ?? '')
            : (() => { throw new Error('DOCKER_DATA_PATH must be configured for relative host paths') })()
    const root = configuredHostVolumeRoots().find((candidate) => isPathInside(target, candidate))
    if (!root) throw new Error('Invalid host path')

    if (await isDatabaseFile(target, protectedDatabasePaths())) throw new Error('Cannot overwrite ContainerHub database file')

    const [realRoot, realExistingPath] = await Promise.all([
        realpath(root),
        existingRealPath(target),
        rejectSymlinkComponents(root, target)
    ])
    if (!isPathInside(realExistingPath, realRoot)) throw new Error('Invalid host path')

    return {root, target}
}

function isNodeError(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as {code?: string}).code === code
}

async function openSecureDirectory(root: string, target: string) {
    const relative = path.relative(root, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Invalid host volume path: ${target}`)
    let directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
        for (const segment of relative.split(path.sep).filter(Boolean)) {
            const child = `/proc/self/fd/${directory.fd}/${segment}`
            try {
                await mkdir(child)
            } catch (error) {
                if (!isNodeError(error, 'EEXIST')) throw error
            }
            const next = await open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
            await directory.close()
            directory = next
        }
        return directory
    } catch (error) {
        await directory.close().catch(() => undefined)
        throw error
    }
}

async function writeSecureFile(root: string, target: string, content: string) {
    const directory = await openSecureDirectory(root, path.dirname(target))
    const filePath = `/proc/self/fd/${directory.fd}/${path.basename(target)}`
    let file
    try {
        try {
            file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW)
        } catch (error) {
            if (!isNodeError(error, 'ENOENT')) throw error
            try {
                file = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o666)
            } catch (createError) {
                if (!isNodeError(createError, 'EEXIST')) throw createError
                file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW)
            }
        }
        const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
        if (dockerDataPath) {
            const candidate = await file.stat()
            try {
                const database = await stat(path.resolve(dockerDataPath))
                if (candidate.dev === database.dev && candidate.ino === database.ino) throw new Error(`Refusing to overwrite ContainerHub database file: ${target}`)
            } catch (error) {
                if (!isNodeError(error, 'ENOENT')) throw error
            }
        }
        await file.truncate(0)
        await file.writeFile(content)
    } finally {
        await file?.close().catch(() => undefined)
        await directory.close().catch(() => undefined)
    }
}

function folderHostPath(folder: FolderInput): string {
    return typeof folder === 'string' ? folder : folder.hostPath ?? folder.path!
}

export async function createFolders(folders: unknown): Promise<{success: true}> {
    const validatedFolders = await parseServiceInput(FolderInputsSchema, folders)

    const dockerInfo = await docker.info()
    const localNodeId = getOptionalField(getRecordField(dockerInfo, 'Swarm'), 'NodeID')
    const nodes = await fetchNodes()

    await Promise.all(nodes.map(async (node) => {
        if (node.id === localNodeId) {
            await Promise.all(validatedFolders.map(async (folder) => {
                const {root, target} = await safeDataPath(folderHostPath(folder))
                const directory = await openSecureDirectory(root, target)
                await directory.close()
            }))
        } else {
            if (!agentHealthClient || !node.id) throw new Error(`No agent is available for node ${node.id}`)
            await agentHealthClient.createFolders(node.id, validatedFolders)
        }
    }))

    return {success: true}
}

export async function createFiles(files: unknown): Promise<{message: string}> {
    const validatedFiles = await parseServiceInput(FileInputsSchema, files)

    const dockerInfo = await docker.info()
    const localNodeId = getOptionalField(getRecordField(dockerInfo, 'Swarm'), 'NodeID')
    const nodes = await fetchNodes()

    await Promise.all(nodes.map(async (node) => {
        if (node.id === localNodeId) {
            await Promise.all(validatedFiles.map(async (file) => {
                const {root, target} = await safeDataPath(file.hostPath, file.fileName)
                await writeSecureFile(root, target, file.fileContent)
            }))
        } else {
            if (!agentHealthClient || !node.id) throw new Error(`No agent is available for node ${node.id}`)
            await agentHealthClient.createFiles(node.id, validatedFiles)
        }
    }))

    return {message: 'File successfully created!'}
}
