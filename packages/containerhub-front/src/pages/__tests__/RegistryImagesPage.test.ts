import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('Registry renders compact expandable rows and preserves image deep links', async () => {
    const [page, details, crud] = await Promise.all([
        readFile(new URL('../RegistryImagesPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../components/RegistryImageDetails.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/RegistryImagesCrud.ts', import.meta.url), 'utf8'),
    ])
    assert.match(page, /v-data-table-server/)
    assert.match(page, /show-expand/)
    assert.match(page, /#item\.data-table-expand=/)
    assert.match(page, /#expanded-row=/)
    assert.match(page, /RegistryImageDetails/)
    assert.match(page, /route\.query\.repository/)
    assert.match(page, /route\.query\.tag/)
    assert.match(details, /\/api\/registry\/image\/tags/)
    assert.match(details, /\/api\/registry\/image\/details/)
    assert.doesNotMatch(page, /v-for="tag in imageTags/)
    assert.doesNotMatch(page, /#item\.tags/)
    assert.doesNotMatch(crud, /title: 'tags', key: 'tags'/)
})
