import assert from 'node:assert/strict'
import test from 'node:test'
import {buildServiceFilterOptions} from '../ServiceFilterOptions.ts'

test('builds unique Stack and Image filter options from all services', () => {
    assert.deepEqual(buildServiceFilterOptions([
        {stack: 'beta', image: {nameWithTag: 'registry/api:1'}},
        {stack: 'alpha', image: {nameWithTag: 'registry/web:1'}},
        {stack: 'beta', image: {nameWithTag: 'registry/api:1'}},
        {stack: null, image: {nameWithTag: ''}}
    ]), {
        stacks: ['alpha', 'beta'],
        images: ['registry/api:1', 'registry/web:1']
    })
})
