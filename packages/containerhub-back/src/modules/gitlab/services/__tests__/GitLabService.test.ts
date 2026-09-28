import assert from 'node:assert/strict'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {fetchProjectTags, fetchProjects, fetchTagPipeline} from '../GitLabService.js'

beforeEach(() => {
    process.env.GITLAB_URL = 'https://gitlab.example/api/v4/'
    process.env.GITLAB_TOKEN = 'test-token'
})

afterEach(() => mock.restoreAll())

test('forwards project search and activity ordering to GitLab', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([{id: 1}]), {
        headers: {'content-type': 'application/json', 'x-total': '1'},
    }))

    const response = await fetchProjects({page: '2', perPage: '25', search: 'team api'})

    assert.equal(response.totalItems, 1)
    assert.deepEqual(response.items, [{id: 1}])
    const requestedUrl = new URL(String(fetchMock.mock.calls[0].arguments[0]))
    assert.equal(requestedUrl.pathname, '/api/v4/projects/')
    assert.equal(requestedUrl.searchParams.get('page'), '2')
    assert.equal(requestedUrl.searchParams.get('per_page'), '25')
    assert.equal(requestedUrl.searchParams.get('search'), 'team api')
    assert.equal(requestedUrl.searchParams.get('order_by'), 'last_activity_at')
    assert.equal(requestedUrl.searchParams.get('sort'), 'desc')
})

test('omits an empty project search', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('[]', {headers: {'x-total': '0'}}))

    await fetchProjects({search: '  '})

    const requestedUrl = new URL(String(fetchMock.mock.calls[0].arguments[0]))
    assert.equal(requestedUrl.searchParams.has('search'), false)
})

test('returns GitLab tags from every linked page', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (url: URL) => {
        const next = url.searchParams.get('page') === '2'
        return new Response(JSON.stringify([{name: next ? 'v2' : 'v1'}]), {
            headers: next ? {} : {Link: `<${url.origin}${url.pathname}?page=2&per_page=100>; rel="next"`}
        })
    })
    assert.deepEqual(await fetchProjectTags('team/api'), [{name: 'v1'}, {name: 'v2'}])
    assert.equal(new URL(String(fetchMock.mock.calls[0].arguments[0])).pathname, '/api/v4/projects/team%2Fapi/repository/tags')
    assert.equal(fetchMock.mock.callCount(), 2)
})

test('never forwards the GitLab token to a foreign pagination link', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('[]', {
        headers: {Link: '<https://other.example/collect>; rel="next"'}
    }))
    await assert.rejects(fetchProjectTags('7'), /pagination link/)
    assert.equal(fetchMock.mock.callCount(), 1)
})

test('never sends the GitLab token across an HTTP redirect, including a tag continuation', async (context) => {
    const receivedTokens: unknown[] = []
    const foreignServer = createServer((request, response) => {
        receivedTokens.push(request.headers['private-token'])
        response.setHeader('content-type', 'application/json')
        response.end('[]')
    })
    foreignServer.listen(0, '127.0.0.1')
    await once(foreignServer, 'listening')
    const foreignAddress = foreignServer.address()
    assert.ok(foreignAddress && typeof foreignAddress !== 'string')

    const gitLabServer = createServer((request, response) => {
        assert.equal(request.headers['private-token'], 'test-token')
        if (request.url?.includes('/repository/tags') && !request.url.includes('page=2')) {
            const gitLabAddress = gitLabServer.address()
            assert.ok(gitLabAddress && typeof gitLabAddress !== 'string')
            const pathname = new URL(request.url, 'http://localhost').pathname
            response.setHeader('Link', `<http://127.0.0.1:${gitLabAddress.port}${pathname}?page=2>; rel="next"`)
            response.setHeader('content-type', 'application/json')
            response.end('[{"name":"v1"}]')
            return
        }
        response.writeHead(302, {Location: `http://127.0.0.1:${foreignAddress.port}/collect`})
        response.end()
    })
    gitLabServer.listen(0, '127.0.0.1')
    await once(gitLabServer, 'listening')
    context.after(async () => {
        await Promise.all([gitLabServer, foreignServer].map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    })
    const gitLabAddress = gitLabServer.address()
    assert.ok(gitLabAddress && typeof gitLabAddress !== 'string')
    process.env.GITLAB_URL = `http://127.0.0.1:${gitLabAddress.port}/api/v4/`

    await assert.rejects(fetchProjects(), /redirect/i)
    await assert.rejects(fetchProjectTags('7'), /redirect/i)
    await assert.rejects(fetchTagPipeline('7', 'v1'), /redirect/i)
    assert.deepEqual(receivedTokens, [])
})

test('returns the latest tag pipeline and its jobs', async () => {
    const responses = [
        new Response(JSON.stringify([{
            id: 321,
            iid: 44,
            ref: 'release/2.4',
            sha: 'abcdef123456',
            status: 'success',
            source: 'push',
            web_url: 'https://gitlab.example/team/api/-/pipelines/321',
            created_at: '2026-09-22T10:00:00Z',
            updated_at: '2026-09-22T10:05:00Z',
        }])),
        new Response(JSON.stringify([
            {id: 9002, name: 'deploy', stage: 'deploy', status: 'success', allow_failure: false, web_url: 'https://gitlab.example/team/api/-/jobs/9002', started_at: '2026-09-22T10:03:00Z', finished_at: '2026-09-22T10:05:00Z'},
            {id: 9001, name: 'test', stage: 'test', status: 'failed', allow_failure: true, web_url: 'https://gitlab.example/team/api/-/jobs/9001', started_at: '2026-09-22T10:01:00Z', finished_at: '2026-09-22T10:03:00Z'},
        ]))
    ]
    const fetchMock = mock.method(globalThis, 'fetch', async () => responses.shift()!)

    const pipeline = await fetchTagPipeline('7', 'release/2.4')

    assert.equal(pipeline.tag, 'release/2.4')
    assert.equal(pipeline.pipeline?.id, 321)
    assert.equal(pipeline.pipeline?.status, 'success')
    assert.equal(pipeline.jobs.length, 2)
    assert.equal(pipeline.jobs[0].name, 'deploy')
    assert.equal(pipeline.jobs[1].allowFailure, true)

    const pipelinesUrl = new URL(String(fetchMock.mock.calls[0].arguments[0]))
    assert.equal(pipelinesUrl.pathname, '/api/v4/projects/7/pipelines')
    assert.equal(pipelinesUrl.searchParams.get('ref'), 'release/2.4')
    assert.equal(pipelinesUrl.searchParams.get('scope'), 'tags')
    assert.equal(pipelinesUrl.searchParams.get('per_page'), '1')
    assert.equal(pipelinesUrl.searchParams.get('order_by'), 'id')
    assert.equal(pipelinesUrl.searchParams.get('sort'), 'desc')

    const jobsUrl = new URL(String(fetchMock.mock.calls[1].arguments[0]))
    assert.equal(jobsUrl.pathname, '/api/v4/projects/7/pipelines/321/jobs')
    assert.equal(jobsUrl.searchParams.get('include_retried'), 'true')
    assert.equal(jobsUrl.searchParams.get('per_page'), '100')
})

test('returns an empty state when the selected tag has no pipeline', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('[]'))

    const pipeline = await fetchTagPipeline('7', 'v1.0.0')

    assert.deepEqual(pipeline, {tag: 'v1.0.0', pipeline: null, jobs: []})
    assert.equal(fetchMock.mock.callCount(), 1)
})
