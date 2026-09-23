import {expect, test, type Page} from '@playwright/test'

const selectedNodeId = 'node-worker-selected'
const otherNodeId = 'node-worker-other'

async function preparePage(page: Page, permissions: string[] = ['DOCKER_VIEW', 'DOCKER_NODES_FETCH']): Promise<void> {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'ghost-node-navigation-test'
    ].join('.')
    await page.addInitScript(({token, grantedPermissions}) => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken: token,
        authUser: {username: 'ghost-node-navigation-test', role: {permissions: grantedPermissions}}
    })), {token: accessToken, grantedPermissions: permissions})
    await page.route('**/api/docker/nodes', async (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([selectedNodeId, otherNodeId].map((id) => ({
            id, hostname: id, ip: '10.0.0.8', role: 'worker', availability: 'active',
            state: 'ready', engine: '27', leader: false, reachability: null,
            resources: null, agentHealthy: true
        })))
    }))
    await page.route('**/api/docker/ghostContainers', async (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{Id: 'ghost-1', Created: 1, Image: 'alpine:3', Status: 'Up', NodeID: selectedNodeId}])
    }))
}

test('opens Nodes with the clicked ghost node selected in search', async ({page}) => {
    await preparePage(page)
    await page.goto('/ghost-containers')
    await page.getByRole('link', {name: selectedNodeId, exact: true}).click()
    await expect(page).toHaveURL(new RegExp(`/nodes\\?node=${selectedNodeId}$`))
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue(selectedNodeId)
    const nodeRows = page.getByRole('main').getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')
    await expect(nodeRows).toHaveCount(1)
    await expect(nodeRows).toContainText(selectedNodeId)
})

test('direct Nodes URL loads the named node and keeps the search on reload', async ({page}) => {
    await preparePage(page)
    await page.goto(`/nodes?node=${selectedNodeId}`)
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue(selectedNodeId)
    const nodeRows = page.getByRole('main').getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')
    await expect(nodeRows).toHaveCount(1)
    await page.reload()
    await expect(page.getByRole('textbox', {name: 'Buscar'})).toHaveValue(selectedNodeId)
    await expect(nodeRows).toHaveCount(1)
})

test('keeps the ghost node as plain text without Nodes permission', async ({page}) => {
    await preparePage(page, ['DOCKER_VIEW'])
    await page.goto('/ghost-containers')
    await expect(page.getByRole('main').getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')).toContainText(selectedNodeId)
    await expect(page.getByRole('link', {name: selectedNodeId, exact: true})).toHaveCount(0)
})
