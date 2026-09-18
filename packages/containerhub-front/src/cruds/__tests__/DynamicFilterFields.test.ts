import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const crudSources = Object.fromEntries(await Promise.all(
    ['ServiceCrud', 'MonitoringCrud', 'NetworksCrud', 'GitLabProjectsCrud'].map(async (crudName) => [
        crudName,
        await readFile(new URL(`../${crudName}.ts`, import.meta.url), 'utf8'),
    ]),
))

function fieldNames(source: string): string[] {
    const methodStart = source.indexOf('override get fields')
    const arrayStart = source.indexOf('[', source.indexOf('return', methodStart))
    let depth = 0
    let arrayEnd = arrayStart
    for (; arrayEnd < source.length; arrayEnd += 1) {
        if (source[arrayEnd] === '[') depth += 1
        if (source[arrayEnd] === ']' && --depth === 0) break
    }
    const fields = source.slice(arrayStart, arrayEnd + 1)
    return [...fields.matchAll(/\{name: '([^']+)'/g)].map((match) => match[1])
}

test('dynamic filter metadata matches the filterable provider fields', () => {
    assert.deepEqual(fieldNames(crudSources.ServiceCrud), [
        'id', 'name', 'stack', 'image', 'ports', 'createdAt', 'updatedAt',
    ])
    assert.deepEqual(fieldNames(crudSources.MonitoringCrud), [
        'serviceName', 'status', 'type', 'collectionType',
    ])
    assert.deepEqual(fieldNames(crudSources.NetworksCrud), [
        'name', 'created', 'driver', 'attachable', 'subnet',
    ])
    assert.match(crudSources.GitLabProjectsCrud, /dynamicFiltersEnable[^\n]*false/)
})
