import type {FastifyInstance, FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../permissions/DockerPermissions.js'
import {requirePermission} from './requirePermission.js'
import {parseTaskLogTail, streamTaskLogs} from '../services/ServiceService.js'
import type {ServiceFilter, TaskLogFilters} from '../services/ServiceService.js'
import {
    createFiles, createFolders, createNetwork, createService, dockerRemove, dockerRemoveMany, dockerRestart, dockerRestartMany, fetchGhostContainers,
    fetchLogs, fetchNetwork, fetchNetworks, fetchNodes, fetchService, fetchServiceStats, fetchTaskLogs, fetchTaskStats, fetchTasks,
    findServiceByIdOrName, findServiceTag, getOrCreateNetwork, paginateServices, parseServiceFilters, removeNetwork, updateNetwork,
    updateService
} from '../services/ServiceService.js'

function protectedRoute(permission: string) {
    return {
        preHandler: (request: any) => requirePermission(request, permission),
        schema: {security: [{bearerAuth: []}]}
    }
}

type TaskLogSocket = {
    close(code?: number): void
    on(event: 'close', listener: () => void): void
    once(event: 'close', listener: () => void): void
    on(event: 'message', listener: (payload: Buffer) => void): void
    send(message: string): void
}

function taskLogFilters(payload: Buffer): TaskLogFilters {
    const request = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const stringArray = (value: unknown): string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : []
    const since = Number(request.since ?? 0)
    return {
        tail: parseTaskLogTail(request.tail ?? 30),
        since: Number.isInteger(since) && since >= 0 ? since : 0,
        timestamps: request.timestamps === true,
        include: stringArray(request.include),
        exclude: stringArray(request.exclude)
    }
}

const paginatedServicesSchema = {
    summary: 'List services with pagination',
    tags: ['Services'],
    security: [{bearerAuth: []}],
    querystring: {
        type: 'object',
        properties: {
            page: {type: 'integer', minimum: 1},
            limit: {type: 'integer', minimum: 1, maximum: 200},
            orderBy: {type: 'string'},
            order: {type: 'string', enum: ['asc', 'desc']},
            search: {type: 'string'},
            stack: {type: 'string'},
            filters: {type: 'string', description: 'JSON-encoded filter array'}
        }
    },
    response: {'200': {description: 'Paginated services'}}
} as const

export const ServiceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.get('/api/services/health', protectedRoute(DockerPermissions.View), async () => ({ok: true, module: 'services'}))
    fastify.get('/api/services', protectedRoute(DockerPermissions.View), async () => fetchService())
    fastify.get('/api/services/paginate', {
        ...protectedRoute(DockerPermissions.View),
        schema: paginatedServicesSchema
    }, async (request: any) => {
        const page = Math.max(1, Number(request.query?.page ?? 1))
        const limit = Math.min(200, Math.max(1, Number(request.query?.limit ?? 25)))
        const filters: ServiceFilter[] = parseServiceFilters(request.query?.filters)
        return paginateServices({
            page, limit,
            orderBy: request.query?.orderBy as string | undefined,
            order: request.query?.order as 'asc' | 'desc' | undefined,
            search: request.query?.search as string | undefined,
            stack: (request.query?.stack as string | null | undefined) ?? null,
            filters
        })
    })

    fastify.get('/api/docker/service', protectedRoute(DockerPermissions.View), async () => fetchService())
    fastify.post('/api/docker/service', protectedRoute(DockerPermissions.Create), async (request: any) => createService(request.body))
    fastify.put('/api/docker/service/:service', protectedRoute(DockerPermissions.Update), async (request: any) => updateService(request.params.service, request.body))
    fastify.post('/api/docker/service/restart/:service', protectedRoute(DockerPermissions.Restart), async (request: any) => dockerRestart(request.params.service))
    fastify.post('/api/docker/service/restart', protectedRoute(DockerPermissions.Restart), async (request: any) => dockerRestartMany(request.body?.serviceIds))
    fastify.delete('/api/docker/service/:service', protectedRoute(DockerPermissions.Remove), async (request: any) => dockerRemove(request.params.service))
    fastify.post('/api/docker/service/remove', protectedRoute(DockerPermissions.Remove), async (request: any) => dockerRemoveMany(request.body?.serviceIds))
    fastify.get('/api/docker/service/id/:serviceId/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchServiceStats(request.params.serviceId))
    fastify.get('/api/docker/service/:serviceName/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchServiceStats(request.params.serviceName))
    fastify.get('/api/docker/service/:name/tag', protectedRoute(DockerPermissions.View), async (request: any) => findServiceTag(request.params.name))
    fastify.get('/api/docker/service/:serviceIdentifier', protectedRoute(DockerPermissions.View), async (request: any) => findServiceByIdOrName(request.params.serviceIdentifier))

    fastify.get('/api/docker/task/:taskid/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchTaskStats(request.params.taskid))
    fastify.get('/api/docker/task/:taskId/logs', protectedRoute(DockerPermissions.Logs), async (request: any) => {
        const tail = parseTaskLogTail(request.query?.tail ?? 30)
        return fetchTaskLogs(request.params.taskId, tail)
    })
    ;(fastify.get as any)('/api/docker/task/:taskId/logs/stream', {
        ...protectedRoute(DockerPermissions.Logs),
        websocket: true
    }, (socket: TaskLogSocket, request: any) => {
        let stopStreaming: (() => void) | undefined
        socket.on('message', async (payload) => {
            if (stopStreaming) return
            try {
                stopStreaming = await streamTaskLogs(request.params.taskId, taskLogFilters(payload), (logLine) => socket.send(`${logLine}\n`), () => socket.close())
            } catch {
                socket.close(1011)
            }
        })
        socket.once('close', () => stopStreaming?.())
    })
    fastify.get('/api/docker/tasks/:serviceIdentifier', protectedRoute(DockerPermissions.View), async (request: any) => fetchTasks(request.params.serviceIdentifier))
    fastify.get('/api/docker/logs/:stackName/:serviceName', protectedRoute(DockerPermissions.Logs), async (request: any) => {
        const lines = parseTaskLogTail(request.query?.lines ?? 30)
        return fetchLogs(request.params.stackName, request.params.serviceName, lines)
    })

    fastify.get('/api/docker/nodes', protectedRoute(DockerPermissions.NodesFetch), async () => fetchNodes())
    fastify.get('/api/docker/ghostContainers', protectedRoute(DockerPermissions.View), async () => fetchGhostContainers())

    fastify.get('/api/docker/network', protectedRoute(DockerPermissions.NetworkView), async () => fetchNetworks())
    fastify.get('/api/docker/network/getOrCreate/:network', {
        schema: {security: [{bearerAuth: []}]},
        preHandler: async (request: any) => {
            await requirePermission(request, DockerPermissions.NetworkView)
            await requirePermission(request, DockerPermissions.NetworkCreate)
        }
    }, async (request: any) => getOrCreateNetwork(request.params.network))
    fastify.get('/api/docker/network/:network', protectedRoute(DockerPermissions.NetworkView), async (request: any) => fetchNetwork(request.params.network))
    fastify.post('/api/docker/network', protectedRoute(DockerPermissions.NetworkCreate), async (request: any) => createNetwork(request.body))
    fastify.put('/api/docker/network/:network', protectedRoute(DockerPermissions.NetworkUpdate), async (request: any) => updateNetwork(request.params.network, request.body))
    fastify.delete('/api/docker/network/:network', protectedRoute(DockerPermissions.NetworkRemove), async (request: any) => removeNetwork(request.params.network))
    fastify.post('/api/docker/folders', protectedRoute(DockerPermissions.Update), async (request: any) => createFolders(request.body))
    fastify.post('/api/docker/files', protectedRoute(DockerPermissions.Update), async (request: any) => createFiles(request.body))
}

export default ServiceRoutes
