import assert from 'node:assert/strict'
import test from 'node:test'
import {parseDockerImageReference} from '../../helpers/parseDockerImageReference.js'

test('parses a registry port without treating it as the image tag', () => {
    assert.deepEqual(parseDockerImageReference('registry.example:5000/team/api:2.4'), {
        id: '',
        fullname: 'registry.example:5000/team/api:2.4',
        domain: 'registry.example:5000',
        namespace: 'team',
        name: 'api',
        tag: '2.4',
        nameWithTag: 'api:2.4'
    })
})

test('strips a digest without losing the repository tag', () => {
    assert.deepEqual(parseDockerImageReference('registry.example/team/api:2.4@sha256:abcdef'), {
        id: 'abcdef',
        fullname: 'registry.example/team/api:2.4',
        domain: 'registry.example',
        namespace: 'team',
        name: 'api',
        tag: '2.4',
        nameWithTag: 'api:2.4'
    })
})

test('preserves a digest-only reference instead of inventing a latest tag', () => {
    assert.deepEqual(parseDockerImageReference('alpine@sha256:abcdef'), {
        id: 'abcdef',
        fullname: 'alpine@sha256:abcdef',
        domain: null,
        namespace: null,
        name: 'alpine',
        tag: 'latest',
        nameWithTag: 'alpine:latest'
    })
})

test('defaults an untagged image to latest', () => {
    assert.deepEqual(parseDockerImageReference('alpine'), {
        id: '',
        fullname: 'alpine:latest',
        domain: null,
        namespace: null,
        name: 'alpine',
        tag: 'latest',
        nameWithTag: 'alpine:latest'
    })
})
