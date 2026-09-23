import {expect, test, type Page} from '@playwright/test'

const service = {
    id: 'service-1',
    name: 'team_api',
    stack: 'team',
    image: {
        name: 'api',
        nameWithTag: 'team/api:2.4',
        namespace: 'team',
        domain: 'registry.example',
        fullname: 'registry.example/team/api:2.4',
        tag: '2.4',
    },
    ports: [],
    createdAt: null,
    updatedAt: null,
}

async function authenticate(page: Page): Promise<void> {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'image-navigation-test',
    ].join('.')
    await page.addInitScript(({token}) => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken: token,
        authUser: {username: 'image-navigation-test', role: {permissions: ['DOCKER_VIEW']}},
    })), {token: accessToken})
}

async function mockServices(page: Page): Promise<void> {
    await page.route('**/api/services**', async (route) => {
        const url = new URL(route.request().url())
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(url.pathname.endsWith('/paginate')
                ? {items: [service], total: 1, page: 1, limit: 10}
                : [service]),
        })
    })
}

test('opens the deployed service image in Registry with its tag and manifest details', async ({page}) => {
    await authenticate(page)
    await mockServices(page)
    await page.route('**/api/registry/image**', async (route) => {
        const url = new URL(route.request().url())
        const body = url.pathname.endsWith('/tags')
            ? {name: 'team/api', tags: ['2.4', 'latest']}
            : url.pathname.endsWith('/details')
                ? {repository: 'team/api', reference: '2.4', digest: 'sha256:abc', mediaType: 'application/vnd.oci.image.manifest.v1+json', schemaVersion: 2, kind: 'image', layerCount: 3, compressedSize: 4096, platforms: []}
                : [{name: 'team/api', tags: null}]
        await route.fulfill({contentType: 'application/json', body: JSON.stringify(body)})
    })

    await page.goto('/services')
    await page.locator('.v-chip').filter({hasText: 'team/api:2.4'}).click()

    await expect(page).toHaveURL(/\/registry-images\?repository=team\/api&tag=2\.4/)
    await expect(page.getByText('sha256:abc', {exact: true})).toBeVisible()
    await expect(page.getByText('2.4', {exact: true}).first()).toBeVisible()
})

test('searches GitLab projects and shows the selected tag pipeline jobs', async ({page}) => {
    await authenticate(page)
    await mockServices(page)
    await page.route('**/api/gitlab/project**', async (route) => {
        const url = new URL(route.request().url())
        const body = url.pathname.endsWith('/tags')
            ? [{name: 'v2.4'}]
            : url.pathname.endsWith('/tag-pipeline')
                ? {
                    tag: 'v2.4',
                    pipeline: {id: 321, iid: 44, ref: 'v2.4', sha: 'abcdef123456', status: 'success', source: 'push', webUrl: 'https://gitlab.example/team/api/-/pipelines/321', createdAt: '2026-09-22T10:00:00Z', updatedAt: '2026-09-22T10:05:00Z'},
                    jobs: [
                        {id: 9001, name: 'build_app', stage: 'build', status: 'success', allowFailure: false, webUrl: 'https://gitlab.example/team/api/-/jobs/9001', startedAt: null, finishedAt: null},
                        {id: 9002, name: 'deploy_staging', stage: 'deploy', status: 'manual', allowFailure: true, webUrl: 'https://gitlab.example/team/api/-/jobs/9002', startedAt: null, finishedAt: null},
                    ],
                }
                : {items: [{id: 7, name: 'api', path_with_namespace: 'team/api', description: 'Team API', web_url: 'https://gitlab.example/team/api', last_activity_at: '2026-09-22T12:00:00Z', container_registry_image_prefix: 'registry.example/team/api'}], totalItems: 1}
        await route.fulfill({contentType: 'application/json', body: JSON.stringify(body)})
    })

    await page.goto('/gitlab-projects')
    const search = page.getByRole('textbox').first()
    const searchRequest = page.waitForRequest((request) => request.url().includes('/api/gitlab/project?') && new URL(request.url()).searchParams.get('search') === 'team api')
    await search.fill('team api')
    await searchRequest
    await page.getByRole('button', {name: /Ver detalles|View details/}).click()

    await expect(page.getByText(/Seleccioná un tag|Select a tag/)).toBeVisible()
    const pipelineRequest = page.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname.endsWith('/tag-pipeline') && url.searchParams.get('tag') === 'v2.4'
    })
    await page.getByText('v2.4', {exact: true}).click()
    await pipelineRequest
    await expect(page.getByText('build_app', {exact: true})).toBeVisible()
    await expect(page.getByText('deploy_staging', {exact: true})).toBeVisible()
    await expect(page.getByText('manual', {exact: true})).toBeVisible()
    await expect(page.getByText(/Container Scanning/i)).toHaveCount(0)
})
