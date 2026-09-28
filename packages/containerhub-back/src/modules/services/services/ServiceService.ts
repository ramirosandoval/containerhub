import Docker from 'dockerode'
import type {Duplex} from 'node:stream'
import {z} from 'zod'
import {mapInspectToServiceModel, type ServiceModel, type ServiceReadOptions} from '../helpers/mapInspectToServiceModel.js'
import {parseDockerImageReference} from '../helpers/parseDockerImageReference.js'
import {registerServiceMutation, type ServiceMutationContext} from './ServiceMutationAudit.js'
import {connectTaskAgentTerminal} from './AgentTerminalClient.js'
import {createAgentHealthClient} from './AgentHealthClient.js'
import {createHostFile, createHostFolder} from './HostVolumeProvisioning.js'
import {legacyContainerStats, normalizeContainerStats} from './ContainerStats.js'
import {createDockerLogLineDecoder, decodeDockerLogOutput} from './TaskLogDecoder.js'
import {matchesServiceFilters, serviceOrderValue} from './ServiceFilters.js'
import type {ServiceFilter} from './ServiceFilters.js'
import {ServiceCreateInputSchema, ServiceUpdateInputSchema} from './ServiceSpec.js'
import {toServiceSpec} from './ServiceSpec.js'
import type {ServiceInput} from './ServiceSpec.js'
export {matchesServiceFilters, parseServiceFilters, serviceOrderValue} from './ServiceFilters.js'
export type {ServiceFilter} from './ServiceFilters.js'
export {ServiceCreateInputSchema, ServiceUpdateInputSchema} from './ServiceSpec.js'
export {createDockerLogLineDecoder, decodeDockerLogOutput} from './TaskLogDecoder.js'

type DockerServiceListOptions = import('dockerode').ServiceListOptions
type DockerServiceSpec = import('dockerode').ServiceSpec
type DockerTask = import('dockerode').Task
type DockerContainer = import('dockerode').ContainerInfo
type DockerNetworkCreateOptions = import('dockerode').NetworkCreateOptions

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

type ServiceListFilterOptions = {
    stack?: string | null
    filters?: ServiceFilter[]
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

function asServiceIdArray(serviceIds: unknown): string[] {
    if (!Array.isArray(serviceIds) || !serviceIds.length || serviceIds.some((serviceId) => typeof serviceId !== 'string' || !serviceId)) {
        throw new Error('serviceIds must be a non-empty array of service IDs')
    }
    return serviceIds
}

const docker = new Docker({socketPath: process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock'})
const agentHealthClient = createAgentHealthClient()

export async function fetchService(stack?: string | null, options: ServiceReadOptions = {}): Promise<ServiceModel[]> {
    const dockerServices = await docker.listServices(buildDockerListFilters({stack}))
    return dockerServices.map((dockerService) => mapInspectToServiceModel(dockerService, options))
}

function buildDockerListFilters({stack, filters}: ServiceListFilterOptions = {}): DockerServiceListOptions {
    const labels: string[] = []
    if (stack) labels.push(`com.docker.stack.namespace=${stack}`)
    for (const filter of filters ?? []) {
        if (filter.field === 'stack' && filter.operator === 'eq' && filter.value) labels.push(`com.docker.stack.namespace=${String(filter.value)}`)
    }
    return labels.length ? {filters: {label: labels}} : {}
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

export async function findServiceById(serviceId: string, options: ServiceReadOptions = {}): Promise<ServiceModel> {
    const inspected = await docker.getService(serviceId).inspect()
    if (!inspected) throw new Error('Service not found')
    return mapInspectToServiceModel(inspected, options)
}

function isDockerNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'statusCode' in error
        && (error as {statusCode?: unknown}).statusCode === 404
}

export async function findServiceByIdOrName(identifier: string, options: ServiceReadOptions = {}): Promise<ServiceModel> {
    try {
        return await findServiceById(identifier, options)
    } catch (error) {
        if (!isDockerNotFound(error)) throw error
        const services = await fetchService(undefined, options)
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

export async function createService(input: ServiceInput, mutationContext: ServiceMutationContext, options: ServiceReadOptions = {}): Promise<ServiceModel> {
    const validatedInput = await parseServiceInput(ServiceCreateInputSchema, input)
    const serviceSpec = toServiceSpec(validatedInput)
    await ensureServiceNetworks(serviceSpec, validatedInput.stack)
    const created = await docker.createService(serviceSpec)
    const service = await findServiceById(created.id, options)
    await registerServiceMutation('CREATE', service.id, mutationContext)
    return service
}

export async function updateService(serviceId: string, input: ServiceInput, mutationContext: ServiceMutationContext, options: ServiceReadOptions = {}): Promise<ServiceModel> {
    const validatedInput = await parseServiceInput(ServiceUpdateInputSchema, input)
    const service = docker.getService(serviceId)
    const inspected = await service.inspect()
    const currentSpec: DockerServiceSpec = inspected.Spec
    const serviceSpec = toServiceSpec(validatedInput, currentSpec)
    await ensureServiceNetworks(serviceSpec, validatedInput.stack ?? currentSpec.Labels?.['com.docker.stack.namespace'])
    await service.update({...serviceSpec, version: inspected.Version.Index})
    const updatedService = await findServiceById(serviceId, options)
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

export async function fetchTaskInspect(taskId: string, options: ServiceReadOptions = {}) {
    const inspection = await docker.getTask(taskId).inspect()
    return options.revealConfiguration ? inspection : redactTaskInspect(inspection)
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
    const runningTasks = (await fetchRawTasks(serviceIdentifier)).filter(task => getOptionalField(getRecordField(task, 'Status'), 'State') === 'running')
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
        if (!/^[+-]?\d+$/.test(rawTail.trim())) throw new Error('Tail must be an integer.')
        rawTail = Number(rawTail.trim())
    }
    if (typeof rawTail === 'number') {
        if (!Number.isInteger(rawTail)) throw new Error('Tail must be an integer.')
        if (rawTail <= 0) throw new Error('Tail must be a positive integer.')
        if (rawTail > maxTail) throw new Error(`Tail must be at most ${maxTail}.`)
        return rawTail
    }
    throw new Error('Invalid tail parameter.')
}

export type TaskLogFilters = {
    tail: number
    since: number
    timestamps: boolean
    include: string[]
    exclude: string[]
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

export async function fetchLogs(stackName: string, serviceName: string, lines = 30, search?: string): Promise<string[] | null> {
    const tasks = await fetchTasks(`${stackName}_${serviceName}`)
    const taskId = tasks.find((task) => task.state === 'running')?.id
    if (!taskId) return null

    const logs = await fetchTaskLogs(taskId, lines)
    return search ? logs.filter(line => line.toLowerCase().includes(search.toLowerCase())) : logs
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
    } catch (error) {
        if (!isDockerNotFound(error)) throw error
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
        if (node.ID === localNodeId || node.Status?.State === 'down') continue
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

function folderHostPath(folder: FolderInput): string {
    return typeof folder === 'string' ? folder : folder.hostPath ?? folder.path!
}

export async function createFolders(folders: unknown): Promise<{nodes: number; success: number} | string> {
    const validatedFolders = await parseServiceInput(FolderInputsSchema, folders)

    const dockerInfo = await docker.info()
    const localNodeId = getOptionalField(getRecordField(dockerInfo, 'Swarm'), 'NodeID')
    const nodes = await fetchNodes()
    const outcomes = await Promise.allSettled(nodes.map(async (node) => {
        if (node.id === localNodeId) {
            await Promise.all(validatedFolders.map((folder) => createHostFolder(folderHostPath(folder))))
        } else {
            if (!agentHealthClient || !node.id) throw new Error(`No agent is available for node ${node.id}`)
            await agentHealthClient.createFolders(node.id, validatedFolders)
        }
    }))

    const success = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
    return success ? {nodes: nodes.length, success} : 'The needed directories are not mounted; please contact your infrastructure team!'
}

export async function createFiles(files: unknown): Promise<{message: string}> {
    const validatedFiles = await parseServiceInput(FileInputsSchema, files)

    const dockerInfo = await docker.info()
    const localNodeId = getOptionalField(getRecordField(dockerInfo, 'Swarm'), 'NodeID')
    const nodes = await fetchNodes()

    await Promise.all(nodes.map(async (node) => {
        if (node.id === localNodeId) {
            await Promise.all(validatedFiles.map((file) => createHostFile(file.hostPath, file.fileName, file.fileContent)))
        } else {
            if (!agentHealthClient || !node.id) throw new Error(`No agent is available for node ${node.id}`)
            await agentHealthClient.createFiles(node.id, validatedFiles)
        }
    }))

    return {message: 'File successfully created!'}
}
