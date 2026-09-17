import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import Docker from 'dockerode'
import Fastify from 'fastify'
import type {FastifyInstance} from 'fastify'
import {terminalRoutes} from './terminalRoutes.js'

export type AgentEnvironment = Record<string, string | undefined>

type AgentDocker = Pick<Docker, 'ping' | 'listContainers' | 'getContainer'>
type AgentServerOptions = {
    docker: AgentDocker
    nodeId: string
    https?: {ca: Buffer; cert: Buffer; key: Buffer; requestCert: true; rejectUnauthorized: true}
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
    return {
        port,
        nodeId: environment.NODE_ID!,
        ...(secure ? {
            caFile: environment.CONTAINERHUB_AGENT_CA_FILE!,
            certificateFile: environment.CONTAINERHUB_AGENT_SERVER_CERT_FILE!,
            keyFile: environment.CONTAINERHUB_AGENT_SERVER_KEY_FILE!
        } : {}),
        dockerDataPath: environment.DOCKER_DATA_PATH?.trim() || '/var/lib/containerhub'
    }
}

export function buildAgentServer({docker, nodeId, https}: AgentServerOptions) {
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

    const safeDataPath = (hostPath: string, fileName?: string): string => {
        const root = https ? (server as any).dockerDataPath ?? '/var/lib/containerhub' : '/var/lib/containerhub'
        const target = path.resolve(root, hostPath.replace(/^[/\\]+/, ''), fileName ?? '')
        if (target !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
            throw new Error('Invalid host path')
        }
        return target
    }

    server.post('/folders', async (request: any) => {
        if (!Array.isArray(request.body)) throw new Error('Request body must be an array')
        await Promise.all(request.body.map((folder: any) => mkdir(safeDataPath(folder.hostPath ?? folder.path ?? ''), {recursive: true})))
        return {success: true}
    })

    server.post('/files', async (request: any) => {
        if (!Array.isArray(request.body)) throw new Error('Request body must be an array')
        await Promise.all(request.body.map(async (file: any) => {
            if (!file.fileName || file.fileContent === undefined || !file.hostPath) {
                throw new Error('fileName, fileContent and hostPath are required')
            }
            const filePath = safeDataPath(file.hostPath, file.fileName)
            await mkdir(path.dirname(filePath), {recursive: true})
            await writeFile(filePath, file.fileContent)
        }))
        return {message: 'File successfully created!'}
    })

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
        https
    });
    (server as any).dockerDataPath = config.dockerDataPath;
    await server.listen({host: '0.0.0.0', port: config.port})
}
