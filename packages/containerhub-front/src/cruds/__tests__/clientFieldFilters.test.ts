import assert from 'node:assert/strict'
import test from 'node:test'
import {applyClientFieldFilters} from '../clientFieldFilters.ts'

const rows = [
    {name: 'API', active: false, tags: ['stable', 'blue'], nested: {count: 10}, createdAt: '2026-09-17T10:00:00Z'},
    {name: 'worker', active: true, tags: ['canary'], nested: {count: 20}, createdAt: '2026-09-18T10:00:00Z'},
    {name: '', active: true, tags: [], nested: {count: 30}, createdAt: null},
]

test('applies Drax equality, contains and empty operators without losing false', () => {
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'active', operator: 'eq', value: false},
        {field: 'name', operator: 'like', value: 'ap'},
    ]), [rows[0]])
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'name', operator: 'empty', value: null},
    ]), [rows[2]])
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'active', operator: 'ne', value: false},
    ]), [rows[1], rows[2]])
})

test('applies nested comparisons and combines filters with AND', () => {
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'nested.count', operator: 'gte', value: 20},
        {field: 'createdAt', operator: 'lte', value: new Date('2026-09-18T10:00:00Z')},
    ]), [rows[1]])
})

test('applies in and nin to scalar and array values', () => {
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'tags', operator: 'in', value: ['blue', 'green']},
    ]), [rows[0]])
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'name', operator: 'nin', value: ['API', 'worker']},
    ]), [rows[2]])
})

test('ignores incomplete filters and supports provider field resolvers', () => {
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: '', operator: 'eq', value: ''},
        {field: 'name', operator: 'eq', value: null},
    ]), rows)
    assert.deepEqual(applyClientFieldFilters(rows, [
        {field: 'displayName', operator: 'eq', value: 'API'},
    ], (row, field) => field === 'displayName' ? row.name : undefined), [rows[0]])
})
