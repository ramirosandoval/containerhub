import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import YogaFastifyServer from '../../../../servers/YogaFastifyServer.js'
import {RegistryRoutes} from '../../routes/RegistryRoutes.js'
import {fetchImageDetails, fetchImages, fetchImageTags} from '../RegistryService.js'

beforeEach(() => { process.env.REGISTRY_URL = 'https://registry.example/v2/' })
afterEach(() => mock.restoreAll())

test('fetches and normalizes a tagged image manifest', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {size: 128},
        layers: [{size: 256}, {size: 512}],
    }), {
        headers: {
            'content-type': 'application/vnd.oci.image.manifest.v1+json',
            'docker-content-digest': 'sha256:abcdef',
        },
    }))

    assert.deepEqual(await fetchImageDetails('team/sub/api', '2.4'), {
        repository: 'team/sub/api',
        reference: '2.4',
        digest: 'sha256:abcdef',
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        schemaVersion: 2,
        kind: 'image',
        layerCount: 2,
        compressedSize: 896,
        platforms: [],
    })

    assert.equal(new URL(String(fetchMock.mock.calls[0].arguments[0])).pathname, '/v2/team/sub/api/manifests/2.4')
    const request = fetchMock.mock.calls[0].arguments[1] as RequestInit
    assert.match(String((request.headers as Record<string, string>).Accept), /application\/vnd\.oci\.image\.manifest/)
})

test('normalizes a multi-platform image index without inventing a total image size', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests: [{digest: 'sha256:amd64', platform: {os: 'linux', architecture: 'amd64'}}],
    })))

    const details = await fetchImageDetails('team/api', 'latest')
    assert.equal(details.kind, 'index')
    assert.equal(details.compressedSize, null)
    assert.deepEqual(details.platforms, [{digest: 'sha256:amd64', os: 'linux', architecture: 'amd64', variant: undefined}])
})

test('rejects unsafe repository and reference values before requesting the Registry', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'))
    await assert.rejects(fetchImageDetails(undefined as unknown as string, 'latest'), /repository/)
    await assert.rejects(fetchImageDetails('../secret', 'latest'), /repository/)
    await assert.rejects(fetchImageDetails('team/api', ''), /reference/)
    assert.equal(fetchMock.mock.callCount(), 0)
})

test('tags stay under the configured Registry and reject unsafe repository names', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({tags: ['latest']})))
    for (const name of ['https://other.example/path', '../secret', '/other']) {
        await assert.rejects(fetchImageTags(name), /repository/)
    }
    assert.equal(fetchMock.mock.callCount(), 0)

    assert.deepEqual(await fetchImageTags('team/sub/api'), {tags: ['latest']})
    assert.equal(new URL(String(fetchMock.mock.calls[0].arguments[0])).href, 'https://registry.example/v2/team/sub/api/tags/list')
})

test('includes every catalog and tag page returned by the Registry', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (url: URL) => {
        const isNext = url.searchParams.has('last')
        const isCatalog = url.pathname.endsWith('/_catalog')
        return new Response(JSON.stringify(isCatalog
            ? {repositories: [isNext ? 'second' : 'first']}
            : {name: 'team/api', tags: [isNext ? 'v2' : 'v1']}), {
            headers: isNext ? {} : {Link: `<${url.pathname}?n=1&last=${isCatalog ? 'first' : 'v1'}>; rel="next"`}
        })
    })
    assert.deepEqual(await fetchImages('1'), [{name: 'first', tags: null}, {name: 'second', tags: null}])
    assert.deepEqual(await fetchImageTags('team/api'), {name: 'team/api', tags: ['v1', 'v2']})
    assert.equal(fetchMock.mock.callCount(), 4)
})

test('rejects Registry pagination links outside the requested endpoint', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({repositories: ['first']}), {
        headers: {Link: '<https://other.example/v2/_catalog?n=1&last=first>; rel="next"'}
    }))
    await assert.rejects(fetchImages('1'), /pagination link/)
    assert.equal(fetchMock.mock.callCount(), 1)
})

test('rejects a Registry pagination loop even when the link adds a fragment', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({repositories: ['first']}), {
        headers: {Link: '</v2/_catalog?n=1#fragment>; rel="next"'}
    }))
    await assert.rejects(fetchImages('1'), /pagination link/)
    assert.equal(fetchMock.mock.callCount(), 1)
})

test('Registry routes reject missing image identifiers as client errors without fetching', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'))
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.addHook('onRequest', async (request: any) => { request.rbac = {assertPermission: () => undefined} })
    await server.register(RegistryRoutes)
    try {
        for (const path of ['/api/registry/image/tags', '/api/registry/image/details', '/api/registry/image/details?name=team%2Fapi']) {
            const response = await server.inject(path)
            assert.equal(response.statusCode, 400, `${path}: ${response.body}`)
        }
        assert.equal(fetchMock.mock.callCount(), 0)
    } finally {
        await server.close()
    }
})

test('Registry routes reject invalid repository names as client errors without fetching', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}'))
    const server = new YogaFastifyServer('type Query { ok: Boolean! }', {Query: {ok: () => true}}).fastify
    server.addHook('onRequest', async (request: any) => { request.rbac = {assertPermission: () => undefined} })
    await server.register(RegistryRoutes)
    try {
        for (const path of ['/api/registry/image/tags?name=..%2Fsecret', '/api/registry/image/details?name=..%2Fsecret&reference=latest']) {
            const response = await server.inject(path)
            assert.equal(response.statusCode, 400, `${path}: ${response.body}`)
        }
        assert.equal(fetchMock.mock.callCount(), 0)
    } finally {
        await server.close()
    }
})
