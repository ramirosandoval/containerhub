import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {filterNetworks, networkFiltersFromDrax} from '../networkFilters.js'

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

test('adapts Drax field filters without losing false or local dates', () => {
    assert.deepEqual(networkFiltersFromDrax([
        {field: 'name', value: 'front'},
        {field: 'attachable', value: false},
        {field: 'created', operator: 'gte', value: new Date(2026, 8, 2)},
        {field: 'created', operator: 'lte', value: '2026-09-03'},
    ]), {name: 'front', attachable: false, since: '2026-09-02', until: '2026-09-03'})
})

test('network page uses the Drax filter and column controls', async () => {
    const [page, crud] = await Promise.all([
        readFile(new URL('../NetworksPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/NetworksCrud.ts', import.meta.url), 'utf8')
    ])

    assert.match(page, /auto-crud-filters/)
    assert.doesNotMatch(page, /crud-filters-action/)
    assert.doesNotMatch(page, /<v-card-text[^>]+id="crud-list-table-filters-section"/)
    assert.match(crud, /isColumnSelectable[^\n]*true/)
    assert.match(crud, /dynamicFiltersEnable[^\n]*true/)
    assert.match(crud, /filterButtons[^\n]*false/)
    assert.match(page, /formatDateTime/)
})
