import assert from 'node:assert/strict'
import test from 'node:test'
import {activeMonitoringFilters} from '../MonitoringFilters.js'

test('omits inactive monitoring filters before serializing the list request', () => {
    const filters = activeMonitoringFilters([
        {field: 'serviceName', operator: 'like', value: null},
        {field: 'status', operator: 'eq', value: null},
        {field: 'type', operator: 'eq', value: null},
        {field: 'collectionType', operator: 'eq', value: null},
        {field: 'status', operator: 'eq', value: 'monitoring'}
    ])

    assert.deepEqual(filters, [{field: 'status', operator: 'eq', value: 'monitoring'}])
})
