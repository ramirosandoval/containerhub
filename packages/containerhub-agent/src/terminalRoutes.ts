import type Docker from 'dockerode'
import type {FastifyPluginAsync} from 'fastify'
import websocket from '@fastify/websocket'
import {TLSSocket} from 'node:tls'
import type {Duplex} from 'node:stream'
import WebSocket from 'ws'

const MAX_INPUT_BYTES = 64 * 1024
const MAX_BUFFERED_BYTES = 1024 * 1024

type TerminalOptions = {docker: Pick<Docker, 'getContainer'>; nodeId: string}
type TerminalTarget = {containerId: string; nodeId: string; taskId: string; shell: 'sh' | 'bash'}

export const terminalRoutes: FastifyPluginAsync<TerminalOptions> = async (server, {docker, nodeId}) => {
    await server.register(websocket, {options: {maxPayload: MAX_INPUT_BYTES, perMessageDeflate: false}})
    server.get<{Params: {containerId: string}; Querystring: Omit<TerminalTarget, 'containerId'>}>('/containers/:containerId/terminal', {
        websocket: true,
        preValidation: async (request, reply) => {
            const connection = request.raw.socket
            if (!(connection instanceof TLSSocket) || !connection.authorized) return reply.code(401).send({error: 'mTLS required'})
            const target = request.query
            if (target.nodeId !== nodeId || !/^[a-zA-Z0-9_-]{1,128}$/.test(target.taskId ?? '') ||
                !/^[a-f0-9]{64}$/.test(request.params.containerId) || (target.shell !== 'sh' && target.shell !== 'bash')) {
                return reply.code(400).send({error: 'invalid terminal target'})
            }
        }
    }, (socket, request) => {
        let stream: Duplex | undefined
        let terminalExec: Docker.Exec | undefined
        let closed = false
        let resizing = false
        let pendingSize: {w: number; h: number} | undefined
        let idleTimer: ReturnType<typeof setTimeout>
        const close = (code = 1000) => {
            if (closed) return
            closed = true
            clearTimeout(idleTimer)
            clearTimeout(sessionTimer)
            clearTimeout(startTimer)
            stream?.destroy()
            socket.close(code)
            // Bound cleanup even when the peer never acknowledges the close frame.
            const closeTimer = setTimeout(() => socket.terminate(), 1000)
            closeTimer.unref()
            socket.once('close', () => clearTimeout(closeTimer))
        }
        const resetIdle = () => {
            clearTimeout(idleTimer)
            idleTimer = setTimeout(() => close(), 15 * 60 * 1000)
            idleTimer.unref()
        }
        const sessionTimer = setTimeout(() => close(), 30 * 60 * 1000)
        sessionTimer.unref()
        const startTimer = setTimeout(() => close(1011), 5000)
        startTimer.unref()
        resetIdle()
        socket.once('close', () => close())
        socket.once('error', () => close(1011))
        socket.on('message', (payload, isBinary) => {
            if (closed) return
            resetIdle()
            const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload as ArrayBuffer)
            if (!stream || !terminalExec) return close(1008)
            if (isBinary) {
                if (bytes.length > MAX_INPUT_BYTES || stream.writableLength + bytes.length > MAX_BUFFERED_BYTES) return close(1009)
                if (!stream.write(bytes)) {
                    socket.pause()
                    stream.once('drain', () => { if (!closed) socket.resume() })
                }
                return
            }
            try {
                if (bytes.length > 1024) return close(1008)
                const control = JSON.parse(bytes.toString('utf8'))
                if (control?.type !== 'resize' || !Number.isInteger(control.columns) || !Number.isInteger(control.rows) ||
                    control.columns < 1 || control.columns > 500 || control.rows < 1 || control.rows > 500) return close(1008)
                pendingSize = {w: control.columns, h: control.rows}
                if (resizing) return
                resizing = true
                void (async () => {
                    while (pendingSize && !closed) {
                        const size = pendingSize
                        pendingSize = undefined
                        await terminalExec!.resize(size)
                    }
                })().catch(() => close(1011)).finally(() => { resizing = false })
            } catch { close(1008) }
        })
        void (async () => {
            const container = docker.getContainer(request.params.containerId)
            const inspect = await container.inspect()
            if (closed) return
            if (!inspect.State.Running || inspect.Config.Labels?.['com.docker.swarm.task.id'] !== request.query.taskId ||
                inspect.Config.Labels?.['com.docker.swarm.node.id'] !== nodeId) return close(1008)
            const shell = request.query.shell
            terminalExec = await container.exec({
                AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
                Cmd: [shell, '-c', 'stty -ixon; exec "$0" -i', shell]
            })
            if (closed) return
            stream = await terminalExec.start({hijack: true, stdin: true, Tty: true})
            if (closed) { stream.destroy(); return }
            clearTimeout(startTimer)
            stream.once('error', () => close(1011))
            stream.once('end', () => close())
            stream.once('close', () => close())
            socket.send(JSON.stringify({type: 'ready', nodeId}))
            stream.on('data', (chunk: Buffer) => {
                if (closed || socket.readyState !== WebSocket.OPEN) return close()
                if (socket.bufferedAmount + chunk.length > MAX_BUFFERED_BYTES) return close(1009)
                stream!.pause()
                socket.send(chunk, {binary: true}, (error) => {
                    if (error) close(1011)
                    else if (!closed) stream!.resume()
                })
            })
        })().catch(() => close(1011))
    })
}
