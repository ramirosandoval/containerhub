import assert from 'node:assert/strict'
import test from 'node:test'

type DockerodeService = import('dockerode').Service

function serviceId(service: DockerodeService): string {
    return service.id
}

test('uses the upstream Dockerode service type', () => {
    assert.equal(serviceId({id: 'service-id'} as DockerodeService), 'service-id')
})
