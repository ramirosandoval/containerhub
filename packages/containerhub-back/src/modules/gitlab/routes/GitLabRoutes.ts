import type {FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../../services/permissions/DockerPermissions.js'
import {requirePermission} from '../../services/routes/requirePermission.js'
import {fetchProjects, fetchProjectTags} from '../services/GitLabService.js'

const protectedRoute = {
    preHandler: (request: any) => requirePermission(request, DockerPermissions.View),
    schema: {security: [{bearerAuth: []}]}
}

const listGitLabProjectsSchema = {
    summary: 'List GitLab projects',
    tags: ['GitLab'],
    security: [{bearerAuth: []}],
    querystring: {type: 'object', properties: {page: {type: 'string'}, per_page: {type: 'string'}}},
    response: {'200': {description: 'GitLab projects'}}
} as const

export const GitLabRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/api/gitlab/project', {...protectedRoute, schema: listGitLabProjectsSchema}, async (request: any) => fetchProjects(request.query?.page ?? '1', request.query?.per_page ?? '10'))
    fastify.get('/api/gitlab/project/:id/tags', protectedRoute, async (request: any) => fetchProjectTags(request.params.id))
}
