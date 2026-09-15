import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify'
import {CommonController} from '@drax/common-back'
import {z} from 'zod'
import { requirePermission } from '../../services/routes/requirePermission.js'
import {SettingsService, SettingsUpdateSchema} from '../services/SettingsService.js'

const controller = new CommonController()

export async function SettingsRoutes(fastify: FastifyInstance) {
    fastify.get('/api/settings', {
        preHandler: (request: any) => requirePermission(request, 'SETTINGS_SHOW'),
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
            const settings = await SettingsService.getSettings()
            reply.status(200).send(settings)
        }
    })

    fastify.put('/api/settings', {
        preHandler: (request: any) => requirePermission(request, 'SETTINGS_UPDATE'),
        schema: {body: z.toJSONSchema(SettingsUpdateSchema, {target: 'openapi-3.0'})},
        handler: async (request: FastifyRequest<{Body: unknown}>, reply: FastifyReply) => {
            try {
                const settings = await SettingsService.updateSettings(request.body)
                reply.status(200).send(settings)
            } catch (error) {
                controller.handleError(error, reply)
            }
        }
    })
}
