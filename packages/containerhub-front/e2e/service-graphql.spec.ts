import {expect, test, type Page} from '@playwright/test'

const service = {
    id: 'service-1', name: 'team_api', stack: 'team',
    image: {name: 'api', nameWithTag: 'team/api:2', namespace: 'team', domain: null, fullname: 'team/api:2', tag: '2'},
    ports: [], createdAt: null, updatedAt: null
}

async function authenticate(page: Page): Promise<string> {
    const token = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'test-only'
    ].join('.')
    await page.addInitScript(accessToken => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken, authUser: {username: 'test', role: {permissions: ['DOCKER_VIEW']}}
    })), token)
    return token
}

test('Services uses authenticated GraphQL pagination and a full list for filter options', async ({page}) => {
    const token = await authenticate(page)
    const requests: Array<{query: string; variables: Record<string, unknown>; authorization: string | undefined}> = []
    await page.route('**/api/**', route => route.abort())
    await page.route('**/api/docker/version', route => route.fulfill({json: {}}))
    await page.route('**/graphql', async route => {
        const body = route.request().postDataJSON() as {query: string; variables?: Record<string, unknown>}
        requests.push({query: body.query, variables: body.variables ?? {}, authorization: route.request().headers().authorization})
        await route.fulfill({json: {data: body.query.includes('paginateServices')
            ? {paginateServices: {page: 1, limit: 10, total: 1, items: [service]}}
            : {fetchService: [service]}}})
    })
    await page.goto('/services')
    await expect(page.locator('main tbody > tr').first()).toContainText('team_api')
    await expect.poll(() => requests.some(request => request.query.includes('fetchService'))).toBe(true)
    const paginated = requests.find(request => request.query.includes('paginateServices'))
    expect(paginated?.variables.page).toBe(1)
    expect(paginated?.authorization).toBe(`Bearer ${token}`)
})
