import {Duplex} from 'node:stream'
import {isIP} from 'node:net'
import WebSocket from 'ws'
import type {readAgentClientConfig} from './AgentHealthClient.js'
import type {TaskTerminalConnection} from './ServiceService.js'

type AgentClientConfig = NonNullable<ReturnType<typeof readAgentClientConfig>>

export function openAgentTerminalConnection(
    config: AgentClientConfig, nodeAddress: string, nodeId: string, containerId: string, taskId: string, shell: 'sh' | 'bash'
): Promise<TaskTerminalConnection> {
    if (!isIP(nodeAddress) || (shell !== 'sh' && shell !== 'bash')) return Promise.reject(new Error('invalid agent terminal target'))
    const host = isIP(nodeAddress) === 6 ? `[${nodeAddress}]` : nodeAddress
    const query = new URLSearchParams({nodeId, taskId, shell})
    const connectionOptions: WebSocket.ClientOptions & import('node:tls').ConnectionOptions = {
        rejectUnauthorized: true, handshakeTimeout: 5000, maxPayload: 1024 * 1024, perMessageDeflate: false
    }
    if (config.secure) Object.assign(connectionOptions, {ca: config.ca, cert: config.cert, key: config.key, servername: config.serverName})
    const socket = new WebSocket(`${config.secure ? 'wss' : 'ws'}://${host}:${config.port}/containers/${encodeURIComponent(containerId)}/terminal?${query}`, connectionOptions)
    return new Promise((resolve, reject) => {
        let ready = false
        const stream = new Duplex({
            read() { socket.resume() },
            write(chunk: Buffer, _encoding, callback) {
                if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount + chunk.length > 1024 * 1024) {
                    callback(new Error('agent terminal input buffer exceeded or closed'))
                } else socket.send(chunk, {binary: true}, callback)
            },
            destroy(error, callback) {
                clearTimeout(readyTimer)
                socket.terminate()
                callback(error)
            }
        })
        // Consumers attach after readiness; keep errors handled during setup/teardown too.
        stream.on('error', () => {})
        const fail = (error: Error) => {
            clearTimeout(readyTimer)
            if (!ready) reject(error)
            stream.destroy(error)
        }
        const readyTimer = setTimeout(() => fail(new Error('agent terminal readiness timed out')), 5000)
        readyTimer.unref()
        socket.once('error', fail)
        socket.once('close', () => {
            clearTimeout(readyTimer)
            if (!ready) reject(new Error('agent terminal closed before ready'))
            stream.push(null)
            stream.destroy()
        })
        socket.on('message', (payload, isBinary) => {
            const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload as ArrayBuffer)
            if (!ready) {
                try {
                    if (isBinary || bytes.length > 1024) throw new Error('invalid agent terminal readiness')
                    const control = JSON.parse(bytes.toString('utf8'))
                    if (control?.type !== 'ready' || control.nodeId !== nodeId) throw new Error('agent terminal node mismatch')
                    ready = true
                    clearTimeout(readyTimer)
                    resolve({
                        stream,
                        resize: (columns, rows) => new Promise<void>((resolveResize, rejectResize) => {
                            if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || columns > 500 || rows < 1 || rows > 500) {
                                rejectResize(new Error('invalid terminal size'))
                                return
                            }
                            if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1024 * 1024) {
                                rejectResize(new Error('agent terminal control buffer exceeded or closed'))
                                return
                            }
                            socket.send(JSON.stringify({type: 'resize', columns, rows}), (error) => error ? rejectResize(error) : resolveResize())
                        }),
                        close: () => stream.destroy()
                    })
                } catch (error) { fail(error instanceof Error ? error : new Error('invalid agent terminal readiness')) }
                return
            }
            if (!isBinary) return fail(new Error('unexpected agent terminal control'))
            if (stream.readableLength + bytes.length > 1024 * 1024) return fail(new Error('agent terminal output buffer exceeded'))
            if (!stream.push(bytes)) socket.pause()
        })
    })
}

export async function connectTaskAgentTerminal(nodeId: string, containerId: string, taskId: string, shell: 'sh' | 'bash') {
    const {AgentHealthClient, readAgentClientConfig} = await import('./AgentHealthClient.js')
    const config = readAgentClientConfig(process.env)
    if (!config) throw new Error('Node agent is not configured')
    const nodeAddress = await new AgentHealthClient(config).resolveNodeAddress(nodeId)
    return openAgentTerminalConnection(config, nodeAddress, nodeId, containerId, taskId, shell)
}
