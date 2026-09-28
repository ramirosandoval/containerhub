import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {once} from 'node:events'
import {PassThrough} from 'node:stream'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws'

const dockerCalls = {
    taskIds: [] as string[]
}
let dockerTasks: Array<Record<string, unknown>> = []
let onStreamRequested: (() => void) | undefined
let resolveLogStream: ((stream: PassThrough) => void) | undefined

class DockerStub {
    getService() {
        return {
            inspect: async () => ({
                ID: 'service-1',
                Spec: {Name: 'payments_api', TaskTemplate: {ContainerSpec: {Image: 'payments-api:latest'}}}
            })
        }
    }

    listTasks() {
        return Promise.resolve(dockerTasks)
    }

    getTask(taskId: string) {
        dockerCalls.taskIds.push(taskId)
        return {logs: () => onStreamRequested
            ? new Promise<PassThrough>((resolve) => { resolveLogStream = resolve; onStreamRequested?.() })
            : Promise.resolve(Buffer.from('service log\n', 'utf8'))}
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const settingsMock = mock.module('../../../settings/services/SettingsService.js', {namedExports: {
    SettingsService: {getSettings: async () => ({maxLogsLines: 10_000})}
}})
const {fetchLogs} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => { dockerodeMock.restore(); settingsMock.restore() })

test.beforeEach(() => {
    dockerCalls.taskIds.length = 0
    onStreamRequested = undefined
    resolveLogStream = undefined
    dockerTasks = [
        {ID: 'task-failed', Status: {State: 'failed'}},
        {ID: 'task-running', Status: {State: 'running'}}
    ]
})

test('service logs select the normalized running task id', async () => {
    const logLines = await fetchLogs('payments', 'api', 30)

    assert.deepEqual(logLines, ['service log'])
    assert.deepEqual(dockerCalls.taskIds, ['task-running'])
})

test('service logs return null when no task is running', async () => {
    dockerTasks = [{ID: 'task-failed', Status: {State: 'failed'}}]

    assert.equal(await fetchLogs('payments', 'api', 30), null)
    assert.deepEqual(dockerCalls.taskIds, [])
})

async function serviceLogServer() {
    const fastify = Fastify()
    await fastify.register(websocket)
    fastify.setValidatorCompiler(() => () => true)
    fastify.addHook('onRequest', async (request) => {
        const bearerToken = request.headers.authorization?.replace(/^Bearer /, '')
        ;(request as any).rbac = {
            assertPermission(permission: string) {
                if (!bearerToken) throw Object.assign(new Error('Unauthenticated'), {statusCode: 401})
                if (bearerToken !== 'logs-user' || permission !== 'DOCKER_LOGS') {
                    throw Object.assign(new Error('Forbidden'), {statusCode: 403})
                }
            }
        }
    })
    await fastify.register(ServiceRoutes)
    await fastify.ready()
    return fastify
}

test('service logs allow an authenticated user with DOCKER_LOGS', async () => {
    const fastify = await serviceLogServer()
    try {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/docker/logs/payments/api?lines=30',
            headers: {authorization: 'Bearer logs-user'}
        })

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), ['service log'])
        assert.deepEqual(dockerCalls.taskIds, ['task-running'])
    } finally {
        await fastify.close()
    }
})

test('service logs deny an authenticated user without DOCKER_LOGS', async () => {
    const fastify = await serviceLogServer()
    try {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/docker/logs/payments/api',
            headers: {authorization: 'Bearer view-user'}
        })

        assert.equal(response.statusCode, 403)
        assert.deepEqual(dockerCalls.taskIds, [])
    } finally {
        await fastify.close()
    }
})

test('service logs deny an unauthenticated request', async () => {
    const fastify = await serviceLogServer()
    try {
        const response = await fastify.inject({method: 'GET', url: '/api/docker/logs/payments/api'})

        assert.equal(response.statusCode, 401)
        assert.deepEqual(dockerCalls.taskIds, [])
    } finally {
        await fastify.close()
    }
})

test('closes a log stream that starts after its WebSocket closes', async () => {
    const fastify = await serviceLogServer()
    await fastify.listen({host: '127.0.0.1', port: 0})
    const port = (fastify.server.address() as {port: number}).port
    const streamRequested = new Promise<void>((resolve) => { onStreamRequested = resolve })
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/docker/task/task-1/logs/stream`, {
        headers: {authorization: 'Bearer logs-user'}
    })
    const stream = new PassThrough()
    try {
        await once(socket, 'open')
        socket.send(JSON.stringify({tail: 30}))
        await streamRequested
        const serverSocket = [...fastify.websocketServer.clients][0]!
        const secondMessage = once(serverSocket, 'message')
        socket.send(JSON.stringify({tail: 30}))
        await secondMessage
        assert.deepEqual(dockerCalls.taskIds, ['task-1'])
        socket.close()
        await once(socket, 'close')
        resolveLogStream!(stream)
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(stream.destroyed, true)
    } finally {
        onStreamRequested = undefined
        socket.terminate()
        stream.destroy()
        await fastify.close()
    }
})
