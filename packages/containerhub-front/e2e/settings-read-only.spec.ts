import {expect, test} from '@playwright/test'

test('read-only settings user can inspect values but cannot edit them', async ({page}) => {
    await page.addInitScript(() => {
        const payload = btoa(JSON.stringify({exp: Math.floor(Date.now() / 1000) + 3600}))
        localStorage.setItem('AuthStore', JSON.stringify({
            accessToken: `test.${payload}.test`,
            authUser: {role: {permissions: ['SETTINGS_SHOW']}}
        }))
    })
    await page.route('**/api/settings', route => route.fulfill({
        status: 200,
        json: {maxLogsLines: 10000, maxMonitoredTasksQuantity: 1000, monitorizationTasksInterval: 60}
    }))

    await page.goto('/settings')
    await expect(page.locator('input[type="number"]').first()).toHaveValue('10000')
    await expect(page.locator('input[type="number"]').first()).toHaveAttribute('readonly', '')
    await expect(page.getByRole('button', {name: /guardar/i})).toHaveCount(0)
})
