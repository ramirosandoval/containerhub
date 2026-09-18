import type {FastifyInstance} from 'fastify'
import {CommonController, ZodErrorToValidationError} from '@drax/common-back'
import {z} from 'zod'
import {requirePermission} from '../../services/routes/requirePermission.js'
import {DockerPermissions} from '../../services/permissions/DockerPermissions.js'
import {TaskMonitorizationFactory} from '../factory/TaskMonitorizationFactory.js'

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    orderBy: z.enum(['_id', 'date', 'status', 'taskId', 'nodeName', 'serviceName', 'modifiedBy']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().default(''),
    filters: z.preprocess(value => {
        if (value === undefined || value === '') return []
        if (typeof value !== 'string') return value
        try { return JSON.parse(value) } catch { return value }
    }, z.array(z.object({
        field: z.enum(['_id', 'date', 'status', 'taskId', 'nodeName', 'serviceName', 'modifiedBy']),
        operator: z.enum(['eq', 'like', 'empty', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'nin']),
        value: z.union([
            z.string(), z.number(), z.boolean(), z.null(),
            z.array(z.union([z.string(), z.number(), z.boolean()])),
        ]),
    }).strict())).default([]),
}).strict()
const controller = new CommonController()

export async function TaskMonitorizationRoutes(app: FastifyInstance) {
    app.get(
        '/api/task-monitorizations',
        {
            preHandler: (request) => requirePermission(request, DockerPermissions.View)
        },
        async (request, reply) => {
            try {
                const options = querySchema.parse(request.query)
                const repository = TaskMonitorizationFactory.getRepository()
                const result = await repository.paginate(options)
                return {...result, totalPages: Math.ceil(result.total / result.limit)}
            } catch (error) {
                return controller.handleError(error instanceof z.ZodError ? ZodErrorToValidationError(error, request.query) : error, reply)
            }
        }
    )
}
