import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {filterNetworks} from '../networkFilters.js'

const networks = [
    {
        Name: 'Frontend_Overlay',
        Created: '2026-09-02T23:30:00.000Z',
        Driver: 'overlay',
        Attachable: true,
        IPAM: {Config: [{Subnet: '10.10.0.0/24'}]}
    },
    {
        Name: 'bridge_local',
        Created: '2026-08-01T10:00:00.000Z',
        Driver: 'bridge',
        Attachable: false,
        IPAM: {Config: [{Subnet: '172.18.0.0/16'}]}
    }
]

test('filters networks by name, driver, attachable state, inclusive dates and subnet', () => {
    assert.deepEqual(filterNetworks(networks, {
        name: 'FRONTEND',
        driver: 'overlay',
        attachable: true,
        since: '2026-09-02',
        until: '2026-09-02',
        subnet: '10.10'
    }), [networks[0]])

    assert.deepEqual(filterNetworks(networks, {attachable: false}), [networks[1]])
})

test('network page exposes explicit apply/reset, manual refresh and Drax date formatting', async () => {
    const page = await readFile(new URL('../NetworksPage.vue', import.meta.url), 'utf8')

    assert.match(page, /@click="applyFilters"/)
    assert.match(page, /@click="resetFilters"/)
    assert.match(page, /@click="fetchNetworks"/)
    assert.match(page, /formatDateTime/)
    assert.match(page, /type="date"/)
})
