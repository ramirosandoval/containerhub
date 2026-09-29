import {expect, test, type Page} from '@playwright/test'

const services = [
    {id: 'service-alpha', name: 'team_alpha', stack: 'team', image: {name: 'alpha', nameWithTag: 'alpha:1', namespace: null, domain: null, fullname: 'alpha:1', tag: '1'}, ports: [], createdAt: null, updatedAt: null},
    {id: 'service-beta', name: 'other_beta', stack: 'other', image: {name: 'beta', nameWithTag: 'beta:1', namespace: null, domain: null, fullname: 'beta:1', tag: '1'}, ports: [], createdAt: null, updatedAt: null}
]

async function mockServices(page: Page, allServices = services): Promise<void> {
    const token = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'single-result-test'
    ].join('.')
    await page.addInitScript(accessToken => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken, authUser: {username: 'single-result-test', role: {permissions: ['DOCKER_VIEW']}}
    })), token)
    await page.route('**/api/**', route => route.abort())
    await page.route('**/api/docker/version', route => route.fulfill({json: {}}))
    await page.route('**/api/docker/nodes', route => route.fulfill({json: []}))
    for (const service of allServices) {
        await page.route(`**/api/docker/tasks/${service.id}`, route => route.fulfill({json: [
            {id: `task-${service.id}`, nodeId: 'node-1', state: 'running'}
        ]}))
    }
    await page.route('**/graphql', route => {
        const {query, variables} = route.request().postDataJSON() as {
            query: string
            variables?: {search?: string; filters?: string}
        }
        if (!query.includes('paginateServices')) {
            return route.fulfill({json: {data: {fetchService: allServices}}})
        }
        const filters = JSON.parse(variables?.filters ?? '[]') as Array<{field: string; value: unknown}>
        const stack = filters.find(filter => filter.field === 'stack')?.value
        const matching = allServices.filter(service =>
            service.name.includes(variables?.search ?? '') && (!stack || service.stack === stack))
        return route.fulfill({json: {data: {paginateServices: {
            items: matching, total: matching.length, page: 1, limit: 10
        }}}})
    })
}

const serviceRows = (page: Page) => page.locator('main .v-data-table__tbody').first().locator(':scope > tr')
const tasksTable = (page: Page) => page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]')

test('search with one result opens its tasks and keeps manual collapse working', async ({page}) => {
    await mockServices(page)
    let taskRequests = 0
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/docker/tasks/service-alpha') taskRequests++
    })
    await page.goto('/services')
    await expect(serviceRows(page)).toHaveCount(2)
    await expect(tasksTable(page)).toHaveCount(0)

    const search = page.getByRole('textbox', {name: 'Buscar'})
    await search.fill('team_alpha')
    await expect(tasksTable(page).getByText('task-service-alpha')).toBeVisible()
    await expect.poll(() => taskRequests).toBe(1)

    await serviceRows(page).first().getByRole('button').first().click()
    await expect(tasksTable(page)).toHaveCount(0)
    await serviceRows(page).first().getByRole('button').first().click()
    await expect(tasksTable(page).getByText('task-service-alpha')).toBeVisible()
    expect(taskRequests).toBe(1)

    await search.fill('nobody')
    await expect(tasksTable(page)).toHaveCount(0)
    await search.fill('')
    await expect(serviceRows(page)).toHaveCount(2)
    await expect(tasksTable(page)).toHaveCount(0)
})

test('stack deep link with one result opens its tasks', async ({page}) => {
    await mockServices(page)
    await page.goto('/services?stack=team')
    await expect(tasksTable(page).getByText('task-service-alpha')).toBeVisible()
    await expect(serviceRows(page).first()).toContainText('team_alpha')
})

test('one unfiltered service stays closed until manually expanded', async ({page}) => {
    await mockServices(page, [services[0]!])
    await page.goto('/services')
    await expect(serviceRows(page)).toHaveCount(1)
    await expect(tasksTable(page)).toHaveCount(0)
    await serviceRows(page).first().getByRole('button').first().click()
    await expect(tasksTable(page).getByText('task-service-alpha')).toBeVisible()
})
