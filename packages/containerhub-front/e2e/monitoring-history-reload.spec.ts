import {expect, test} from '@playwright/test'

test('failed history refresh does not show samples from the previous query', async ({page}) => {
    await page.addInitScript(() => {
        const payload = btoa(JSON.stringify({exp: Math.floor(Date.now() / 1000) + 3600}))
        localStorage.setItem('AuthStore', JSON.stringify({
            accessToken: `test.${payload}.test`,
            authUser: {role: {permissions: ['DOCKER_VIEW']}}
        }))
    })
    await page.route('**/api/monitoring-configurations/example', route => route.fulfill({
        json: {serviceName: 'example', serviceStack: '', collectionInterval: 60, collectionType: 'replic'}
    }))
    let requests = 0
    await page.route('**/api/monitoring-configurations/example/samples**', route => {
        requests += 1
        return route.fulfill(requests === 1 ? {
            json: {items: [{_id: 'one', taskId: 'task', nodeId: null, sampledAt: '2026-01-01T00:00:00Z', metrics: {
                cpuUsage: {cpuPercentage: 50}, memoryUsage: {memoryTotalUsage: 1073741824},
                ioUsage: {readIoBytes: 1048576}, networksUsage: []
            }}]}
        } : {status: 503, json: {message: 'Unavailable'}})
    })

    await page.goto('/monitoring/example')
    await expect(page.locator('.metric-card')).toHaveCount(3)
    await page.getByRole('button', {name: /actualizar|refresh/i}).click()
    await expect(page.locator('.history-page .v-alert').first()).toBeVisible()
    await expect(page.locator('.metric-card')).toHaveCount(0)
})
