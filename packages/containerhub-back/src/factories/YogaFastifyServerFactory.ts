import type {FastifySchema, RouteOptions} from 'fastify'
import {jwtMiddleware, rbacMiddleware, UserRoutes, RoleRoutes, TenantRoutes} from '@drax/identity-back'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import websocket from '@fastify/websocket'
import {ServiceRoutes} from '../modules/services/routes/ServiceRoutes.js'
import {TerminalRoutes} from '../modules/services/routes/TerminalRoutes.js'
import {GitLabRoutes} from '../modules/gitlab/routes/GitLabRoutes.js'
import {RegistryRoutes} from '../modules/registry/routes/RegistryRoutes.js'
import {typeDefs, resolvers} from './GraphQLSchema.js'
import YogaFastifyServer from '../servers/YogaFastifyServer.js'

type OpenApiRouteSchema = FastifySchema & {
    params?: unknown
    response?: Record<string, unknown>
    security?: Array<{bearerAuth: string[]}>
    summary?: string
    tags?: string[]
}

type SwaggerTransformInput = {
    schema: OpenApiRouteSchema
    url: string
    route: RouteOptions
}

function localRouteTag(url: string): string | undefined {
    if (url.startsWith('/api/services') || url.startsWith('/api/docker')) return 'Services'
    if (url.startsWith('/api/registry')) return 'Registry'
    if (url.startsWith('/api/gitlab')) return 'GitLab'
    return undefined
}

function setWebSocketAuthorizationHeader(request: {headers: Record<string, string | string[] | undefined>}): void {
    const upgradeHeader = request.headers.upgrade
    if ((Array.isArray(upgradeHeader) ? upgradeHeader[0] : upgradeHeader)?.toLowerCase() !== 'websocket' || request.headers.authorization) return
    const requestedProtocols = request.headers['sec-websocket-protocol']
    const bearerProtocol = (Array.isArray(requestedProtocols) ? requestedProtocols.join(',') : requestedProtocols ?? '')
        .split(',').map((protocol) => protocol.trim()).find((protocol) => protocol.startsWith('bearer.'))
    if (bearerProtocol) request.headers.authorization = `Bearer ${bearerProtocol.slice('bearer.'.length)}`
}

function isTerminalWebSocketRequest(request: {headers: Record<string, string | string[] | undefined>; url: string}): boolean {
    const upgradeHeader = request.headers.upgrade
    const isWebSocketUpgrade = (Array.isArray(upgradeHeader) ? upgradeHeader[0] : upgradeHeader)?.toLowerCase() === 'websocket'
    return isWebSocketUpgrade && request.url.split('?')[0] === '/api/docker/terminal'
}

export default function YogaFastifyServerFactory() {
    const server = new YogaFastifyServer(typeDefs, resolvers)
    server.fastify.register(swagger, {
        openapi: {
            openapi: '3.0.3',
            info: {title: 'ContainerHub API', version: '0.1.0'},
            components: {
                securitySchemes: {
                    bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}
                }
            }
        },
        transform: ({schema, url, route}: SwaggerTransformInput) => {
            const tag = localRouteTag(url)
            if (!tag) return {schema, url}

            const parameterNames = [...url.matchAll(/:([^/]+)/g)].map((match) => match[1])
            const schemaWithPathParameters = parameterNames.length && !schema.params
                ? {
                    ...schema,
                    params: {
                        type: 'object',
                        required: parameterNames,
                        properties: Object.fromEntries(parameterNames.map((parameterName) => [parameterName, {type: 'string'}]))
                    }
                }
                : schema
            return {
                url,
                schema: {
                    ...schemaWithPathParameters,
                    tags: schema.tags ?? [tag],
                    summary: schema.summary ?? `${String(route.method)} ${url}`,
                    security: schema.security ?? [{bearerAuth: []}],
                    response: schema.response ?? {'200': {description: 'Successful response'}}
                }
            }
        }
    })
    server.fastify.register(swaggerUi, {
        routePrefix: '/documentation',
        uiConfig: {docExpansion: 'list', deepLinking: false}
    })
    server.fastify.register(websocket)
    server.fastify.addHook('onRequest', ((request: any, _reply: any, done: () => void) => {
        setWebSocketAuthorizationHeader(request)
        done()
    }) as any)
    server.fastify.decorateRequest('authUser', null)
    server.fastify.addHook('onRequest', ((request: any, reply: any, done: () => void) => {
        if (isTerminalWebSocketRequest(request)) return done()
        return (jwtMiddleware as any)(request, reply, done)
    }) as any)
    server.fastify.addHook('onRequest', ((request: any, reply: any, done: () => void) => {
        if (isTerminalWebSocketRequest(request)) return done()
        return (rbacMiddleware as any)(request, reply, done)
    }) as any)
    server.fastify.register(UserRoutes as any)
    server.fastify.register(RoleRoutes as any)
    server.fastify.register(TenantRoutes as any)
    server.fastify.register(ServiceRoutes as any)
    server.fastify.register(TerminalRoutes as any)
    server.fastify.register(GitLabRoutes as any)
    server.fastify.register(RegistryRoutes as any)
    return server
}
