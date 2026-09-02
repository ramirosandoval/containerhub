import assert from 'node:assert/strict'
import test from 'node:test'
import {serviceOrderValue} from '../ServiceService.js'

const services = [
    {
        id: 'web', name: 'web', stack: null, createdAt: null, updatedAt: null, ports: [],
        image: {name: 'web', nameWithTag: 'registry/web:2', namespace: null, domain: null, fullname: 'registry/web:2', tag: '2'}
    },
    {
        id: 'api', name: 'api', stack: null, createdAt: null, updatedAt: null, ports: [],
        image: {name: 'api', nameWithTag: 'registry/api:1', namespace: null, domain: null, fullname: 'registry/api:1', tag: '1'}
    }
]

test('sorts services by image name with tag', () => {
    const ordered = services.sort((left, right) => String(serviceOrderValue(left, 'image.nameWithTag')).localeCompare(String(serviceOrderValue(right, 'image.nameWithTag'))))

    assert.deepEqual(ordered.map(({image}) => image.nameWithTag), ['registry/api:1', 'registry/web:2'])
})
