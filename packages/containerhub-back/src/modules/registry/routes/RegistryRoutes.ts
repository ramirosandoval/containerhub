import type {FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../../services/permissions/DockerPermissions.js'
import {requirePermission} from '../../services/routes/requirePermission.js'
import {fetchImageDetails, fetchImages, fetchImageTags} from '../services/RegistryService.js'

const protectedRoute = {
    preHandler: (request: any) => requirePermission(request, DockerPermissions.View),
    schema: {security: [{bearerAuth: []}]}
}

function requiredQueryString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value) throw Object.assign(new Error(`${field} is required`), {statusCode: 400})
    return value
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
    fastify.get('/api/registry/image/tags', protectedRoute, async (request: any) => fetchImageTags(requiredQueryString(request.query?.name, 'name')))
    fastify.get('/api/registry/image/details', protectedRoute, async (request: any) => fetchImageDetails(requiredQueryString(request.query?.name, 'name'), requiredQueryString(request.query?.reference, 'reference')))
}
