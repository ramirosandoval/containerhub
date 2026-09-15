import {readFileSync} from 'node:fs'
import {request as httpsRequest} from 'node:https'
import {resolve4} from 'node:dns/promises'
import {z} from 'zod'

type AgentClientEnvironment = Record<string, string | undefined>
type AgentResponse = {statusCode: number; body: unknown}
type AgentRequest = (nodeAddress: string, requestPath: string, timeoutMs?: number, method?: string, body?: any) => Promise<AgentResponse>
type AgentAddressResolver = (hostname: string) => Promise<string[]>
const agentContainersSchema = z.object({
    nodeId: z.string().min(1),
    containers: z.array(z.object({
        Id: z.string().min(1), Created: z.number(), Image: z.string(),
        Status: z.string(), State: z.string(), Labels: z.record(z.string(), z.string())
    }).passthrough())
})

type AgentClientConfig = {
    host: string
    port: number
    serverName: string
    ca: Buffer | string
    cert: Buffer | string
    key: Buffer | string
}

export function readAgentClientConfig(environment: AgentClientEnvironment): AgentClientConfig | undefined {
    const fileVariables = [
        'CONTAINERHUB_AGENT_CA_FILE',
        'CONTAINERHUB_AGENT_CLIENT_CERT_FILE',
        'CONTAINERHUB_AGENT_CLIENT_KEY_FILE'
    ] as const
    if (fileVariables.every((variable) => !environment[variable]?.trim())) return undefined
    for (const variable of fileVariables) if (!environment[variable]?.trim()) throw new Error(`${variable} is required when agent health is enabled`)
    const port = Number(environment.CONTAINERHUB_AGENT_PORT ?? 9997)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('CONTAINERHUB_AGENT_PORT must be a valid TCP port')
    return {
        host: environment.CONTAINERHUB_AGENT_HOST?.trim() || 'containerhub-agent',
        port,
        serverName: environment.CONTAINERHUB_AGENT_SERVER_NAME?.trim() || 'containerhub-agent',
        ca: readFileSync(environment.CONTAINERHUB_AGENT_CA_FILE!),
        cert: readFileSync(environment.CONTAINERHUB_AGENT_CLIENT_CERT_FILE!),
        key: readFileSync(environment.CONTAINERHUB_AGENT_CLIENT_KEY_FILE!)
    }
}

function requestAgent(config: AgentClientConfig, nodeAddress: string, requestPath: string, timeoutMs = 2_000, method = 'GET', body?: any): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
        const request = httpsRequest({
            host: nodeAddress,
            port: config.port,
            path: requestPath,
            method,
            servername: config.serverName,
            ca: config.ca,
            cert: config.cert,
            key: config.key,
            signal: AbortSignal.timeout(timeoutMs),
            timeout: timeoutMs,
            headers: body ? {'Content-Type': 'application/json'} : undefined
        }, (response) => {
            const chunks: Buffer[] = []
            let responseBytes = 0
            response.once('error', reject)
            response.on('data', (chunk: Buffer) => {
                responseBytes += chunk.length
                // ponytail: cap each node response at 8 MiB; paginate if node inventories exceed it.
                if (responseBytes > 8 * 1024 * 1024) request.destroy(new Error('agent response exceeds 8 MiB'))
                else chunks.push(chunk)
            })
            response.on('end', () => {
                try {
                    resolve({statusCode: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8'))})
                } catch (error) { reject(error) }
            })
        })
        request.once('timeout', () => request.destroy(new Error('agent request timed out')))
        request.once('error', reject)
        if (body) {
            request.write(JSON.stringify(body))
        }
        request.end()
    })
}

export class AgentHealthClient {
    private readonly agentRequest: AgentRequest
    private readonly resolveAgentAddresses: AgentAddressResolver

    constructor(private readonly config: AgentClientConfig, agentRequest?: AgentRequest, addressResolver?: AgentAddressResolver) {
        this.agentRequest = agentRequest ?? ((nodeAddress, requestPath, timeoutMs, method, body) => requestAgent(this.config, nodeAddress, requestPath, timeoutMs, method, body))
        this.resolveAgentAddresses = addressResolver ?? resolve4
    }

    async resolveNodeAddress(nodeId: string): Promise<string> {
        const addresses = await this.resolveAgentAddresses(this.config.host)
        const matchingAddresses = await Promise.all(addresses.map(async (nodeAddress) => {
            try {
                const response = await this.agentRequest(nodeAddress, '/health')
                const health = z.object({ok: z.literal(true), nodeId: z.literal(nodeId)}).safeParse(response.body)
                return response.statusCode === 200 && health.success ? nodeAddress : undefined
            } catch {
                return undefined
            }
        }))
        const nodeAddress = matchingAddresses.find(Boolean)
        if (!nodeAddress) throw new Error(`Agent for node ${nodeId} is unavailable`)
        return nodeAddress
    }

    async isHealthy(nodeId: string): Promise<boolean> {
        try {
            await this.resolveNodeAddress(nodeId)
            return true
        } catch {
            return false
        }
    }

    async fetchRunningContainers(nodeId: string) {
        const nodeAddress = await this.resolveNodeAddress(nodeId)
        const response = await this.agentRequest(nodeAddress, '/containers/running')
        const inventory = agentContainersSchema.safeParse(response.body)
        if (response.statusCode !== 200 || !inventory.success || inventory.data.nodeId !== nodeId) {
            throw new Error(`Invalid agent container response for node ${nodeId}`)
        }
        return inventory.data.containers
    }

    async fetchContainerStats(nodeId: string, containerId: string) {
        const nodeAddress = await this.resolveNodeAddress(nodeId)
        // Docker's non-streaming stats wait for two sampling cycles; health's 2s deadline is too short.
        const response = await this.agentRequest(nodeAddress, `/containers/${encodeURIComponent(containerId)}/stats`, 10_000)
        const payload = z.object({
            nodeId: z.literal(nodeId),
            stats: z.object({
                id: z.literal(containerId), read: z.string().min(1),
                cpu_stats: z.record(z.string(), z.unknown()),
                memory_stats: z.record(z.string(), z.unknown())
            }).passthrough()
        }).safeParse(response.body)
        if (response.statusCode !== 200 || !payload.success) throw new Error(`Invalid agent stats response for node ${nodeId}`)
        return payload.data.stats
    }

    async createFolders(nodeId: string, folders: any[]) {
        const nodeAddress = await this.resolveNodeAddress(nodeId)
        const response = await this.agentRequest(nodeAddress, '/folders', 10_000, 'POST', folders)
        if (response.statusCode !== 200) throw new Error(`Agent failed to create folders on node ${nodeId}`)
        return response.body
    }

    async createFiles(nodeId: string, files: any[]) {
        const nodeAddress = await this.resolveNodeAddress(nodeId)
        const response = await this.agentRequest(nodeAddress, '/files', 10_000, 'POST', files)
        if (response.statusCode !== 200) throw new Error(`Agent failed to create files on node ${nodeId}`)
        return response.body
    }
}

export function createAgentHealthClient(environment: AgentClientEnvironment = process.env): AgentHealthClient | undefined {
    const config = readAgentClientConfig(environment)
    return config ? new AgentHealthClient(config) : undefined
}
