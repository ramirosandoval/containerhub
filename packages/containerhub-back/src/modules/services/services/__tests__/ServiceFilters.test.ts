import assert from 'node:assert/strict'
import test from 'node:test'
import type {ServiceModel} from '../../helpers/mapInspectToServiceModel.js'

test('pure filter module retains parsing and matching without Docker', async () => {
    const {parseServiceFilters, matchesServiceFilters} = await import('../ServiceFilters.js')
    const filters = parseServiceFilters('[{"field":"stack","operator":"empty","value":null}]')
    const service: ServiceModel = {
        id: 'service-1', name: 'api', stack: null, createdAt: null, updatedAt: null, ports: [],
        image: {name: 'api', nameWithTag: 'api:latest', namespace: null, domain: null, fullname: 'api:latest', tag: 'latest'}
    }
    assert.equal(matchesServiceFilters(service, filters), true)
})
