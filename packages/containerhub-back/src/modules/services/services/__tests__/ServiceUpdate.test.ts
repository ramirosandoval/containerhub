import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {ValidationError} from '@drax/common-back'

type DockerServiceSpec = import('dockerode').ServiceSpec

const updatedServiceSpecs: Array<DockerServiceSpec & {version?: number}> = []
const auditRecords: Array<Record<string, unknown>> = []
let serviceLookups = 0
let existingCommand: string[] | undefined
const mutationContext = {
    user: {id: 'user-1', username: 'operator', roleName: 'Admin'},
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'request-1'
}

class DockerStub {
    getService(serviceId: string) {
        serviceLookups++
        return {
            inspect: async () => ({
                ID: serviceId,
                Version: {Index: 7},
                Spec: {
                    Name: 'stack_api',
                    Labels: {'com.docker.stack.namespace': 'stack'},
                    TaskTemplate: {ContainerSpec: {Image: 'alpine:3.20', Command: existingCommand}}
                }
            }),
            update: async (serviceSpec: DockerServiceSpec & {version?: number}) => {
                updatedServiceSpecs.push(serviceSpec)
            }
        }
    }

    getNetwork() {
        return {inspect: async () => ({ID: 'stack_default'})}
    }
}

const dockerodeMock = mock.module('dockerode', {defaultExport: DockerStub})
const auditMock = mock.module('@drax/audit-back', {
    namedExports: {
        AuditServiceFactory: {instance: {create: async (record: Record<string, unknown>) => auditRecords.push(record)}}
    }
})
const {updateService} = await import('../ServiceService.js')

test.after(() => {
    dockerodeMock.restore()
    auditMock.restore()
})

test('update service sends Docker version with legacy resource and rollout policies', async () => {
    await updateService('service-1', {
        limits: {
            CPULimit: 2_000_000_000,
            memoryLimit: 1_073_741_824,
            CPUReservation: 500_000_000,
            memoryReservation: 268_435_456
        }
    }, mutationContext)

    const serviceSpec = updatedServiceSpecs[0]
    assert.equal(serviceSpec?.version, 7)
    assert.deepEqual(serviceSpec?.TaskTemplate?.Resources, {
        Limits: {NanoCPUs: 2_000_000_000, MemoryBytes: 1_073_741_824},
        Reservations: {NanoCPUs: 500_000_000, MemoryBytes: 268_435_456}
    })
    assert.deepEqual(serviceSpec?.TaskTemplate?.RestartPolicy, {
        Condition: 'on-failure', Delay: 10_000_000_000, MaxAttempts: 10
    })
    assert.deepEqual(serviceSpec?.UpdateConfig, {
        Parallelism: 2, Delay: 1_000_000_000, FailureAction: 'pause', Monitor: 15_000_000_000, MaxFailureRatio: 0.15
    })
    assert.deepEqual(serviceSpec?.RollbackConfig, {
        Parallelism: 1, Delay: 1_000_000_000, FailureAction: 'pause', Monitor: 15_000_000_000, MaxFailureRatio: 0.15
    })
    assert.equal(auditRecords[0]?.action, 'UPDATE')
})

test('update service accepts the legacy partial wire shape without changing its meaning', async () => {
    await updateService('service-1', {
        command: '/usr/local/bin/start',
        limits: {
            CPULimit: null,
            memoryLimit: null,
            CPUReservation: 250_000_000,
            memoryReservation: null
        },
        ports: [{hostPort: 5353, containerPort: 5353, portsProtocol: 'UDP'}]
    } as never, mutationContext)

    const serviceSpec = updatedServiceSpecs.at(-1)
    const taskTemplate = serviceSpec?.TaskTemplate
    assert.ok(taskTemplate && 'ContainerSpec' in taskTemplate)
    assert.equal(taskTemplate.ContainerSpec?.Image, 'alpine:3.20')
    assert.deepEqual(taskTemplate.ContainerSpec?.Command, ['/usr/local/bin/start'])
    assert.deepEqual(taskTemplate.Resources, {Reservations: {NanoCPUs: 250_000_000}})
    assert.deepEqual(serviceSpec?.EndpointSpec?.Ports, [{PublishedPort: 5353, TargetPort: 5353, Protocol: 'udp'}])
})

test('update service clears an existing command when the legacy payload sends null', async () => {
    existingCommand = ['/usr/local/bin/legacy-start']
    try {
        await updateService('service-1', {command: null} as never, mutationContext)

        const taskTemplate = updatedServiceSpecs.at(-1)?.TaskTemplate
        assert.ok(taskTemplate && 'ContainerSpec' in taskTemplate)
        assert.equal(taskTemplate.ContainerSpec?.Command, undefined)
    } finally {
        existingCommand = undefined
    }
})

test('update service rejects malformed input before inspecting Docker', async () => {
    const lookupsBeforeValidation = serviceLookups

    await assert.rejects(
        updateService('service-1', {replicas: 'many'} as never, mutationContext),
        ValidationError
    )
    assert.equal(serviceLookups, lookupsBeforeValidation)
})