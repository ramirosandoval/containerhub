import type {FastifyInstance, FastifyPluginAsync} from 'fastify'
import {DockerPermissions} from '../permissions/DockerPermissions.js'
import {openTaskTerminalConnection} from '../services/ServiceService.js'
import {terminalSessions, type TerminalShell} from '../services/TerminalSessionService.js'
import {requirePermission} from './requirePermission.js'

type TerminalSocket = {
    bufferedAmount: number
    close(code?: number): void
    on(event: 'message', listener: (payload: Buffer, isBinary: boolean) => void): void
    once(event: 'close' | 'error', listener: () => void): void
    send(payload: Buffer, options: {binary: true}): void
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
    if (configuredOrigin) return origin === configuredOrigin
    if (process.env.NODE_ENV === 'production' || !origin) return false
    try { return ['127.0.0.1', '::1', 'localhost'].includes(new URL(origin).hostname) }
    catch { return false }
}

function parseResize(payload: Buffer): TerminalResize | undefined {
    if (payload.length > 1_024) return undefined
    try {
        const control = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
        const columns = Number(control.columns)
        const rows = Number(control.rows)
        if (control.type !== 'resize' || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || columns > 500 || rows < 1 || rows > 500) return undefined
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
        schema: {security: [{bearerAuth: []}]}
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
        try {
            const terminal = await openTaskTerminalConnection(session.taskId, session.shell)
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
            terminal.stream.on('data', (chunk: Buffer) => {
                if (socket.bufferedAmount > MAX_BUFFERED_OUTPUT_BYTES) return closeTerminal()
                socket.send(Buffer.from(chunk), {binary: true})
            })
            terminal.stream.once('end', closeTerminal)
            terminal.stream.once('error', closeTerminal)
            socket.on('message', (payload, isBinary) => {
                resetIdleTimer()
                if (isBinary && payload.length <= MAX_INPUT_BYTES) terminal.stream.write(payload)
                else {
                    const resize = parseResize(payload)
                    if (resize) void terminal.resize(resize.columns, resize.rows)
                    else closeTerminal()
                }
            })
            socket.once('close', closeTerminal)
            socket.once('error', closeTerminal)
        } catch {
            socket.close(1011)
        }
    })
}
