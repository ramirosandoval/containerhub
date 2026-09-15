import type {FastifyInstance} from 'fastify'
import {CommonController, ZodErrorToValidationError} from '@drax/common-back'
import {z} from 'zod'
import {requirePermission} from '../../services/routes/requirePermission.js'
import {DockerPermissions} from '../../services/permissions/DockerPermissions.js'
import {TaskMonitorizationFactory} from '../factory/TaskMonitorizationFactory.js'

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).default(20)
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
                const {page, limit} = querySchema.parse(request.query)
                const skip = (page - 1) * limit

                const repository = TaskMonitorizationFactory.getRepository()
                const [items, total] = await Promise.all([
                    repository.getPaginated(skip, limit),
                    repository.count()
                ])

                return {items, total, page, limit, totalPages: Math.ceil(total / limit)}
            } catch (error) {
                return controller.handleError(error instanceof z.ZodError ? ZodErrorToValidationError(error, request.query) : error, reply)
            }
        }
    )
}
