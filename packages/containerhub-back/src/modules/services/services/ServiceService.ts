import Docker from 'dockerode'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {Duplex} from 'node:stream'
import {mapInspectToServiceModel, type ServiceModel} from '../helpers/mapInspectToServiceModel.js'

type DockerServiceListOptions = import('dockerode').ServiceListOptions
type DockerServiceSpec = import('dockerode').ServiceSpec
type DockerContainerTaskSpec = import('dockerode').ContainerTaskSpec
type DockerTask = import('dockerode').Task
type DockerNetworkCreateOptions = import('dockerode').NetworkCreateOptions
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

type LabelInput = {
    name: string
    value?: string
}

type EnvInput = {
    name: string
    value?: string
}

type MountType = 'bind' | 'volume' | 'tmpfs'
type VolumeInput = {
    type?: MountType
    hostVolume?: string
    source?: string
    containerVolume?: string
    target?: string
    readOnly?: boolean
}

type ConstraintInput = {
    name: string
    operation: string
    value: string
}

type PreferenceInput = {
    value?: string
}

type PortInput = {
    protocol?: string
    hostPort?: number
    publishedPort?: number
    containerPort?: number
    targetPort?: number
}

type NetworkInput = string | {
    id?: string
    target?: string
}

type DeployMode = 'global' | 'replicated'

type ServiceInput = {
    name?: string
    image?: string
    stack?: string | null
    labels?: LabelInput[]
    command?: string[]
    envs?: EnvInput[]
    volumes?: VolumeInput[]
    dns?: string[]
    extraHosts?: string[]
    healthcheck?: ContainerHealthcheck
    constraints?: ConstraintInput[]
    preferences?: PreferenceInput[]
    deployMode?: DeployMode
    replicas?: number
    ports?: PortInput[]
    networks?: NetworkInput[]
}

type PaginateServicesOptions = {
    page: number
    limit: number
    orderBy?: string
    order?: 'asc' | 'desc'
    search?: string
    stack?: string | null
    filters?: ServiceFilter[]
}

type FolderInput = {
    hostPath?: string
    path?: string
}

type FileInput = {
    fileName?: string
    fileContent?: string | NodeJS.ArrayBufferView
    hostPath?: string
}

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
    if (!Array.isArray(serviceIds) || serviceIds.some((serviceId) => typeof serviceId !== 'string' || !serviceId)) {
        throw new Error('serviceIds must be an array of non-empty service IDs')
    }
    return serviceIds
}

const docker = new Docker({socketPath: process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock'})

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

export async function findServiceByIdOrName(identifier: string): Promise<ServiceModel> {
    try {
        return await findServiceById(identifier)
    } catch {
        const services = await fetchService()
        const service = services.find((item) => item.name === identifier)
        if (!service) throw new Error('Service not found')
        return service
    }
}

export async function findServiceTag(name: string): Promise<string | null> {
    const service = await findServiceByIdOrName(name)
    return service.image.tag
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

function toServiceSpec(input: ServiceInput, previous?: DockerServiceSpec): DockerServiceSpec {
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
            Command: input.command ?? container.Command,
            Env: input.envs ? input.envs.map((env) => `${env.name}=${env.value ?? ''}`) : container.Env,
            Labels: {...(container.Labels ?? {}), ...labelsToObject(input.labels)},
            Mounts: input.volumes ? input.volumes.map(toMountSettings) : container.Mounts,
            DNSConfig: input.dns ? {Nameservers: input.dns} : container.DNSConfig,
            Hosts: input.extraHosts ? input.extraHosts.map((host) => {
                const [hostname, address] = host.split(':')
                return `${address} ${hostname}`
            }) : container.Hosts,
            HealthCheck: input.healthcheck ?? container.HealthCheck
        },
        Placement: input.constraints || input.preferences ? {
            ...(previous?.TaskTemplate?.Placement ?? {}),
            Constraints: input.constraints?.map((constraint) => `${constraint.name} ${constraint.operation} ${constraint.value}`),
            Preferences: input.preferences?.map((preference) => ({Spread: {SpreadDescriptor: preference.value ?? ''}}))
        } : previous?.TaskTemplate?.Placement
    }

    const spec: DockerServiceSpec = {
        ...previous,
        Name: name,
        Labels: labels,
        TaskTemplate: taskTemplate,
        Mode: input.deployMode === 'global'
            ? {Global: {}}
            : input.deployMode === 'replicated' || input.replicas !== undefined
                ? {Replicated: {Replicas: asServiceReplicas(input.replicas)}}
                : previous?.Mode,
        EndpointSpec: input.ports ? {
            Ports: input.ports.map((port) => ({
                Protocol: toServicePortProtocol(port.protocol),
                PublishedPort: asServicePort(port.hostPort ?? port.publishedPort),
                TargetPort: asServicePort(port.containerPort ?? port.targetPort)
            }))
        } : previous?.EndpointSpec,
        Networks: input.networks ? input.networks.map((network) => ({
            Target: typeof network === 'string' ? network : network.id ?? network.target
        })) : previous?.Networks
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

export async function createService(input: ServiceInput): Promise<ServiceModel> {
    const created = await docker.createService(toServiceSpec(input))
    return findServiceById(created.ID)
}

export async function updateService(serviceId: string, input: ServiceInput): Promise<ServiceModel> {
    const service = docker.getService(serviceId)
    const inspected = await service.inspect()
    const currentSpec: DockerServiceSpec = inspected.Spec
    await service.update({...toServiceSpec(input, currentSpec), version: inspected.Version.Index})
    return findServiceById(serviceId)
}

export async function dockerRestart(serviceId: string): Promise<{Warnings: string[]}> {
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
    return {Warnings: warnings?.Warnings ?? []}
}

export async function dockerRestartMany(serviceIds: unknown): Promise<Array<{Warnings: string[]}>> {
    const validatedIds = asServiceIdArray(serviceIds)
    const results: Array<{Warnings: string[]}> = []
    for (const serviceId of validatedIds) results.push(await dockerRestart(serviceId))
    return results
}

export async function dockerRemove(serviceId: string): Promise<{message: string}> {
    const service = docker.getService(serviceId)
    await service.remove()
    return {message: `Service ${serviceId} removed`}
}

export async function dockerRemoveMany(serviceIds: unknown): Promise<Array<{message: string}>> {
    const validatedIds = asServiceIdArray(serviceIds)
    const results: Array<{message: string}> = []
    for (const serviceId of validatedIds) results.push(await dockerRemove(serviceId))
    return results
}

async function fetchRawTasks(serviceIdentifier: string): Promise<DockerTask[]> {
    const service = await findServiceByIdOrName(serviceIdentifier)
    return docker.listTasks({filters: JSON.stringify({service: [service.id]})})
}

export async function fetchTasks(serviceIdentifier: string): Promise<ServiceTaskModel[]> {
    return (await fetchRawTasks(serviceIdentifier)).map(toServiceTaskModel)
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
    const task = await docker.getTask(taskId).inspect()
    const containerId = getContainerId(task)
    if (!containerId) throw new Error('task has no running container')
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
    const containerId = getContainerId(task)
    return {
        task,
        stats: containerId ? await docker.getContainer(containerId).stats({stream: false}) : null
    }
}

export async function fetchServiceStats(serviceIdentifier: string) {
    return Promise.all((await fetchRawTasks(serviceIdentifier)).map(async (task) => {
        const containerId = getContainerId(task)
        return {
            task,
            stats: containerId ? await docker.getContainer(containerId).stats({stream: false}) : null
        }
    }))
}

export const MAX_TASK_LOG_LINES = 2_000

export function parseTaskLogTail(rawTail: unknown): number {
    const tail = Number(rawTail)
    if (!Number.isInteger(tail) || tail < 1) throw new Error('tail must be a positive integer')
    if (tail > MAX_TASK_LOG_LINES) throw new Error(`tail must be at most ${MAX_TASK_LOG_LINES}`)
    return tail
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
    const runningTask = tasks.find((task) => getOptionalField(getRecordField(task, 'Status'), 'State') === 'running')
    const taskId = runningTask ? getOptionalField(runningTask, 'ID') : undefined
    if (!taskId) return null

    return fetchTaskLogs(taskId, lines)
}

export async function fetchNodes() {
    return (await docker.listNodes()).map((node) => {
        const description = getRecordField(node, 'Description')
        const status = getRecordField(node, 'Status')
        const specification = getRecordField(node, 'Spec')
        const managerStatus = getRecordField(node, 'ManagerStatus')
        return {
            id: getOptionalField(node, 'ID'),
            hostname: getOptionalField(description, 'Hostname'),
            ip: getOptionalField(status, 'Addr'),
            role: getOptionalField(specification, 'Role'),
            availability: getOptionalField(specification, 'Availability'),
            state: getOptionalField(status, 'State'),
            engine: getOptionalField(getRecordField(description, 'Engine'), 'EngineVersion'),
            leader: managerStatus?.Leader === true,
            reachability: getOptionalField(managerStatus, 'Reachability') ?? null,
            resources: description?.Resources ?? null
        }
    })
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

export async function getOrCreateNetwork(network: string) {
    try {
        return await fetchNetwork(network)
    } catch {
        return createNetwork({Name: network, Driver: 'overlay', Attachable: true})
    }
}

export async function fetchGhostContainers() {
    return docker.listContainers({all: true, filters: JSON.stringify({label: ['com.docker.swarm.service.id']})})
}

function safeDataPath(hostPath: string, fileName?: string): string {
    const root = process.env.DOCKER_DATA_PATH
    if (!root) throw new Error('DOCKER_DATA_PATH must be configured')

    const target = path.resolve(root, hostPath.replace(/^[/\\]+/, ''), fileName ?? '')
    if (target !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
        throw new Error('Invalid host path')
    }
    return target
}

export async function createFolders(folders: FolderInput[]): Promise<{success: true}> {
    if (!Array.isArray(folders)) throw new Error('Request body must be an array')

    await Promise.all(folders.map((folder) => mkdir(safeDataPath(folder.hostPath ?? folder.path ?? ''), {recursive: true})))
    return {success: true}
}

export async function createFiles(files: FileInput[]): Promise<{message: string}> {
    if (!Array.isArray(files)) throw new Error('Request body must be an array')

    await Promise.all(files.map(async (file) => {
        if (!file.fileName || file.fileContent === undefined || !file.hostPath) {
            throw new Error('fileName, fileContent and hostPath are required')
        }

        const filePath = safeDataPath(file.hostPath, file.fileName)
        await mkdir(path.dirname(filePath), {recursive: true})
        await writeFile(filePath, file.fileContent)
    }))

    return {message: 'File successfully created!'}
}
