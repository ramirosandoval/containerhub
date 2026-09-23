import {expect, test} from '@playwright/test'

const service = {
    id: 'service-1', name: 'team_api', stack: 'team',
    image: {name: 'api', nameWithTag: 'team/api:2', namespace: 'team', domain: null, fullname: 'team/api:2', tag: '2'},
    ports: [], createdAt: null, updatedAt: null
}

test('expanded service tasks retain actions and fall back to node ID', async ({page}) => {
    const token = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'readability-test'
    ].join('.')
    await page.addInitScript(({accessToken}) => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken, authUser: {username: 'readability-test', role: {permissions: ['DOCKER_VIEW', 'DOCKER_LOGS', 'DOCKER_TERMINAL']}}
    })), {accessToken: token})
    await page.route('**/api/services**', async route => {
        await route.fulfill({json: route.request().url().includes('/paginate')
            ? {items: [service], total: 1, page: 1, limit: 10} : [service]})
    })
    await page.route('**/api/docker/version', async route => { await route.fulfill({json: {}}) })
    let taskRequests = 0
    await page.route('**/api/docker/tasks/service-1', async route => {
        taskRequests++
        await route.fulfill({json: [
            {id: 'task-1', nodeId: 'node-1', containerId: 'container-1', state: 'running'},
            {id: 'task-2', nodeId: 'node-2', containerId: 'container-2', state: 'shutdown'}
        ]})
    })
    await page.route('**/api/docker/nodes', async route => { await route.fulfill({status: 403, json: {error: 'forbidden'}}) })
    await page.goto('/services')
    await page.locator('main tbody > tr').first().getByRole('button').click()
    const taskTable = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]')
    await expect(taskTable.getByText('task-1')).toBeVisible()
    await expect(taskTable.getByText('node-1')).toBeVisible()
    const runningTask = taskTable.locator('tbody > tr').filter({hasText: 'task-1'})
    const stoppedTask = taskTable.locator('tbody > tr').filter({hasText: 'task-2'})
    await expect(runningTask.getByRole('button', {name: 'Ver logs'})).toBeVisible()
    await expect(runningTask.getByRole('button', {name: 'Abrir terminal'})).toBeVisible()
    await expect(stoppedTask.getByRole('button', {name: 'Abrir terminal'})).toHaveCount(0)
    await expect(stoppedTask.getByRole('button', {name: 'Estadísticas'})).toHaveCount(0)
    expect(taskRequests).toBe(1)
})
