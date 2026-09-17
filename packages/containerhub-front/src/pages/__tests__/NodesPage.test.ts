import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {formatNodeResources} from '../nodeResources.js'

const swarmManagerResources = {NanoCPUs: 4_000_000_000, MemoryBytes: 8_589_934_592}

test('formats Docker node CPU and memory resources like the original cluster view', () => {
    assert.equal(formatNodeResources(swarmManagerResources), '4 CPU / 8.00 GB')
    assert.equal(formatNodeResources(null), '—')
})

test('node page displays the resources returned by the existing API', async () => {
    const [page, crud] = await Promise.all([
        readFile(new URL('../NodesPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/NodesCrud.ts', import.meta.url), 'utf8')
    ])

    assert.match(crud, /title: 'resources', key: 'resources'/)
    assert.match(page, /#item\.resources/)
    assert.match(page, /formatNodeResources/)
})

test('node page displays healthy, unavailable and unconfigured agent states', async () => {
    const [page, crud] = await Promise.all([
        readFile(new URL('../NodesPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/NodesCrud.ts', import.meta.url), 'utf8')
    ])

    assert.match(crud, /title: 'agentHealthy', key: 'agentHealthy'/)
    assert.match(page, /#item\.agentHealthy/)
    assert.match(page, /value === true/)
    assert.match(page, /value === false/)
})
