import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test, {mock} from 'node:test'

const calls: unknown[] = []
let fixtures = [
    {ID: 's-api', Spec: {Name: 'team_api', Labels: {'com.docker.stack.namespace': 'team'}, TaskTemplate: {ContainerSpec: {Image: 'team/api:2', Env: ['CONFIG=fixture'], Labels: {flag: 'fixture'}}}}},
    {ID: 's-worker', Spec: {Name: 'team_worker', Labels: {'com.docker.stack.namespace': 'team'}, TaskTemplate: {ContainerSpec: {Image: 'team/worker:1'}}}}
]
class DockerStub {
    listServices(options?: unknown) { calls.push(options); return Promise.resolve(fixtures) }
}
const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const {default: YogaFastifyServer} = await import('../../../../servers/YogaFastifyServer.js')
const {resolvers} = await import('../../resolvers/Service.resolvers.js')
const schema = readFileSync(new URL('../../graphql/Service.graphql', import.meta.url), 'utf8')
test.after(() => dockerMock.restore())

async function graphql(allowed: boolean, query: string, variables: object = {}) {
    const server = new YogaFastifyServer(schema, resolvers)
    server.fastify.addHook('onRequest', async (request: any) => {
        request.rbac = {assertPermission(permission: string) {
            assert.equal(permission, 'DOCKER_VIEW')
            if (!allowed) throw new Error('Forbidden')
        }}
    })
    try {
        const reply = await server.fastify.inject({method: 'POST', url: '/graphql', payload: {query, variables}})
        return reply.json() as {data?: any; errors?: unknown[]}
    } finally { await server.fastify.close() }
}
const query = `query ($page: Int!, $limit: Int!, $search: String, $filters: String) {
    paginateServices(page: $page, limit: $limit, search: $search, filters: $filters) {
        page limit total items { id name stack image { fullname tag } }
    }
}`
const optionsQuery = `query ($page: Int!, $limit: Int!, $stack: String, $order: ServiceOrder, $filters: String) {
    paginateServices(page: $page, limit: $limit, stack: $stack, order: $order, filters: $filters) {
        page limit total items { id name }
    }
}`

test('paginates and searches services via the existing Docker service', async () => {
    const response = await graphql(true, query, {page: 1, limit: 1, search: 'team', filters: JSON.stringify([{field: 'image', operator: 'like', value: 'api'}])})
    assert.equal(response.errors, undefined)
    assert.deepEqual(response.data?.paginateServices, {
        page: 1, limit: 1, total: 1,
        items: [{id: 's-api', name: 'team_api', stack: 'team', image: {fullname: 'team/api:2', tag: '2'}}]
    })
    assert.ok(calls.length)
})

test('denies the paginated query without DOCKER_VIEW', async () => {
    const response = await graphql(false, query, {page: 1, limit: 1})
    assert.ok(response.errors?.length)
    assert.equal(response.data, null)
})

test('never exposes configuration on the UI GraphQL type', async () => {
    const response = await graphql(true, '{ paginateServices(page: 1, limit: 1) { items { envs labels } } }')
    assert.ok(response.errors?.length)
    assert.equal(response.data?.paginateServices, undefined)
})

test('passes a stack label filter to Docker', async () => {
    calls.length = 0
    const response = await graphql(true, optionsQuery, {page: 1, limit: 10, stack: 'team'})
    assert.equal(response.errors, undefined)
    assert.deepEqual(calls[0], {filters: {label: ['com.docker.stack.namespace=team']}})
})

test('clamps page and limit and preserves descending order', async () => {
    const response = await graphql(true, optionsQuery, {page: 0, limit: 300, order: 'desc'})
    assert.equal(response.errors, undefined)
    assert.deepEqual(response.data?.paginateServices, {
        page: 1, limit: 200, total: 2,
        items: [{id: 's-worker', name: 'team_worker'}, {id: 's-api', name: 'team_api'}]
    })
})

test('rejects an invalid service filter', async () => {
    const response = await graphql(true, optionsQuery, {page: 1, limit: 10, filters: JSON.stringify([{field: 'envs', operator: 'eq', value: 'fixture'}])})
    assert.ok(response.errors?.length)
    assert.equal(response.data, null)
})

test('returns an empty page without invented services', async () => {
    const previousFixtures = fixtures
    fixtures = []
    try {
        const response = await graphql(true, optionsQuery, {page: 1, limit: 10})
        assert.equal(response.errors, undefined)
        assert.deepEqual(response.data?.paginateServices, {page: 1, limit: 10, total: 0, items: []})
    } finally { fixtures = previousFixtures }
})

test('image like accepts short and registry-qualified references', async () => {
    const previousFixtures = fixtures
    fixtures = [
        {ID: 's-primary', Spec: {Name: 'team_api', Labels: {'com.docker.stack.namespace': 'team'}, TaskTemplate: {ContainerSpec: {Image: 'registry.example/team/api:2.4'}}}},
        {ID: 's-other', Spec: {Name: 'other_api', Labels: {'com.docker.stack.namespace': 'team'}, TaskTemplate: {ContainerSpec: {Image: 'other.example/team/api:2.4'}}}},
        {ID: 's-old', Spec: {Name: 'team_old', Labels: {'com.docker.stack.namespace': 'team'}, TaskTemplate: {ContainerSpec: {Image: 'registry.example/team/api:1.0'}}}},
    ]
    try {
        for (const [reference, expectedNames] of [
            ['api:2.4', ['other_api', 'team_api']],
            ['registry.example/team/api:2.4', ['team_api']],
            ['registry.example/team/api:missing', []],
        ] as const) {
            const response = await graphql(true, optionsQuery, {
                page: 1, limit: 10,
                filters: JSON.stringify([{field: 'image', operator: 'like', value: reference}]),
            })
            assert.equal(response.errors, undefined)
            assert.equal(response.data?.paginateServices.total, expectedNames.length)
            assert.deepEqual(
                response.data?.paginateServices.items.map((service: {name: string}) => service.name).sort(),
                [...expectedNames].sort(),
            )
        }
    } finally {
        fixtures = previousFixtures
    }
})
