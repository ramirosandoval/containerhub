import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {once} from 'node:events'
import {PassThrough} from 'node:stream'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws'
import {terminalSessions} from '../../services/TerminalSessionService.js'
import type {TaskTerminalConnection} from '../../services/ServiceService.js'

let finishOpening: (terminal: TaskTerminalConnection) => void
let openingError: Error | undefined
const serviceMock = mock.module('../../services/ServiceService.js', {namedExports: {
    openTaskTerminalConnection: () => openingError ? Promise.reject(openingError) : new Promise<TaskTerminalConnection>((resolve) => { finishOpening = resolve })
}})
const {TerminalRoutes} = await import('../TerminalRoutes.js')
test.after(() => serviceMock.restore())

test('browser contract queues initial resize/input during remote setup and cleans late connections', {timeout: 5000}, async () => {
    const server = Fastify()
    await server.register(websocket)
    await server.register(TerminalRoutes)
    await server.listen({host: '127.0.0.1', port: 0})
    const port = (server.server.address() as {port: number}).port
    const sockets: WebSocket[] = []
    const streams: PassThrough[] = []
    const connect = async () => {
        const ticket = terminalSessions.create({userId: 'user', taskId: 'task', shell: 'sh'})
        const socket = new WebSocket(`ws://127.0.0.1:${port}/api/docker/terminal`, [`terminal.${ticket}`], {origin: 'http://localhost'})
        sockets.push(socket)
        await once(socket, 'open')
        return socket
    }
    try {
        const socket = await connect()
        const serverSocket = [...server.websocketServer.clients][0]!
        const received = once(serverSocket, 'message')
        socket.send(JSON.stringify({type: 'resize', columns: 100, rows: 30}))
        await received
        const inputReceived = once(serverSocket, 'message')
        socket.send(Buffer.from('á\u0003'))
        await inputReceived
        const stream = new PassThrough()
        streams.push(stream)
        const sizes: number[][] = []
        const messages = new Promise<Array<[WebSocket.RawData, boolean]>>((resolve) => {
            const received: Array<[WebSocket.RawData, boolean]> = []
            socket.on('message', (data, isBinary) => {
                received.push([data, isBinary])
                if (received.length === 2) resolve(received)
            })
        })
        finishOpening({stream, resize: async (columns, rows) => { sizes.push([columns, rows]) }, close: () => stream.destroy()})
        const [[ready, readyIsBinary], [bytes, binary]] = await messages
        assert.equal(readyIsBinary, false)
        assert.deepEqual(JSON.parse(String(ready)), {type: 'ready'})
        assert.equal(binary, true)
        assert.deepEqual(bytes, Buffer.from('á\u0003'))
        assert.deepEqual(sizes, [[100, 30]])
        const destroyed = once(stream, 'close')
        socket.close()
        await destroyed

        const earlySocket = await connect()
        const earlyServerSocket = [...server.websocketServer.clients].find((client) => client.readyState === WebSocket.OPEN)!
        const earlyClosed = once(earlyServerSocket, 'close')
        earlySocket.close()
        await earlyClosed
        const lateStream = new PassThrough()
        streams.push(lateStream)
        const lateDestroyed = once(lateStream, 'close')
        finishOpening({stream: lateStream, resize: async () => {}, close: () => lateStream.destroy()})
        await lateDestroyed
        assert.equal(lateStream.destroyed, true)
    } finally {
        sockets.forEach((socket) => socket.terminate())
        streams.forEach((stream) => stream.destroy())
        await server.close()
    }
})

test('local terminal applies the latest queued resize after the active resize', async () => {
    const server = Fastify()
    await server.register(websocket)
    await server.register(TerminalRoutes)
    await server.listen({host: '127.0.0.1', port: 0})
    const port = (server.server.address() as {port: number}).port
    const ticket = terminalSessions.create({userId: 'user', taskId: 'task', shell: 'sh'})
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/docker/terminal`, [`terminal.${ticket}`], {origin: 'http://localhost'})
    const stream = new PassThrough()
    const sizes: number[][] = []
    const releases: Array<() => void> = []
    try {
        await once(socket, 'open')
        finishOpening({
            stream,
            resize: async (columns, rows) => {
                sizes.push([columns, rows])
                await new Promise<void>((resolve) => releases.push(resolve))
            },
            close: () => stream.destroy()
        })
        await once(socket, 'message')
        const serverSocket = [...server.websocketServer.clients][0]!
        let received = once(serverSocket, 'message')
        socket.send(JSON.stringify({type: 'resize', columns: 80, rows: 24}))
        await received
        await new Promise<void>((resolve) => setImmediate(resolve))
        received = once(serverSocket, 'message')
        socket.send(JSON.stringify({type: 'resize', columns: 120, rows: 40}))
        await received
        received = once(serverSocket, 'message')
        socket.send(JSON.stringify({type: 'resize', columns: 160, rows: 50}))
        await received
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.deepEqual(sizes, [[80, 24]])
        releases.shift()!()
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.deepEqual(sizes, [[80, 24], [160, 50]])
        releases.shift()!()
    } finally {
        socket.terminate()
        stream.destroy()
        await server.close()
    }
})

test('terminal session endpoint validates the shell before authentication', async () => {
    const server = Fastify()
    await server.register(TerminalRoutes)
    try {
        const response = await server.inject({
            method: 'POST',
            url: '/api/docker/task/task/terminal-sessions',
            payload: {shell: 'zsh'}
        })
        assert.equal(response.statusCode, 400)
    } finally {
        await server.close()
    }
})

test('terminal reports setup failures through a WebSocket close reason', async () => {
    const server = Fastify()
    await server.register(websocket)
    await server.register(TerminalRoutes)
    await server.listen({host: '127.0.0.1', port: 0})
    const port = (server.server.address() as {port: number}).port
    const ticket = terminalSessions.create({userId: 'user', taskId: 'task', shell: 'sh'})
    openingError = new Error('agent unavailable')
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/docker/terminal`, [`terminal.${ticket}`], {origin: 'http://localhost'})
    try {
        const [code, reason] = await once(socket, 'close')
        assert.equal(code, 1011)
        assert.equal(String(reason), 'Terminal unavailable')
    } finally {
        openingError = undefined
        socket.terminate()
        await server.close()
    }
})
