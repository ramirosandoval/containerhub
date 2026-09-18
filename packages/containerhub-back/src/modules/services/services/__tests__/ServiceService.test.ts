import assert from 'node:assert/strict'
import test from 'node:test'
import type {ServiceModel} from '../../helpers/mapInspectToServiceModel.js'
import {matchesServiceFilters, parseServiceFilters, serviceOrderValue} from '../ServiceService.js'

const services: ServiceModel[] = [
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
    const ordered = [...services].sort((left, right) => String(serviceOrderValue(left, 'image.nameWithTag')).localeCompare(String(serviceOrderValue(right, 'image.nameWithTag'))))

    assert.deepEqual(ordered.map(({image}) => image.nameWithTag), ['registry/api:1', 'registry/web:2'])
})

test('parses and applies every Drax dynamic filter operator', () => {
    const service = services.find(({id}) => id === 'web')!
    service.stack = null
    service.createdAt = '2026-09-17T10:00:00Z'
    service.ports = [{hostPort: 8080, containerPort: 80, protocol: 'tcp', portsProtocol: 'tcp'}]

    assert.deepEqual(parseServiceFilters(JSON.stringify([
        {field: 'name', operator: 'ne', value: 'api'},
        {field: 'name', operator: 'in', value: ['web', 'worker']},
    ])).map(({operator}) => operator), ['ne', 'in'])
    assert.equal(matchesServiceFilters(service, [{field: 'stack', operator: 'empty', value: null}]), true)
    assert.equal(matchesServiceFilters(service, [{field: 'name', operator: 'like', value: 'WE'}]), true)
    assert.equal(matchesServiceFilters(service, [{field: 'ports', operator: 'like', value: '8080:80'}]), true)
    assert.equal(matchesServiceFilters(service, [{field: 'createdAt', operator: 'gte', value: '2026-09-17'}]), true)
    assert.equal(matchesServiceFilters(service, [{field: 'name', operator: 'nin', value: ['api', 'worker']}]), true)
    assert.equal(matchesServiceFilters(service, [{field: 'name', operator: 'lt', value: 'z'}]), true)
})
