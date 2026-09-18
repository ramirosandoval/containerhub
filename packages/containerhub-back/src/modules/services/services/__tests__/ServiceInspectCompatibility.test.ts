import assert from 'node:assert/strict'
import test from 'node:test'
import {mapInspectToServiceModel} from '../../helpers/mapInspectToServiceModel.js'

const inspectedService = {
    ID: 'service-1',
    CreatedAt: '2026-09-01T00:00:00Z',
    UpdatedAt: '2026-09-02T00:00:00Z',
    Spec: {
        Name: 'payments_api',
        Labels: {
            'com.docker.stack.namespace': 'payments',
            owner: 'platform'
        },
        TaskTemplate: {
            ContainerSpec: {
                Image: 'registry.example:5000/team/api:2.4@sha256:abcdef',
                Env: ['A=1', 'EMPTY='],
                Labels: {component: 'api'},
                Mounts: [
                    {Type: 'bind', Source: '/storage/api', Target: '/app/data'},
                    {Type: 'volume', Source: 'cache', Target: '/cache', ReadOnly: true}
                ],
                DNSConfig: {Nameservers: ['10.0.0.2']},
                Hosts: ['10.0.0.8 db'],
                HealthCheck: {
                    Test: ['CMD-SHELL', 'wget -q localhost'],
                    Interval: 3_000_000_000,
                    Timeout: 2_000_000_000,
                    Retries: 4,
                    StartPeriod: 1_000_000_000
                }
            },
            Placement: {
                Constraints: ['node.role == worker'],
                Preferences: [{Spread: {SpreadDescriptor: 'node.labels.zone'}}]
            },
            Resources: {
                Limits: {NanoCPUs: 2_000_000_000, MemoryBytes: 1_073_741_824},
                Reservations: {NanoCPUs: 500_000_000, MemoryBytes: 268_435_456}
            }
        },
        Mode: {Replicated: {Replicas: 2}},
        EndpointSpec: {Ports: [{PublishedPort: 8080, TargetPort: 80, Protocol: 'udp'}]}
    }
}

test('maps the Docker-recoverable legacy discovery fields', () => {
    const service = mapInspectToServiceModel(inspectedService as never)

    assert.deepEqual(service.image, {
        id: 'abcdef',
        fullname: 'registry.example:5000/team/api:2.4',
        domain: 'registry.example:5000',
        namespace: 'team',
        name: 'api',
        tag: '2.4',
        nameWithTag: 'api:2.4'
    })
    assert.deepEqual(service.ports, [{hostPort: 8080, containerPort: 80, protocol: 'UDP', portsProtocol: 'UDP'}])
    assert.deepEqual(service.envs, [{name: 'A', value: '[REDACTED]'}, {name: 'EMPTY', value: '[REDACTED]'}])
    assert.deepEqual(service.volumes, [
        {type: 'bind', hostVolume: '/storage/api', containerVolume: '/app/data', readOnly: false},
        {type: 'volume', hostVolume: 'cache', containerVolume: '/cache', readOnly: true}
    ])
    assert.deepEqual(service.files, [])
    assert.deepEqual(service.labels, [
        {name: 'owner', value: '[REDACTED]'},
        {name: 'component', value: '[REDACTED]'}
    ])
    assert.deepEqual(service.constraints, [{name: 'node.role', operation: '==', value: 'worker'}])
    assert.deepEqual(service.limits, {
        CPULimit: 2_000_000_000,
        memoryLimit: 1_073_741_824,
        CPUReservation: 500_000_000,
        memoryReservation: 268_435_456
    })
    assert.deepEqual(service.preferences, [{name: 'spread', value: 'node.labels.zone'}])
    assert.equal(service.mode, 'replic')
    assert.equal(service.replicas, 2)
    assert.deepEqual(service.extraHosts, ['db:10.0.0.8'])
    assert.deepEqual(service.dns, ['10.0.0.2'])
    assert.deepEqual(service.healthCheck, {
        command: 'wget -q localhost', interval: 3, timeout: 2, retries: 4, startPeriod: 1
    })
})

test('returns an explicit empty files array because Docker does not retain uploaded source contents', () => {
    assert.deepEqual(mapInspectToServiceModel(inspectedService as never).files, [])
})
