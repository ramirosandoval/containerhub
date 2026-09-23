import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {fetchImageDetails} from '../RegistryService.js'

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
