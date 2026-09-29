import type {FastifyInstance, FastifyPluginAsync} from 'fastify'
import {CommonController, NotFoundError, ZodErrorToValidationError} from '@drax/common-back'
import {z} from 'zod'
import {DockerPermissions} from '../permissions/DockerPermissions.js'
import {requirePermission} from './requirePermission.js'
import {parseTaskLogTail, streamTaskLogs} from '../services/ServiceService.js'
import {SettingsService} from '../../settings/services/SettingsService.js'
import type {TaskLogFilters} from '../services/ServiceService.js'
import {registerNetworkMutation, serviceMutationContext} from '../services/ServiceMutationAudit.js'
import {
    createFiles, createFolders, createNetwork, createService, dockerRemove, dockerRemoveMany, dockerRestart, dockerRestartMany, fetchGhostContainers,
    fetchClusterSummary, fetchImageStatus,
    fetchNodeAndTasks,
    fetchDockerVersion, fetchLogs, fetchNetwork, fetchNetworks, fetchNodes, fetchService, fetchServiceStats, fetchTaskInspect, fetchTaskLogs, fetchTaskStats, fetchTasks,
    findServiceByIdOrName, findServiceTag, getOrCreateNetwork, removeNetwork,
    ServiceCreateInputSchema, ServiceUpdateInputSchema, updateNetwork, updateService
} from '../services/ServiceService.js'

const controller = new CommonController()

function serviceReadOptions(request: any) {
    return {
        revealConfiguration: request.rbac?.hasPermission?.(DockerPermissions.ConfigurationView) === true
    }
}

function protectedRoute(permission: string, schema: Record<string, unknown> = {}) {
    return {
        preHandler: (request: any) => requirePermission(request, permission),
        schema: {security: [{bearerAuth: []}], ...schema}
    }
}

type TaskLogSocket = {
    close(code?: number): void
    on(event: 'close', listener: () => void): void
    once(event: 'close', listener: () => void): void
    on(event: 'message', listener: (payload: Buffer) => void): void
    send(message: string): void
}

async function taskLogFilters(payload: Buffer): Promise<TaskLogFilters> {
    const request = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const stringArray = (value: unknown): string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : []
    const since = Number(request.since ?? 0)
    // TODO: implement caching strategy for application settings
    const settings = await SettingsService.getSettings()
    return {
        tail: parseTaskLogTail(request.tail ?? 30, settings.maxLogsLines),
        since: Number.isInteger(since) && since >= 0 ? since : 0,
        timestamps: request.timestamps === true,
        include: stringArray(request.include),
        exclude: stringArray(request.exclude)
    }
}

export const ServiceRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.get('/api/services/health', protectedRoute(DockerPermissions.View), async () => ({ok: true, module: 'services'}))
    fastify.get('/api/docker/service', protectedRoute(DockerPermissions.View), async (request: any) => fetchService(undefined, serviceReadOptions(request)))
    fastify.post('/api/docker/service', protectedRoute(DockerPermissions.Create, {body: z.toJSONSchema(ServiceCreateInputSchema, {target: 'openapi-3.0'})}), async (request: any, reply) => {
        try {
            const parsed = await ServiceCreateInputSchema.safeParseAsync(request.body)
            if (!parsed.success) throw ZodErrorToValidationError(parsed.error, request.body)
            const input = parsed.data
            const mutation = serviceMutationContext(request)
            const options = serviceReadOptions(request)
            const findExact = async () => (await fetchService()).find(service => service.name === input.name)
            const existing = await findExact()
            if (existing) {
                await requirePermission(request, DockerPermissions.Update)
                return await updateService(existing.id, input, mutation, options)
            }
            try {
                return await createService(input, mutation, options)
            } catch (error) {
                if (typeof error !== 'object' || error === null || !('statusCode' in error) || error.statusCode !== 409) throw error
                const raced = await findExact()
                if (!raced) throw error
                await requirePermission(request, DockerPermissions.Update)
                return await updateService(raced.id, input, mutation, options)
            }
        } catch (error) {
            if (error && typeof error === 'object' && 'statusCode' in error) throw error
            return controller.handleError(error, reply)
        }
    })
    fastify.put('/api/docker/service/:service', protectedRoute(DockerPermissions.Update, {body: z.toJSONSchema(ServiceUpdateInputSchema, {target: 'openapi-3.0'})}), async (request: any, reply) => {
        try {
            return await updateService(request.params.service, request.body, serviceMutationContext(request), serviceReadOptions(request))
        } catch (error) {
            if (error && typeof error === 'object' && 'statusCode' in error) throw error
            return controller.handleError(error, reply)
        }
    })
    fastify.post('/api/docker/service/restart/:service', protectedRoute(DockerPermissions.Restart), async (request: any) => dockerRestart(request.params.service, serviceMutationContext(request)))
    fastify.post('/api/docker/service/restart', protectedRoute(DockerPermissions.Restart), async (request: any) => dockerRestartMany(request.body?.serviceIds, serviceMutationContext(request)))
    fastify.delete('/api/docker/service/:service', protectedRoute(DockerPermissions.Remove), async (request: any) => (await dockerRemove(request.params.service, serviceMutationContext(request))).message)
    fastify.post('/api/docker/service/remove', protectedRoute(DockerPermissions.Remove), async (request: any) => dockerRemoveMany(request.body?.serviceIds, serviceMutationContext(request)))
    fastify.get('/api/docker/service/id/:serviceId/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchServiceStats(request.params.serviceId))
    fastify.get('/api/docker/service/:serviceName/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchServiceStats(request.params.serviceName))
    fastify.get('/api/docker/service/:name/tag', protectedRoute(DockerPermissions.View), async (request: any) => findServiceTag(request.params.name))
    fastify.get('/api/docker/service/status/:image', protectedRoute(DockerPermissions.View), async (request: any) => fetchImageStatus(request.params.image))
    fastify.get('/api/docker/service/:serviceIdentifier', protectedRoute(DockerPermissions.View), async (request: any) => {
        const identifier: string = request.params.serviceIdentifier
        try {
            return await findServiceByIdOrName(identifier, serviceReadOptions(request))
        } catch (error) {
            if (!(error instanceof NotFoundError) || /^[a-z0-9]{25}$/.test(identifier)) throw error
            return null
        }
    })

    fastify.get<{Params: {taskId: string}}>('/api/docker/task/:taskId/inspect', {
        ...protectedRoute(DockerPermissions.View),
        schema: {
            security: [{bearerAuth: []}],
            tags: ['Services'],
            summary: 'Inspect a service task',
            params: {type: 'object', required: ['taskId'], properties: {taskId: {type: 'string', minLength: 1}}},
            response: {200: {type: 'object', additionalProperties: true, description: 'Full Docker task inspection'}}
        }
    }, async (request: any) => fetchTaskInspect(request.params.taskId, serviceReadOptions(request)))
    fastify.get('/api/docker/task/:taskid/stats', protectedRoute(DockerPermissions.View), async (request: any) => fetchTaskStats(request.params.taskid))
    fastify.get('/api/docker/task/:taskId/logs', protectedRoute(DockerPermissions.Logs), async (request: any) => {
        // TODO: implement caching strategy for application settings
        const settings = await SettingsService.getSettings()
        const tail = parseTaskLogTail(request.query?.tail ?? 30, settings.maxLogsLines)
        return fetchTaskLogs(request.params.taskId, tail)
    })
    ;(fastify.get as any)('/api/docker/task/:taskId/logs/stream', {
        ...protectedRoute(DockerPermissions.Logs),
        websocket: true
    }, (socket: TaskLogSocket, request: any) => {
        let stopStreaming: (() => void) | undefined
        let started = false
        let closed = false
        socket.on('message', async (payload) => {
            if (started || closed) return
            started = true
            try {
                stopStreaming = await streamTaskLogs(request.params.taskId, await taskLogFilters(payload), (logLine) => socket.send(`${logLine}\n`), () => socket.close())
                if (closed) stopStreaming()
            } catch {
                socket.close(1011)
            }
        })
        socket.once('close', () => { closed = true; stopStreaming?.() })
    })
    fastify.get('/api/docker/tasks/:serviceIdentifier', protectedRoute(DockerPermissions.View), async (request: any) => fetchTasks(request.params.serviceIdentifier))
    fastify.get('/api/docker/logs/config', protectedRoute(DockerPermissions.Logs), async () => ({
        maxLogsLines: (await SettingsService.getSettings()).maxLogsLines
    }))
    fastify.get('/api/docker/logs/:stackName/:serviceName', protectedRoute(DockerPermissions.Logs), async (request: any) => {
        // TODO: implement caching strategy for application settings
        const settings = await SettingsService.getSettings()
        const lines = parseTaskLogTail(request.query?.lines ?? 30, settings.maxLogsLines)
        return fetchLogs(request.params.stackName, request.params.serviceName, lines,
            typeof request.query?.search === 'string' ? request.query.search : undefined)
    })

    fastify.get('/api/docker/nodes', protectedRoute(DockerPermissions.NodesFetch), async () => fetchNodes())
    fastify.get('/api/docker/version', protectedRoute(DockerPermissions.View), async () => fetchDockerVersion())
    fastify.get('/api/docker/cluster', {
        ...protectedRoute(DockerPermissions.View),
        schema: {
            security: [{bearerAuth: []}],
            tags: ['Services'],
            summary: 'Count cluster nodes, services and all retained tasks',
            response: {200: {
                type: 'object', required: ['nodesQuantity', 'servicesQuantity', 'tasksQuantity'],
                properties: {
                    nodesQuantity: {type: 'integer', minimum: 0},
                    servicesQuantity: {type: 'integer', minimum: 0},
                    tasksQuantity: {type: 'integer', minimum: 0, description: 'All tasks returned by Docker, including retained historical tasks; not just running tasks'}
                }
            }}
        }
    }, async () => fetchClusterSummary())
    fastify.get('/api/docker/nodes-and-tasks', protectedRoute(DockerPermissions.View), async () => fetchNodeAndTasks())
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
    fastify.post('/api/docker/network', protectedRoute(DockerPermissions.NetworkCreate), async (request: any) => {
        const result = await createNetwork(request.body)
        await registerNetworkMutation('CREATE', result.id, serviceMutationContext(request))
        return result
    })
    fastify.put('/api/docker/network/:network', protectedRoute(DockerPermissions.NetworkUpdate), async (request: any) => {
        const result = await updateNetwork(request.params.network, request.body)
        await registerNetworkMutation('UPDATE', request.params.network, serviceMutationContext(request))
        return result
    })
    fastify.delete('/api/docker/network/:network', protectedRoute(DockerPermissions.NetworkRemove), async (request: any) => {
        const result = await removeNetwork(request.params.network)
        await registerNetworkMutation('DELETE', request.params.network, serviceMutationContext(request))
        return result
    })
    fastify.post('/api/docker/folders', protectedRoute(DockerPermissions.Update), async (request: any) => createFolders(request.body))
    fastify.post('/api/docker/files', protectedRoute(DockerPermissions.Update), async (request: any) => createFiles(request.body))
}

export default ServiceRoutes
