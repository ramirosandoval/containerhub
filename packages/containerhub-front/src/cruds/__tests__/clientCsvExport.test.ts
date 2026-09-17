import assert from 'node:assert/strict'
import test from 'node:test'
import type {IDraxCrudProvider, IDraxPaginateOptions} from '@drax/crud-share'
import {withClientCsvExport} from '../clientCsvExport'

test('exports every filtered page as escaped CSV with nested values', async () => {
    const requestedPages: IDraxPaginateOptions[] = []
    const sourceProvider = new class implements IDraxCrudProvider<{name: string; namespace: {name: string}; tags: string[]}, never, never> {
        async paginate(options: IDraxPaginateOptions) {
            requestedPages.push(options)
            const rows = [
                {name: 'alpha;one', namespace: {name: 'team "A"'}, tags: ['latest', 'stable']},
                {name: 'beta', namespace: {name: 'team B'}, tags: []}
            ]
            return {items: rows.slice((options.page - 1) * options.limit, options.page * options.limit), total: rows.length, page: options.page, limit: options.limit}
        }
        async fetchAll() { return [] }
    }
    const provider = withClientCsvExport(sourceProvider, 1)
    assert.equal(typeof provider.paginate, 'function')

    const result = await provider.export!({
        format: 'CSV', headers: 'name,namespace.name,tags', headersTranslate: 'Name,Namespace,Tags',
        separator: ';', fileName: 'projects', orderBy: 'name', order: 'desc', search: 'team', filters: []
    })
    const bytes = new Uint8Array(await (await fetch(result.url)).arrayBuffer())
    const csv = new TextDecoder().decode(bytes.slice(3))

    assert.equal(result.rowCount, 2)
    assert.equal(result.fileName, 'projects.csv')
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf])
    assert.equal(csv, 'Name;Namespace;Tags\r\n"alpha;one";"team ""A""";latest, stable\r\nbeta;team B;')
    assert.deepEqual(requestedPages.map(({page, limit, orderBy, order, search}) => ({page, limit, orderBy, order, search})), [
        {page: 1, limit: 1, orderBy: 'name', order: 'desc', search: 'team'},
        {page: 2, limit: 1, orderBy: 'name', order: 'desc', search: 'team'}
    ])
    URL.revokeObjectURL(result.url)
})
