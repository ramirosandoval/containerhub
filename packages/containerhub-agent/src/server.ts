import {readFile} from 'node:fs/promises'
import path from 'node:path'
import Docker from 'dockerode'
import Fastify from 'fastify'
import type {FastifyInstance} from 'fastify'
import {registerAgentProvisioningRoutes} from './agentProvisioningRoutes.js'
import {terminalRoutes} from './terminalRoutes.js'

export type AgentEnvironment = Record<string, string | undefined>

type AgentDocker = Pick<Docker, 'ping' | 'listContainers' | 'getContainer'>
type AgentServerOptions = {
    docker: AgentDocker
    nodeId: string
    https?: {ca: Buffer; cert: Buffer; key: Buffer; requestCert: true; rejectUnauthorized: true}
    dockerDataPath?: string
    hostVolumeRoots?: string[]
}

function configuredHostVolumeRoots(environment: AgentEnvironment, dockerDataPath: string): string[] {
    const configuredRoots = environment.CONTAINERHUB_HOST_VOLUME_ROOTS
        ?.split(',')
        .map((root) => root.trim())
        .filter(Boolean)
    const roots = configuredRoots?.length ? configuredRoots : [dockerDataPath]
    if (!roots.length || roots.some((root) => !path.isAbsolute(root))) {
        throw new Error('CONTAINERHUB_HOST_VOLUME_ROOTS must contain absolute paths')
    }
    return [...new Set(roots.map((root) => path.resolve(root)))]
}

export function readAgentServerConfig(environment: AgentEnvironment) {
    const fileVariables = [
        'CONTAINERHUB_AGENT_CA_FILE',
        'CONTAINERHUB_AGENT_SERVER_CERT_FILE',
        'CONTAINERHUB_AGENT_SERVER_KEY_FILE'
    ] as const
    if (!environment.NODE_ID?.trim()) throw new Error('NODE_ID is required')
    const secure = fileVariables.some((variable) => environment[variable]?.trim())
    if (secure) for (const variable of fileVariables) if (!environment[variable]?.trim()) throw new Error(`${variable} is required when agent mTLS is configured`)
    const port = Number(environment.CONTAINERHUB_AGENT_PORT ?? 9997)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('CONTAINERHUB_AGENT_PORT must be a valid TCP port')
    const dockerDataPath = environment.DOCKER_DATA_PATH?.trim() || '/var/lib/containerhub'
    return {
        port,
        nodeId: environment.NODE_ID!,
        ...(secure ? {
            caFile: environment.CONTAINERHUB_AGENT_CA_FILE!,
            certificateFile: environment.CONTAINERHUB_AGENT_SERVER_CERT_FILE!,
            keyFile: environment.CONTAINERHUB_AGENT_SERVER_KEY_FILE!
        } : {}),
        dockerDataPath,
        hostVolumeRoots: configuredHostVolumeRoots(environment, dockerDataPath)
    }
}

export function buildAgentServer({
    docker, nodeId, https, dockerDataPath = '/var/lib/containerhub', hostVolumeRoots = [dockerDataPath]
}: AgentServerOptions) {
    const server = (https ? Fastify({https}) : Fastify()) as FastifyInstance
    server.register(terminalRoutes, {docker, nodeId, secure: Boolean(https)})
    server.get('/health', async () => {
        await docker.ping()
        return {ok: true, nodeId}
    })
    server.get('/containers/running', async () => ({
        nodeId,
        containers: await docker.listContainers({all: false})
    }))
    server.get<{Params: {containerId: string}}>('/containers/:containerId/stats', {
        schema: {params: {
            type: 'object', required: ['containerId'],
            properties: {containerId: {type: 'string', pattern: '^[a-f0-9]{64}$'}}
        }}
    }, async (request) => ({
        nodeId,
        stats: await docker.getContainer(request.params.containerId).stats({stream: false})
    }))

    registerAgentProvisioningRoutes(server, dockerDataPath, hostVolumeRoots)

    return server
}

export async function startAgent(environment: AgentEnvironment = process.env): Promise<void> {
    const config = readAgentServerConfig(environment)
    let https: AgentServerOptions['https']
    if (config.caFile && config.certificateFile && config.keyFile) {
        const [ca, cert, key] = await Promise.all([
            readFile(config.caFile), readFile(config.certificateFile), readFile(config.keyFile)
        ])
        https = {ca, cert, key, requestCert: true, rejectUnauthorized: true}
    }
    const server = buildAgentServer({
        docker: new Docker({socketPath: environment.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock'}),
        nodeId: config.nodeId,
        https,
        dockerDataPath: config.dockerDataPath,
        hostVolumeRoots: config.hostVolumeRoots
    });
    await server.listen({host: '0.0.0.0', port: config.port})
}
