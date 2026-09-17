import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {Duplex} from 'node:stream'
import {once} from 'node:events'
import Fastify from 'fastify'
import type Docker from 'dockerode'
import WebSocket from 'ws'
import {terminalRoutes} from '../terminalRoutes.js'

const {openAgentTerminalConnection} = await import(new URL('../../../containerhub-back/src/modules/services/services/AgentTerminalClient.ts', import.meta.url).href)
const containerId = 'a'.repeat(64)

test('real mTLS WSS terminal preserves binary, validates target/resize and cleans up', {timeout: 20000}, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-terminal-'))
    const keyFile = join(directory, 'key.pem')
    const certFile = join(directory, 'cert.pem')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=containerhub-agent', '-addext', 'subjectAltName=DNS:containerhub-agent', '-keyout', keyFile, '-out', certFile], {stdio: 'ignore'})
    const cert = await readFile(certFile)
    const key = await readFile(keyFile)
    const terminals: Duplex[] = []
    const sizes: unknown[] = []
    let wrongTask = false
    const docker = {getContainer(requestedId: string) {
        assert.equal(requestedId, containerId)
        return {
            inspect: async () => ({State: {Running: true}, Config: {Labels: {'com.docker.swarm.task.id': wrongTask ? 'other' : 'task-1', 'com.docker.swarm.node.id': 'worker-1'}}}),
            exec: async (options: Docker.ExecCreateOptions) => {
                assert.deepEqual(options.Cmd, ['sh', '-c', 'stty -ixon; exec "$0" -i', 'sh'])
                const stream = new Duplex({read() {}, write(chunk, _encoding, callback) { this.push(chunk); callback() }})
                terminals.push(stream)
                return {start: async () => stream, resize: async (size: unknown) => { sizes.push(size) }}
            }
        }
    }} as unknown as Pick<Docker, 'getContainer'>
    const server = Fastify({https: {ca: cert, cert, key, requestCert: true, rejectUnauthorized: true}})
    await server.register(terminalRoutes, {docker, nodeId: 'worker-1', secure: true})
    await server.listen({host: '127.0.0.1', port: 0})
    const port = (server.server.address() as {port: number}).port
    const config = {host: 'containerhub-agent', ca: cert, cert, key, serverName: 'containerhub-agent', port, secure: true}
    const url = `wss://127.0.0.1:${port}/containers/${containerId}/terminal?nodeId=worker-1&taskId=task-1&shell=sh`
    const sockets: WebSocket[] = []
    try {
        const terminal = await openAgentTerminalConnection(config, '127.0.0.1', 'worker-1', containerId, 'task-1', 'sh')
        const output = once(terminal.stream, 'data')
        const bytes = Buffer.concat([Buffer.from('á漢字\u0013\u0003'), Buffer.from([0, 255, 128])])
        terminal.stream.write(bytes)
        assert.deepEqual((await output)[0], bytes)
        await terminal.resize(120, 40)
        await new Promise((resolve) => setTimeout(resolve, 30))
        assert.deepEqual(sizes, [{w: 120, h: 40}])
        await assert.rejects(terminal.resize(501, 1), /invalid terminal size/)
        const destroyed = once(terminals[0]!, 'close')
        terminal.close()
        await destroyed
        assert.equal(terminals[0]!.destroyed, true)

        await assert.rejects(openAgentTerminalConnection({...config, serverName: 'wrong-host'}, '127.0.0.1', 'worker-1', containerId, 'task-1', 'sh'))
        await assert.rejects(openAgentTerminalConnection(config, '127.0.0.1', 'wrong-node', containerId, 'task-1', 'sh'))
        wrongTask = true
        await assert.rejects(openAgentTerminalConnection(config, '127.0.0.1', 'worker-1', containerId, 'task-1', 'sh'))
        wrongTask = false
        const anonymous = new WebSocket(url, {ca: cert, servername: 'containerhub-agent'} as WebSocket.ClientOptions)
        sockets.push(anonymous)
        await once(anonymous, 'error')
        assert.notEqual(anonymous.readyState, WebSocket.OPEN)

        for (const invalidControl of [JSON.stringify({type: 'resize', columns: 0, rows: 10}), 'null', 'x'.repeat(1025)]) {
            const socket = new WebSocket(url, {ca: cert, cert, key, servername: 'containerhub-agent'} as WebSocket.ClientOptions)
            sockets.push(socket)
            await once(socket, 'message')
            const closed = once(socket, 'close')
            socket.send(invalidControl)
            assert.equal((await closed)[0], 1008)
        }
        const flooded = new WebSocket(url, {ca: cert, cert, key, servername: 'containerhub-agent'} as WebSocket.ClientOptions)
        sockets.push(flooded)
        await once(flooded, 'message')
        const floodClosed = once(flooded, 'close')
        terminals[terminals.length - 1]!.push(Buffer.alloc(1024 * 1024 + 1))
        assert.equal((await floodClosed)[0], 1009)
        const invalidShell = new WebSocket(url.replace('shell=sh', 'shell=zsh'), {ca: cert, cert, key, servername: 'containerhub-agent'} as WebSocket.ClientOptions)
        sockets.push(invalidShell)
        await once(invalidShell, 'error')
        const oversized = new WebSocket(url, {ca: cert, cert, key, servername: 'containerhub-agent'} as WebSocket.ClientOptions)
        sockets.push(oversized)
        await once(oversized, 'message')
        const oversizedClosed = once(oversized, 'close')
        oversized.send(Buffer.alloc(65537))
        assert.equal((await oversizedClosed)[0], 1009)
        assert.ok(terminals.every((stream) => stream.destroyed))
    } finally {
        sockets.forEach((socket) => socket.terminate())
        terminals.forEach((stream) => stream.destroy())
        await server.close()
        await rm(directory, {recursive: true, force: true})
    }
})

test('terminal uses the deployed plaintext WebSocket transport', async () => {
    const streams: Duplex[] = []
    const docker = {getContainer() {
        return {
            inspect: async () => ({State: {Running: true}, Config: {Labels: {'com.docker.swarm.task.id': 'task-1', 'com.docker.swarm.node.id': 'worker-1'}}}),
            exec: async () => {
                const stream = new Duplex({read() {}, write(chunk, _encoding, callback) { this.push(chunk); callback() }})
                streams.push(stream)
                return {start: async () => stream, resize: async () => undefined}
            }
        }
    }} as unknown as Pick<Docker, 'getContainer'>
    const server = Fastify()
    await server.register(terminalRoutes, {docker, nodeId: 'worker-1', secure: false})
    await server.listen({host: '127.0.0.1', port: 0})
    try {
        const port = (server.server.address() as {port: number}).port
        const terminal = await openAgentTerminalConnection({host: 'containerhub-agent', port, secure: false}, '127.0.0.1', 'worker-1', containerId, 'task-1', 'sh')
        const output = once(terminal.stream, 'data')
        terminal.stream.write(Buffer.from('echo works\r'))
        assert.equal((await output)[0].toString(), 'echo works\r')
        terminal.close()
    } finally {
        streams.forEach((stream) => stream.destroy())
        await server.close()
    }
})
