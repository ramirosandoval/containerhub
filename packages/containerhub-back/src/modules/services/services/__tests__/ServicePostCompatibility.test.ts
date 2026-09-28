import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {ForbiddenError} from '@drax/common-back'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'

type DockerServiceSpec = import('dockerode').ServiceSpec
const auditRecords: Array<Record<string, unknown>> = []
const createAttempts: DockerServiceSpec[] = []
const networkCreates: string[] = []
const updates: DockerServiceSpec[] = []
let serviceNames: string[] = []
let createErrorCode: number | undefined
let revealOnSecondList = false
let serviceListCalls = 0

class DockerStub {
    listServices() {
        serviceListCalls++
        return Promise.resolve(revealOnSecondList && serviceListCalls === 1 ? [] : serviceNames.map((name) => ({
            ID: 'existing-service',
            Spec: {Name: name, TaskTemplate: {ContainerSpec: {Image: 'alpine:3.20'}}}
        })))
    }

    createService(spec: DockerServiceSpec) {
        createAttempts.push(spec)
        if (createErrorCode || serviceNames.includes(spec.Name ?? '')) {
            throw Object.assign(new Error('Docker creation failed'), {statusCode: createErrorCode ?? 409})
        }
        return Promise.resolve({id: 'created-service'})
    }

    getService(serviceId: string) {
        return {
            inspect: async () => ({
                ID: serviceId,
                Version: {Index: 7},
                Spec: {
                    Name: 'stack_api',
                    Labels: {'com.docker.stack.namespace': 'stack'},
                    TaskTemplate: {ContainerSpec: {Image: 'alpine:3.20'}}
                }
            }),
            update: async (spec: DockerServiceSpec) => { updates.push(spec) }
        }
    }

    getNetwork() { return {inspect: async () => { throw Object.assign(new Error('not found'), {statusCode: 404}) }} }
    createNetwork(network: {Name: string}) {
        networkCreates.push(network.Name)
        return Promise.resolve({id: network.Name})
    }
}

const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const auditMock = mock.module('@drax/audit-back', {namedExports: {
    AuditServiceFactory: {instance: {create: async (record: Record<string, unknown>) => auditRecords.push(record)}}
}})
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')
test.after(() => { dockerMock.restore(); auditMock.restore() })
test.beforeEach(() => {
    auditRecords.length = 0
    createAttempts.length = 0
    networkCreates.length = 0
    updates.length = 0
    serviceNames = []
    createErrorCode = undefined
    revealOnSecondList = false
    serviceListCalls = 0
})

async function serviceServer() {
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.addHook('onRequest', async (request: any) => {
        const grants = request.headers.authorization === 'Bearer both'
            ? new Set(['DOCKER_CREATE', 'DOCKER_UPDATE'])
            : request.headers.authorization === 'Bearer update-only'
                ? new Set(['DOCKER_UPDATE']) : new Set(['DOCKER_CREATE'])
        request.rbac = {assertPermission(permission: string) {
            if (!grants.has(permission)) throw new ForbiddenError()
        }}
        request.authUser = {id: 'operator-1', username: 'operator', roleName: 'Admin'}
    })
    await server.register(ServiceRoutes)
    return server
}

const payload = {name: 'stack_api', image: 'alpine:3.20', stack: 'stack'}
const post = (server: Awaited<ReturnType<typeof serviceServer>>, authorization: string, body: unknown = payload) =>
    server.inject({method: 'POST', url: '/api/docker/service', headers: {authorization: `Bearer ${authorization}`}, payload: body})

test('POST creates a new service with CREATE alone', async () => {
    const server = await serviceServer()
    try {
        const response = await post(server, 'create-only')
        assert.equal(response.statusCode, 200)
        assert.equal(response.json().id, 'created-service')
        assert.equal(createAttempts.length, 1)
        assert.equal(updates.length, 0)
        assert.equal(auditRecords.at(-1)?.action, 'CREATE')
    } finally { await server.close() }
})

test('POST existing requires CREATE and UPDATE before side effects', async () => {
    serviceNames = ['stack_api']
    const server = await serviceServer()
    try {
        const denied = await post(server, 'create-only')
        assert.equal(denied.statusCode, 403)
        assert.deepEqual([createAttempts.length, networkCreates.length, updates.length], [0, 0, 0])
        const allowed = await post(server, 'both')
        assert.equal(allowed.statusCode, 200)
        assert.equal(allowed.json().id, 'existing-service')
        assert.deepEqual([createAttempts.length, updates.length], [0, 1])
        assert.equal(auditRecords.at(-1)?.action, 'UPDATE')
    } finally { await server.close() }
})

test('POST existing still requires CREATE and full create payload', async () => {
    serviceNames = ['stack_api']
    const server = await serviceServer()
    try {
        assert.equal((await post(server, 'update-only')).statusCode, 403)
        const malformed = await post(server, 'both', {name: 'stack_api'})
        assert.equal(malformed.statusCode, 422)
        assert.deepEqual([createAttempts.length, updates.length], [0, 0])
    } finally { await server.close() }
})

test('POST retries exact-name create conflict only with UPDATE permission', async () => {
    serviceNames = ['stack_api']
    createErrorCode = 409
    revealOnSecondList = true
    const server = await serviceServer()
    try {
        const response = await post(server, 'both')
        assert.equal(response.statusCode, 200)
        assert.equal(response.json().id, 'existing-service')
        assert.equal(serviceListCalls, 2)
        assert.equal(updates.length, 1)
        assert.equal(auditRecords.at(-1)?.action, 'UPDATE')
    } finally { await server.close() }
})

test('POST conflict without UPDATE cannot update the concurrently created service', async () => {
    serviceNames = ['stack_api']
    createErrorCode = 409
    revealOnSecondList = true
    const server = await serviceServer()
    try {
        assert.equal((await post(server, 'create-only')).statusCode, 403)
        assert.equal(updates.length, 0)
    } finally { await server.close() }
})

test('POST unrelated conflict or daemon failure never updates', async () => {
    const server = await serviceServer()
    try {
        for (const errorCode of [409, 503]) {
            createErrorCode = errorCode
            const response = await post(server, 'both')
            assert.notEqual(response.statusCode, 200)
        }
        assert.equal(updates.length, 0)
    } finally { await server.close() }
})
