import assert from 'node:assert/strict'
import {readFile, readdir} from 'node:fs/promises'
import test from 'node:test'

test('service operations are stored as separate GraphQL documents with one shared fragment', async () => {
    const [fetchDocument, paginateDocument, fragmentDocument, serviceClient] = await Promise.all([
        readFile(new URL('../graphql/FetchServices.graphql', import.meta.url), 'utf8'),
        readFile(new URL('../graphql/PaginateServices.graphql', import.meta.url), 'utf8'),
        readFile(new URL('../graphql/ServiceFields.graphql', import.meta.url), 'utf8'),
        readFile(new URL('../serviceGraphql.ts', import.meta.url), 'utf8')
    ])
    assert.match(fetchDocument, /^query FetchServices\b/m)
    assert.match(fetchDocument, /\.\.\.ServiceFields/)
    assert.match(paginateDocument, /^query PaginateServices\b/m)
    assert.match(paginateDocument, /\.\.\.ServiceFields/)
    assert.match(fragmentDocument, /^fragment ServiceFields on Service\b/m)
    assert.match(serviceClient, /FetchServices\.graphql\?raw/)
    assert.match(serviceClient, /PaginateServices\.graphql\?raw/)
    assert.match(serviceClient, /ServiceFields\.graphql\?raw/)
    assert.doesNotMatch(serviceClient, /`(?:query|fragment)\b/)
})

test('frontend-owned GraphQL operations are never embedded in TS or Vue files', async () => {
    const frontendSource = new URL('../../', import.meta.url)
    for (const relativePath of await readdir(frontendSource, {recursive: true})) {
        if (!/\.(?:ts|vue)$/.test(relativePath) || relativePath.split('/').includes('__tests__')) continue
        const source = await readFile(new URL(relativePath, frontendSource), 'utf8')
        assert.doesNotMatch(source, /`\s*(?:query|mutation|subscription|fragment)\b|(?:^|[^/\w])(?:gql|graphql)\s*`/m, relativePath)
    }
})
