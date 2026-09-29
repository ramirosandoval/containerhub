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

async function authenticate(page: Page, permissions = ['DOCKER_VIEW']): Promise<void> {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'image-navigation-test',
    ].join('.')
    await page.addInitScript(({token, permissions: grantedPermissions}) => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken: token,
        authUser: {username: 'image-navigation-test', role: {permissions: grantedPermissions}},
    })), {token: accessToken, permissions})
    await page.route('**/api/docker/version', route => route.fulfill({json: {Version: 'test', ApiVersion: 'test'}}))
}

async function mockServices(page: Page): Promise<void> {
    await page.route('**/api/services**', route => route.abort())
    await page.route('**/graphql', route => route.fulfill({json: {data: route.request().postDataJSON().query.includes('paginateServices')
        ? {paginateServices: {items: [service], total: 1, page: 1, limit: 10}}
        : {fetchService: [service]}}}))
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
    await expect(page.getByText('team_api', {exact: true})).toBeVisible()

    const filteredRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/graphql')) return false
        const body = request.postDataJSON() as {query: string; variables?: {filters?: string}}
        if (!body.query.includes('paginateServices')) return false
        const filters = JSON.parse(body.variables?.filters ?? '[]') as Array<{field: string; value: string}>
        return filters.some(({field, value}) => field === 'image' && value === 'registry.example/team/api:2.4')
    })
    await page.getByRole('link', {name: /Ver servicios|View services/i}).click()
    await filteredRequest
    await expect.poll(() => new URL(page.url()).searchParams.get('image')).toBe('registry.example/team/api:2.4')
})

test('task summary text can be selected and copied without activating its links', async ({page, context}) => {
    await authenticate(page, ['DOCKER_VIEW', 'DOCKER_NODES_FETCH'])
    await page.route('**/api/docker/task/selection-task/inspect', route => route.fulfill({json: {
        ID: 'selection-task', ServiceID: 'selection-service', NodeID: 'selection-node',
        Status: {State: 'running', ContainerStatus: {ContainerID: 'selection-container'}},
        Spec: {ContainerSpec: {Image: 'registry.example/team/api:2.4'}}
    }}))
    await page.route('**/api/docker/service/selection-service', route => route.fulfill({json: {name: 'Selection service'}}))
    await page.goto('/inspect/selection-task')
    await expect(page.locator('.inspect-summary')).toBeVisible()
    await expect(page.locator('.inspect-heading')).toContainText('Selection service')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const texts = page.locator('.inspect-heading h1, .inspect-heading p, p[role="status"], .inspect-summary dt, .inspect-summary dd')
    for (let fieldIndex = 0; fieldIndex < await texts.count(); fieldIndex++) {
        const element = texts.nth(fieldIndex)
        const box = await element.boundingBox()
        expect(box, `field ${fieldIndex}`).not.toBeNull()
        await page.mouse.move(box!.x + 2, box!.y + 8)
        await page.mouse.down()
        await page.mouse.move(box!.x + 35, box!.y + 8, {steps: 8})
        await page.mouse.up()
        const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
        expect(selected.length, `field ${fieldIndex}`).toBeGreaterThan(0)
        await page.keyboard.press('ControlOrMeta+c')
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), {message: `field ${fieldIndex}`}).toBe(selected)
        await expect(page).toHaveURL(/\/inspect\/selection-task$/)
        await page.evaluate(() => window.getSelection()?.removeAllRanges())
    }
    for (const value of ['selection-node', 'registry.example/team/api:2.4']) {
        const points = await page.getByRole('link', {name: value, exact: true}).evaluate(link => {
            const text = link.firstChild!
            const first = document.createRange()
            first.setStart(text, 0)
            first.setEnd(text, 1)
            const last = document.createRange()
            last.setStart(text, text.textContent!.length - 1)
            last.setEnd(text, text.textContent!.length)
            const start = first.getBoundingClientRect()
            const end = last.getBoundingClientRect()
            return {start: {x: start.left, y: start.top + start.height / 2}, end: {x: end.right, y: end.top + end.height / 2}}
        })
        await page.mouse.move(points.start.x, points.start.y)
        await page.mouse.down()
        await page.mouse.move(points.end.x, points.end.y, {steps: 12})
        await page.mouse.up()
        expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(value)
        await page.keyboard.press('ControlOrMeta+c')
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value)
        await expect(page).toHaveURL(/\/inspect\/selection-task$/)
        await page.evaluate(() => window.getSelection()?.removeAllRanges())
    }
})

test('task node and image open their filtered lists', async ({page}) => {
    await authenticate(page, ['DOCKER_VIEW', 'DOCKER_NODES_FETCH'])
    const imageReference = '192.168.122.1:5000/team/api:2.4'
    await page.route('**/api/docker/task/selection-task/inspect', route => route.fulfill({json: {
        ID: 'selection-task', NodeID: 'selection-node', Spec: {ContainerSpec: {Image: imageReference}}
    }}))
    await page.route('**/api/docker/nodes', route => route.fulfill({json: [
        {id: 'selection-node', hostname: 'worker', leader: false, reachability: null},
        {id: 'another-node', hostname: 'other', leader: false, reachability: null}
    ]}))
    await page.route('**/api/registry/image**', route => {
        const requestPath = new URL(route.request().url()).pathname
        return route.fulfill({json: requestPath.endsWith('/tags') ? {tags: ['2.4']} : requestPath.endsWith('/details')
            ? {reference: '2.4', digest: 'sha256:test', mediaType: null, layerCount: 1, compressedSize: null, platforms: []}
            : [{name: 'team/api', tags: null}]})
    })
    await page.goto('/inspect/selection-task')
    await page.getByRole('link', {name: 'selection-node'}).click()
    await expect(page).toHaveURL(/\/nodes\?node=selection-node$/)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('selection-node')
    await expect(page.getByRole('main').getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(1)
    await page.goBack()
    await page.getByRole('link', {name: imageReference}).click()
    await expect(page).toHaveURL(/\/registry-images\?repository=team\/api&tag=2\.4/)
    await expect(page.getByRole('textbox', {name: 'Buscar', exact: true})).toHaveValue('team/api')
    await expect(page.getByText('sha256:test')).toBeVisible()
})

test('task node remains plain text without node-list permission', async ({page}) => {
    await authenticate(page)
    await page.route('**/api/docker/task/selection-task/inspect', route => route.fulfill({json: {ID: 'selection-task', NodeID: 'selection-node'}}))
    await page.goto('/inspect/selection-task')
    await expect(page.locator('.inspect-summary')).toContainText('selection-node')
    await expect(page.getByRole('link', {name: 'selection-node'})).toHaveCount(0)
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
    await expect(page.getByText('team_api · 2.4')).toBeVisible()
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
