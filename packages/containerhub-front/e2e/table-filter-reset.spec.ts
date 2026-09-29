import {expect, test, type Page} from '@playwright/test'

async function authenticate(page: Page): Promise<void> {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'table-filter-reset-test'
    ].join('.')
    await page.addInitScript(token => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken: token,
        authUser: {username: 'table-filter-reset-test', role: {permissions: ['DOCKER_VIEW', 'DOCKER_MONITORING_CREATE']}}
    })), accessToken)
    await page.route('**/api/**', route => route.abort())
    await page.route('**/api/docker/version', route => route.fulfill({json: {}}))
}

async function leaveAndReturn(page: Page): Promise<void> {
    await page.locator('.v-app-bar-title').click()
    await expect(page).toHaveURL(/\/$/)
    await page.goBack()
}

const services = [
    {id: 'service-alpha', name: 'team_alpha', stack: 'team', image: {name: 'alpha', nameWithTag: 'alpha:1', namespace: null, domain: null, fullname: 'alpha:1', tag: '1'}, ports: [], createdAt: null, updatedAt: null},
    {id: 'service-beta', name: 'team_beta', stack: 'team', image: {name: 'beta', nameWithTag: 'beta:1', namespace: null, domain: null, fullname: 'beta:1', tag: '1'}, ports: [], createdAt: null, updatedAt: null}
]

test('Services clears search and field filters on a new visit', async ({page}) => {
    await authenticate(page)
    await page.route('**/graphql', route => {
        const request = route.request().postDataJSON() as {query: string; variables?: {search?: string}}
        if (!request.query.includes('paginateServices')) return route.fulfill({json: {data: {fetchService: services}}})
        const matching = services.filter(service => service.name.includes(request.variables?.search ?? ''))
        return route.fulfill({json: {data: {paginateServices: {items: matching, total: matching.length, page: 1, limit: 10}}}})
    })
    await page.goto('/services')
    const rows = page.locator('main tbody > tr')
    await expect(rows).toHaveCount(2)
    await page.getByRole('textbox', {name: 'Buscar'}).fill('team_alpha')
    await expect(rows).toHaveCount(1)
    await page.locator('#crud-filter-button').click()
    await expect(page.locator('#crud-list-table-default-filters')).toBeVisible()
    await page.locator('#crud-filter-column-ports input').fill('8080')

    await leaveAndReturn(page)
    await expect(page).toHaveURL(/\/services$/)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('')
    await expect(page.locator('#crud-list-table-default-filters')).toBeVisible()
    await expect(page.locator('#crud-filter-column-ports input')).toHaveValue('')
    await expect(rows).toHaveCount(2)
})

const configurations = [
    {_id: 'configuration-alpha', serviceId: 'service-alpha', serviceName: 'team_alpha', serviceStack: 'team', type: 'permanent', status: 'monitoring', collectionInterval: '15s', collectionType: 'replic', since: null, until: null, holdingTime: 30},
    {_id: 'configuration-beta', serviceId: 'service-beta', serviceName: 'team_beta', serviceStack: 'team', type: 'permanent', status: 'monitoring', collectionInterval: '15s', collectionType: 'replic', since: null, until: null, holdingTime: 30}
]

test('Monitoring clears search and field filters on a new visit', async ({page}) => {
    await authenticate(page)
    await page.route('**/api/monitoring-configurations**', route => {
        const url = new URL(route.request().url())
        if (url.pathname !== '/api/monitoring-configurations') return route.abort()
        const matching = configurations.filter(configuration => configuration.serviceName.includes(url.searchParams.get('search') ?? ''))
        return route.fulfill({json: {items: matching, total: matching.length, page: 1, limit: 10}})
    })
    await page.goto('/monitoring')
    const rows = page.locator('main tbody > tr')
    await expect(rows).toHaveCount(2)
    await page.getByRole('textbox', {name: 'Buscar'}).fill('team_alpha')
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('team_alpha')
    await page.locator('#crud-filter-button').click()
    await expect(page.locator('#crud-list-table-default-filters')).toBeVisible()
    await page.locator('#crud-filter-column-serviceName input').fill('team_alpha')

    await leaveAndReturn(page)
    await expect(page).toHaveURL(/\/monitoring$/)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('')
    await expect(page.locator('#crud-list-table-default-filters')).toBeVisible()
    await expect(page.locator('#crud-filter-column-serviceName input')).toHaveValue('')
    await expect(rows).toHaveCount(2)
})

test('Registry Images clears old search on a new visit', async ({page}) => {
    await authenticate(page)
    await page.route('**/graphql', route => route.fulfill({json: {data: {fetchService: []}}}))
    await page.route('**/api/registry/image**', route => route.fulfill({json: [
        {name: 'team/alpha', tags: ['1']},
        {name: 'team/beta', tags: ['1']}
    ]}))
    await page.goto('/registry-images')
    const rows = page.locator('main tbody > tr')
    await expect(rows).toHaveCount(2)
    await page.getByRole('textbox', {name: 'Buscar'}).fill('team/alpha')
    await expect(rows).toHaveCount(1)

    await leaveAndReturn(page)
    await expect(page).toHaveURL(/\/registry-images$/)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('')
    await expect(rows).toHaveCount(2)
})

test('GitLab Projects clears old search on a new visit', async ({page}) => {
    await authenticate(page)
    await page.route('**/graphql', route => route.fulfill({json: {data: {fetchService: []}}}))
    await page.route('**/api/gitlab/project**', route => {
        const projects = [
            {id: 1, name: 'Alpha', path_with_namespace: 'team/alpha'},
            {id: 2, name: 'Beta', path_with_namespace: 'team/beta'}
        ]
        const search = new URL(route.request().url()).searchParams.get('search') ?? ''
        const items = projects.filter(project => project.name.toLowerCase().includes(search.toLowerCase()))
        return route.fulfill({json: {items, totalItems: items.length}})
    })
    await page.goto('/gitlab-projects')
    const rows = page.locator('main tbody > tr')
    await expect(rows).toHaveCount(2)
    await page.getByRole('textbox', {name: 'Buscar'}).fill('Alpha')
    await expect(rows).toHaveCount(1)

    await leaveAndReturn(page)
    await expect(page).toHaveURL(/\/gitlab-projects$/)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue('')
    await expect(rows).toHaveCount(2)
})
