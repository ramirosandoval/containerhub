import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify'
import {AbstractFastifyController} from '@drax/crud-back'
import {BadRequestError, NotFoundError, UnauthorizedError} from '@drax/common-back'
import {z} from 'zod'
import {MonitoringServiceFactory} from '../factory/MonitoringServiceFactory.js'
import {MonitoringCreateSchema} from '../schemas/MonitoringSchema.js'
import type {MonitoringService} from '../services/MonitoringService.js'
import type {MonitoringSampleService} from '../services/MonitoringSampleService.js'
import {MonitoringSampleServiceFactory} from '../factory/MonitoringSampleServiceFactory.js'
import {fetchService} from '../../services/services/ServiceService.js'

const basePath = '/api/monitoring-configurations'
const readPermission = 'DOCKER_VIEW'
const createPermission = 'DOCKER_MONITORING_CREATE'
const pausePermission = 'DOCKER_MONITORING_PAUSE'
const deletePermission = 'DOCKER_MONITORING_DELETE'
const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(10),
    orderBy: z.enum(['', 'serviceName', 'status', 'collectionInterval', 'createdAt']).default('serviceName'),
    order: z.enum(['asc', 'desc']).default('asc'), search: z.string().default(''), filters: z.literal('').optional()
}).strict()
const idSchema = z.object({id: z.string().min(1)}).strict()
const sampleQuerySchema = z.object({since: z.coerce.date().optional(), until: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(1_000).default(500)}).strict()

export async function MonitoringRoutes(fastify: FastifyInstance, options: {
    service?: MonitoringService
    sampleService?: MonitoringSampleService
    listServices?: () => Promise<{id: string; name: string; stack: string | null}[]>
}) {
    const service = options.service ?? MonitoringServiceFactory()
    const sampleService = options.sampleService ?? MonitoringSampleServiceFactory()
    const listServices = options.listServices ?? (async () => z.array(z.object({id: z.string().min(1), name: z.string().min(1), stack: z.string().nullable()})).parse(await fetchService()))
    const controller = new AbstractFastifyController(service, {Manage: createPermission, View: readPermission, Create: createPermission, Delete: deletePermission})
    function authorized(permission: string, operation: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                if (!request.rbac) throw new UnauthorizedError()
                request.rbac.assertPermission(permission)
                return await operation(request, reply)
            } catch (error) {
                return controller.handleError(error instanceof z.ZodError ? new BadRequestError(error.issues.map(issue => issue.message).join('; ')) : error, reply)
            }
        }
    }
    const metadata = {tags: ['Monitoring'], security: [{bearerAuth: []}]}
    fastify.get(basePath, {schema: {...metadata, summary: 'List stored monitoring configurations'}}, authorized(readPermission, async request => {
        const query = querySchema.parse(request.query)
        return service.paginate({...query, orderBy: query.orderBy || 'serviceName', filters: []})
    }))
    fastify.get(`${basePath}/statuses`, {schema: metadata}, authorized(readPermission, async request => {
        const {serviceIds} = z.object({serviceIds: z.string().min(1)}).strict().parse(request.query)
        const configurations = await Promise.all([...new Set(serviceIds.split(','))].map(serviceId => service.findOneBy('serviceId', serviceId)))
        return configurations.flatMap(configuration => configuration ? [{serviceId: configuration.serviceId, status: configuration.status}] : [])
    }))
    fastify.get(`${basePath}/:id`, {schema: metadata}, authorized(readPermission, async (request, reply) => {
        idSchema.parse(request.params)
        return controller.findById(request as Parameters<typeof controller.findById>[0], reply)
    }))
    fastify.get(`${basePath}/:id/samples`, {schema: {...metadata, summary: 'List persisted monitoring samples'}}, authorized(readPermission, async request => {
        const {id} = idSchema.parse(request.params)
        if (!await service.findById(id)) throw new NotFoundError(`MonitoringConfiguration ${id}`)
        const query = sampleQuerySchema.parse(request.query)
        return {items: await sampleService.history(id, query)}
    }))
    fastify.post(basePath, {schema: metadata}, authorized(createPermission, async request => {
        const configuration = MonitoringCreateSchema.parse(request.body)
        return service.createForServices(configuration, await listServices())
    }))
    for (const [action, status] of [['pause', 'paused'], ['resume', 'monitoring']] as const) {
        fastify.post(`${basePath}/:id/${action}`, {schema: metadata}, authorized(pausePermission, async request => {
            const {id} = idSchema.parse(request.params)
            z.object({}).strict().parse(request.body ?? {})
            return service.setStatus(id, status)
        }))
    }
    fastify.delete(`${basePath}/:id`, {schema: metadata}, authorized(deletePermission, async request => {
        const {id} = idSchema.parse(request.params)
        if (!await service.findById(id)) throw new NotFoundError(`MonitoringConfiguration ${id}`)
        await service.delete(id)
        await sampleService.deleteForConfiguration(id)
        return true
    }))
}
