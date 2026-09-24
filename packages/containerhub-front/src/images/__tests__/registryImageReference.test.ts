import assert from 'node:assert/strict'
import test from 'node:test'
import {inspectionRegistryTarget, projectRegistryTarget, serviceRegistryTarget} from '../registryImageReference'

test('builds a registry deep link from structured service image fields', () => {
    assert.deepEqual(serviceRegistryTarget({
        domain: 'registry.example:5000',
        namespace: 'team/subgroup',
        name: 'api',
        tag: '2.4',
    }), {
        repository: 'team/subgroup/api',
        tag: '2.4',
        fullReference: 'registry.example:5000/team/subgroup/api:2.4',
    })
})

test('removes the registry domain from a GitLab image prefix', () => {
    assert.deepEqual(projectRegistryTarget('registry.example:5000/group/subgroup/project'), {
        repository: 'group/subgroup/project',
        registryDomain: 'registry.example:5000',
    })
    assert.deepEqual(projectRegistryTarget('group/project'), {
        repository: 'group/project',
        registryDomain: null,
    })
})

test('rejects empty image references', () => {
    assert.throws(() => serviceRegistryTarget({domain: null, namespace: null, name: '', tag: 'latest'}), /name is required/)
    assert.throws(() => projectRegistryTarget(''), /prefix is required/)
})

test('resolves inspected Docker image references into registry search and tag', () => {
    assert.deepEqual(inspectionRegistryTarget('192.168.122.1:5000/team/api:2.4'), {repository: 'team/api', tag: '2.4'})
    assert.deepEqual(inspectionRegistryTarget('registry.example:5000/team/api:latest'), {repository: 'team/api', tag: 'latest'})
    assert.deepEqual(inspectionRegistryTarget('alpine:3'), {repository: 'alpine', tag: '3'})
    assert.deepEqual(inspectionRegistryTarget('team/api@sha256:abc'), {repository: 'team/api', tag: null})
    assert.equal(inspectionRegistryTarget(''), null)
})
