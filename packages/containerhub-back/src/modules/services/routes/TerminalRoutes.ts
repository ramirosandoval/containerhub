import type {FastifyInstance, FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../permissions/DockerPermissions.js'
import {openTaskTerminalConnection} from '../services/ServiceService.js'
import {terminalSessions, type TerminalShell} from '../services/TerminalSessionService.js'
import {requirePermission} from './requirePermission.js'

type TerminalSocket = {
    bufferedAmount: number
    close(code?: number, reason?: string): void
    on(event: 'message', listener: (payload: Buffer, isBinary: boolean) => void): void
    once(event: 'close' | 'error', listener: () => void): void
    send(payload: Buffer, options: {binary: true}): void
    send(payload: string): void
}

type TerminalRequest = {
    authUser?: {id?: string}
    headers: Record<string, string | string[] | undefined>
    params: {taskId: string}
    terminalSession?: {userId: string; taskId: string; shell: TerminalShell}
}

const MAX_INPUT_BYTES = 64 * 1024
const MAX_BUFFERED_OUTPUT_BYTES = 1024 * 1024
const MAX_SESSION_MILLISECONDS = 30 * 60 * 1000
const IDLE_SESSION_MILLISECONDS = 15 * 60 * 1000

type TerminalResize = {type: 'resize'; columns: number; rows: number}

function protocolValues(request: TerminalRequest): string[] {
    const protocols = request.headers['sec-websocket-protocol']
    return (Array.isArray(protocols) ? protocols.join(',') : protocols ?? '').split(',').map((protocol) => protocol.trim()).filter(Boolean)
}

function terminalTicket(request: TerminalRequest): string | undefined {
    return protocolValues(request).find((protocol) => /^terminal\.[a-f0-9]{64}$/.test(protocol))?.slice('terminal.'.length)
}

function terminalOriginIsAllowed(request: TerminalRequest): boolean {
    const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin
    const configuredOrigin = process.env.TERMINAL_ALLOWED_ORIGIN
    if (configuredOrigin) {
        try { return origin === new URL(configuredOrigin).origin } catch { return false }
    }
    if (process.env.NODE_ENV === 'production' || !origin) return false
    try { return ['127.0.0.1', '::1', 'localhost'].includes(new URL(origin).hostname) }
    catch { return false }
}

function parseResize(payload: Buffer): TerminalResize | undefined {
    if (payload.length > 1_024) return undefined
    try {
        const control = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
        const columns = control.columns
        const rows = control.rows
        if (control.type !== 'resize' || typeof columns !== 'number' || typeof rows !== 'number' || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || columns > 500 || rows < 1 || rows > 500) return undefined
        return {type: 'resize', columns, rows}
    } catch { return undefined }
}

function createTerminalSession(request: TerminalRequest): {ticket: string} {
    const shell = (request as TerminalRequest & {body?: {shell?: unknown}}).body?.shell
    if (!request.authUser?.id || (shell !== 'sh' && shell !== 'bash')) throw new Error('invalid terminal session request')
    return {ticket: terminalSessions.create({userId: request.authUser.id, taskId: request.params.taskId, shell})}
}

export const TerminalRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.post('/api/docker/task/:taskId/terminal-sessions', {
        preHandler: async (request) => requirePermission(request, DockerPermissions.Terminal),
        schema: {
            security: [{bearerAuth: []}],
            params: {type: 'object', additionalProperties: false, required: ['taskId'], properties: {taskId: {type: 'string', minLength: 1, maxLength: 128}}},
            body: {type: 'object', additionalProperties: false, required: ['shell'], properties: {shell: {type: 'string', enum: ['sh', 'bash']}}}
        }
    }, async (request: any) => createTerminalSession(request))

    ;(fastify.get as any)('/api/docker/terminal', {
        websocket: true,
        preHandler: async (request: TerminalRequest) => {
            const ticket = terminalTicket(request)
            if (!terminalOriginIsAllowed(request) || !ticket) throw new Error('terminal connection rejected')
            const session = terminalSessions.consume(ticket)
            if (!session) throw new Error('terminal session expired or already used')
            request.terminalSession = session
        }
    }, async (socket: TerminalSocket, request: TerminalRequest) => {
        const session = request.terminalSession
        if (!session) return socket.close(1008)
        let disconnected = false
        const pendingInput: Array<{payload: Buffer; isBinary: boolean}> = []
        let pendingBytes = 0
        let receiveInput = (payload: Buffer, isBinary: boolean) => {
            pendingBytes += payload.length
            if (pendingBytes > MAX_INPUT_BYTES || pendingInput.length >= 64) {
                disconnected = true
                socket.close(1009)
            } else if (!disconnected) pendingInput.push({payload, isBinary})
        }
        socket.on('message', (payload, isBinary) => receiveInput(payload, isBinary))
        socket.once('close', () => { disconnected = true })
        socket.once('error', () => { disconnected = true })
        try {
            const terminal = await openTaskTerminalConnection(session.taskId, session.shell)
            if (disconnected) { terminal.close(); return }
            let closed = false
            let idleTimer: ReturnType<typeof setTimeout> | undefined
            const closeTerminal = () => {
                if (closed) return
                closed = true
                clearTimeout(idleTimer)
                clearTimeout(sessionTimer)
                terminal.close()
                socket.close()
            }
            const resetIdleTimer = () => {
                clearTimeout(idleTimer)
                idleTimer = setTimeout(closeTerminal, IDLE_SESSION_MILLISECONDS)
            }
            const sessionTimer = setTimeout(closeTerminal, MAX_SESSION_MILLISECONDS)
            resetIdleTimer()
            socket.send(JSON.stringify({type: 'ready'}))
            terminal.stream.on('data', (chunk: Buffer) => {
                if (socket.bufferedAmount + chunk.length > MAX_BUFFERED_OUTPUT_BYTES) return closeTerminal()
                socket.send(Buffer.from(chunk), {binary: true})
            })
            terminal.stream.once('end', closeTerminal)
            terminal.stream.once('close', closeTerminal)
            terminal.stream.once('error', closeTerminal)
            let pendingResize: TerminalResize | undefined
            let resizeInFlight = false
            const queueResize = (resize: TerminalResize) => {
                pendingResize = resize
                if (resizeInFlight) return
                resizeInFlight = true
                void (async () => {
                    try {
                        while (!closed && pendingResize) {
                            const nextResize = pendingResize
                            pendingResize = undefined
                            await terminal.resize(nextResize.columns, nextResize.rows)
                        }
                    } catch {
                        closeTerminal()
                    } finally {
                        pendingResize = undefined
                        resizeInFlight = false
                    }
                })()
            }
            receiveInput = (payload, isBinary) => {
                if (closed) return
                resetIdleTimer()
                if (isBinary) {
                    if (payload.length > MAX_INPUT_BYTES || terminal.stream.writableLength + payload.length > MAX_BUFFERED_OUTPUT_BYTES) return closeTerminal()
                    terminal.stream.write(payload)
                } else {
                    const resize = parseResize(payload)
                    if (resize) queueResize(resize)
                    else closeTerminal()
                }
            }
            for (const input of pendingInput) receiveInput(input.payload, input.isBinary)
            pendingInput.length = 0
            socket.once('close', closeTerminal)
            socket.once('error', closeTerminal)
        } catch {
            socket.close(1011, 'Terminal unavailable')
        }
    })
}
