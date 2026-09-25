import assert from 'node:assert/strict'
import {mock, test} from 'node:test'
import type {IDraxPaginateOptions} from '@drax/crud-share'

mock.module('@drax/crud-vue', {namedExports: {EntityCrud: class {}}})
mock.module('../../services/serviceGraphql.js', {
    namedExports: {
        fetchAllServices: async () => [
            ...Array.from({length: 2}, () => ({stack: 'small'})),
            ...Array.from({length: 10}, () => ({stack: 'large'}))
        ]
    }
})
const {StacksCrud} = await import('../StacksCrud.js')

test('stack counts sort numerically in both directions', async () => {
    const options = {page: 1, limit: 10, orderBy: 'services', order: 'asc'} as IDraxPaginateOptions
    const ascending = await StacksCrud.instance.provider.paginate(options)
    const descending = await StacksCrud.instance.provider.paginate({...options, order: 'desc'})

    assert.deepEqual(ascending.items.map(item => item.services), [2, 10])
    assert.deepEqual(descending.items.map(item => item.services), [10, 2])
})
