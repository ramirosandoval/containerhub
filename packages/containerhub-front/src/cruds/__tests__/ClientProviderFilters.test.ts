import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const providers = await Promise.all(
    ['NodesCrud', 'StacksCrud', 'GhostContainersCrud', 'RegistryImagesCrud', 'NetworksCrud']
        .map(async (crudName) => [crudName, await readFile(new URL(`../${crudName}.ts`, import.meta.url), 'utf8')] as const),
)

test('full-inventory providers apply Drax field filters before pagination', () => {
    for (const [crudName, source] of providers) {
        assert.match(source, /applyClientFieldFilters\(/, `${crudName} must apply field filters`)
        assert.ok(
            source.indexOf('applyClientFieldFilters(') < source.indexOf('const start ='),
            `${crudName} must filter before slicing the page`,
        )
    }
})
