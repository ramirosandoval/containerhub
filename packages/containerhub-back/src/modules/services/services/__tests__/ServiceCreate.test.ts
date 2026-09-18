import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {ValidationError} from '@drax/common-back'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'

type DockerServiceSpec = import('dockerode').ServiceSpec

const inspectedServiceIds: string[] = []
const auditRecords: Array<Record<string, unknown>> = []
const createdServiceSpecs: DockerServiceSpec[] = []
const createdNetworkNames: string[] = []
const mutationContext = {
    user: {id: 'user-1', username: 'operator', roleName: 'Admin'},
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'request-1'
}

class DockerStub {
    createService(serviceSpec: DockerServiceSpec) {
        createdServiceSpecs.push(serviceSpec)
        return Promise.resolve({id: 'created-service'})
    }

    getService(serviceId: string) {
        inspectedServiceIds.push(serviceId)
        return {
            inspect: async () => ({
                ID: serviceId,
                Spec: {
                    Name: 'stack_api',
                    Labels: {'com.docker.stack.namespace': 'stack'},
                    TaskTemplate: {ContainerSpec: {Image: 'alpine:3.20'}}
                }
            })
        }
    }

    getNetwork() {
        return {inspect: async () => { throw new Error('network not found') }}
    }

    createNetwork(network: {Name: string}) {
        createdNetworkNames.push(network.Name)
        return Promise.resolve({id: network.Name})
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const auditMock = mock.module('@drax/audit-back', {
    namedExports: {
        AuditServiceFactory: {instance: {create: async (record: Record<string, unknown>) => auditRecords.push(record)}}
    }
})
const {createService} = await import('../ServiceService.js')
const {default: ServiceRoutes} = await import('../../routes/ServiceRoutes.js')

test.after(() => {
    dockerodeMock.restore()
    auditMock.restore()
})

test('create service inspects and audits the lowercase id returned by Dockerode', async () => {
    const createdService = await createService({name: 'stack_api', image: 'alpine:3.20'}, mutationContext)

    assert.equal(createdService.id, 'created-service')
    assert.deepEqual(inspectedServiceIds, ['created-service'])
    assert.equal(auditRecords[0]?.resourceId, 'created-service')
})

test('create service attaches requested aliases and the stack default network through the task template', async () => {
    await createService({
        name: 'stack_api',
        stack: 'stack',
        image: 'alpine:3.20',
        networks: [{Target: 'shared', Aliases: ['backend']}]
    }, mutationContext)

    assert.deepEqual(createdServiceSpecs.at(-1)?.TaskTemplate?.Networks, [
        {Target: 'shared', Aliases: ['backend']},
        {Target: 'stack_default', Aliases: ['api']}
    ])
    assert.equal(createdServiceSpecs.at(-1)?.Networks, undefined)
    assert.deepEqual(createdNetworkNames, ['shared', 'stack_default'])
})

test('create service converts the legacy health-check seconds to Docker nanoseconds', async () => {
    await createService({
        name: 'stack_api',
        image: 'alpine:3.20',
        healthcheck: {test: 'wget -q localhost', interval: 3, timeout: 2, retries: 4, startPeriod: 1}
    }, mutationContext)

    const taskTemplate = createdServiceSpecs.at(-1)?.TaskTemplate
    assert.ok(taskTemplate && 'ContainerSpec' in taskTemplate)
    assert.deepEqual(taskTemplate.ContainerSpec?.HealthCheck, {
        Test: ['CMD-SHELL', 'wget -q localhost'],
        Interval: 3_000_000_000,
        Timeout: 2_000_000_000,
        Retries: 4,
        StartPeriod: 1_000_000_000
    })
})

test('create service normalizes the legacy command, nullable limits and UDP protocol', async () => {
    await createService({
        name: 'stack_api',
        image: 'registry.example:5000/team/api:2.4',
        command: '/usr/local/bin/start',
        limits: {
            CPULimit: null,
            memoryLimit: null,
            CPUReservation: 250_000_000,
            memoryReservation: null
        },
        ports: [{hostPort: 8080, containerPort: 80, portsProtocol: 'UDP'}]
    } as never, mutationContext)

    const serviceSpec = createdServiceSpecs.at(-1)
    const taskTemplate = serviceSpec?.TaskTemplate
    assert.ok(taskTemplate && 'ContainerSpec' in taskTemplate)
    assert.deepEqual(taskTemplate.ContainerSpec?.Command, ['/usr/local/bin/start'])
    assert.deepEqual(taskTemplate.Resources, {Reservations: {NanoCPUs: 250_000_000}})
    assert.deepEqual(serviceSpec?.EndpointSpec?.Ports, [{
        PublishedPort: 8080,
        TargetPort: 80,
        Protocol: 'udp'
    }])
})

test('create service prefers the canonical port protocol over the legacy alias', async () => {
    await createService({
        name: 'stack_api',
        image: 'alpine:3.20',
        ports: [{hostPort: 8080, containerPort: 80, protocol: 'TCP', portsProtocol: 'UDP'}]
    } as never, mutationContext)

    assert.equal(createdServiceSpecs.at(-1)?.EndpointSpec?.Ports?.[0]?.Protocol, 'tcp')
})

test('create service rejects malformed input before calling Docker', async () => {
    const creationsBeforeValidation = createdServiceSpecs.length

    await assert.rejects(
        createService({name: 123, image: 'alpine:3.20'} as never, mutationContext),
        ValidationError
    )
    assert.equal(createdServiceSpecs.length, creationsBeforeValidation)
})

test('create service route preserves the Drax validation response with Fastify validation disabled', async () => {
    const creationsBeforeValidation = createdServiceSpecs.length
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.addHook('onRequest', async (request: any) => {
        request.rbac = {assertPermission: () => undefined}
        request.authUser = mutationContext.user
    })
    await server.register(ServiceRoutes)

    try {
        const response = await server.inject({method: 'POST', url: '/api/docker/service', payload: {name: 123, image: 'alpine:3.20'}})

        assert.equal(response.statusCode, 422)
        assert.equal(response.json().error, 'ValidationError')
        assert.equal(response.json().inputErrors[0]?.field, 'name')
        assert.equal(createdServiceSpecs.length, creationsBeforeValidation)
    } finally {
        await server.close()
    }
})
