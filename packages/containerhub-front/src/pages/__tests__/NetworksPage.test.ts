import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('network page uses the Drax filter and column controls', async () => {
    const [page, crud] = await Promise.all([
        readFile(new URL('../NetworksPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/NetworksCrud.ts', import.meta.url), 'utf8')
    ])

    assert.match(page, /auto-crud-filters/)
    assert.match(page, /#filter\.attachable/)
    assert.match(page, /<v-select/)
    assert.match(page, /attachableOptions/)
    assert.match(page, /setAttachableFilter/)
    assert.doesNotMatch(page, /crud-filters-action/)
    assert.doesNotMatch(page, /<v-card-text[^>]+id="crud-list-table-filters-section"/)
    assert.match(crud, /isColumnSelectable[^\n]*true/)
    assert.match(crud, /dynamicFiltersEnable[^\n]*true/)
    assert.match(crud, /filterButtons[^\n]*false/)
    assert.match(page, /formatDateTime/)
})
