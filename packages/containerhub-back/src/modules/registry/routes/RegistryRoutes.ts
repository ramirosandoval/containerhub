import type {FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../../services/permissions/DockerPermissions.js'
import {requirePermission} from '../../services/routes/requirePermission.js'
import {fetchImages, fetchImageTags} from '../services/RegistryService.js'

const protectedRoute = {
    preHandler: (request: any) => requirePermission(request, DockerPermissions.View),
    schema: {security: [{bearerAuth: []}]}
}

const listRegistryImagesSchema = {
    summary: 'List registry images',
    tags: ['Registry'],
    security: [{bearerAuth: []}],
    querystring: {type: 'object', properties: {rows: {type: 'string'}}},
    response: {'200': {description: 'Registry images'}}
} as const

export const RegistryRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/api/registry/image', {...protectedRoute, schema: listRegistryImagesSchema}, async (request: any) => fetchImages(request.query?.rows ?? '1000'))
    fastify.get('/api/registry/image/tags', protectedRoute, async (request: any) => fetchImageTags(request.query?.name))
}
