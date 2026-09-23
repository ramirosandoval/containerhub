import assert from 'node:assert/strict'
import test from 'node:test'
import {buildServiceImageUsage, projectServiceUsage} from '../serviceImageUsage'

const services = [
    {id: 'one', name: 'api-one', stack: 'team', image: {domain: 'registry.example', namespace: 'team', name: 'api', tag: '2.4', fullname: 'registry.example/team/api:2.4', nameWithTag: 'api:2.4'}},
    {id: 'two', name: 'api-two', stack: 'team', image: {domain: 'registry.example', namespace: 'team', name: 'api', tag: '2.4', fullname: 'registry.example/team/api:2.4', nameWithTag: 'api:2.4'}},
    {id: 'three', name: 'worker', stack: null, image: {domain: 'registry.example', namespace: 'team', name: 'worker', tag: '1', fullname: 'registry.example/team/worker:1', nameWithTag: 'worker:1'}},
]

test('indexes deployed services once by repository and tag', () => {
    const usage = buildServiceImageUsage(services)
    assert.equal(usage.get('team/api')?.services.length, 2)
    assert.equal(usage.get('team/api')?.tags.get('2.4')?.length, 2)
    assert.equal(usage.get('team/api')?.tags.size, 1)
})

test('matches a GitLab registry prefix only against the same registry domain', () => {
    assert.deepEqual(projectServiceUsage(services, 'registry.example/team/api').map(({id}) => id), ['one', 'two'])
    assert.deepEqual(projectServiceUsage(services, 'other.example/team/api'), [])
})
