import type {FastifySchema, RouteOptions} from 'fastify'
import {apiKeyMiddleware, jwtMiddleware, rbacMiddleware, UserRoutes, RoleRoutes, TenantRoutes, UserSessionRoutes, UserLoginFailRoutes, UserApiKeyRoutes} from '@drax/identity-back'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import websocket from '@fastify/websocket'
import {ServiceRoutes} from '../modules/services/routes/ServiceRoutes.js'
import {SettingsRoutes} from '../modules/settings/routes/SettingsRoutes.js'
import {TerminalRoutes} from '../modules/services/routes/TerminalRoutes.js'
import {GitLabRoutes} from '../modules/gitlab/routes/GitLabRoutes.js'
import {RegistryRoutes} from '../modules/registry/routes/RegistryRoutes.js'
import {MonitoringRoutes} from '../modules/monitoring/routes/MonitoringRoutes.js'
import {TaskMonitorizationRoutes} from '../modules/monitoring/routes/TaskMonitorizationRoutes.js'
import {MediaRoutes} from '@drax/media-back'
import multipart from '@fastify/multipart'
import {typeDefs, resolvers} from './GraphQLSchema.js'
import YogaFastifyServer from '../servers/YogaFastifyServer.js'
import {promoteBearerApiKey} from './AuthenticationHeaders.js'

type OpenApiRouteSchema = FastifySchema & {
    params?: unknown
    response?: Record<string, unknown>
    security?: Array<{bearerAuth?: string[]; apiKeyAuth?: string[]}>
    summary?: string
    tags?: string[]
}

type SwaggerTransformInput = {
    schema?: OpenApiRouteSchema
    url: string
    route: RouteOptions
}

const dualAuthenticationSecurity = [{bearerAuth: []}, {apiKeyAuth: []}]

function localRouteTag(url: string): string | undefined {
    if (url.startsWith('/api/services') || url.startsWith('/api/docker')) return 'Services'
    if (url.startsWith('/api/registry')) return 'Registry'
    if (url.startsWith('/api/gitlab')) return 'GitLab'
    if (url.startsWith('/api/monitoring')) return 'Monitoring'
    if (url.startsWith('/api/settings')) return 'Settings'
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
                    bearerAuth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'},
                    apiKeyAuth: {type: 'apiKey', in: 'header', name: 'X-API-Key'}
                }
            }
        },
        transform: ({schema, url, route}: SwaggerTransformInput) => {
            const tag = localRouteTag(url)
            const routeSchema = schema ?? {}
            if (!tag) return {schema: routeSchema, url}

            const parameterNames = [...url.matchAll(/:([^/]+)/g)].map((match) => match[1])
            const schemaWithPathParameters = parameterNames.length && !routeSchema.params
                ? {
                    ...routeSchema,
                    params: {
                        type: 'object',
                        required: parameterNames,
                        properties: Object.fromEntries(parameterNames.map((parameterName) => [parameterName, {type: 'string'}]))
                    }
                }
                : routeSchema
            const security = routeSchema.security?.some((requirement) => requirement.bearerAuth)
                ? dualAuthenticationSecurity
                : routeSchema.security ?? dualAuthenticationSecurity
            return {
                url,
                schema: {
                    ...schemaWithPathParameters,
                    tags: routeSchema.tags ?? [tag],
                    summary: routeSchema.summary ?? `${String(route.method)} ${url}`,
                    security,
                    response: routeSchema.response ?? {'200': {description: 'Successful response'}}
                }
            }
        }
    })
    server.fastify.register(swaggerUi, {
        routePrefix: '/documentation',
        uiConfig: {docExpansion: 'list', deepLinking: false}
    })
    server.fastify.register(multipart)
    server.fastify.register(websocket)
    server.fastify.addHook('onRequest', ((request: any, _reply: any, done: () => void) => {
        setWebSocketAuthorizationHeader(request)
        promoteBearerApiKey(request.headers)
        done()
    }) as any)
    server.fastify.decorateRequest('authUser', null)
    server.fastify.addHook('onRequest', ((request: any, reply: any, done: () => void) => {
        if (isTerminalWebSocketRequest(request)) return done()
        return (jwtMiddleware as any)(request, reply, done)
    }) as any)
    server.fastify.addHook('onRequest', ((request: any, reply: any, done: () => void) => {
        if (isTerminalWebSocketRequest(request)) return done()
        return (apiKeyMiddleware as any)(request, reply, done)
    }) as any)
    server.fastify.addHook('onRequest', ((request: any, reply: any, done: () => void) => {
        if (isTerminalWebSocketRequest(request)) return done()
        return (rbacMiddleware as any)(request, reply, done)
    }) as any)
    server.fastify.register(UserRoutes as any)
    server.fastify.register(RoleRoutes as any)
    server.fastify.register(TenantRoutes as any)
    server.fastify.register(UserSessionRoutes as any)
    server.fastify.register(UserLoginFailRoutes as any)
    server.fastify.register(UserApiKeyRoutes as any)
    server.fastify.register(ServiceRoutes as any)
    server.fastify.register(SettingsRoutes as any)
    server.fastify.register(TerminalRoutes as any)
    server.fastify.register(GitLabRoutes as any)
    server.fastify.register(RegistryRoutes as any)
    server.fastify.register(MonitoringRoutes)
    server.fastify.register(TaskMonitorizationRoutes as any)

    server.fastify.register(MediaRoutes as any)

    return server
}
