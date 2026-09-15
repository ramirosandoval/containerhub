import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

test('loads current settings and allows updating them', async ({page}) => {
    page.on('pageerror', (error) => { throw error })
    
    // Intercept API calls to avoid modifying the real DB
    await page.route('**/api/settings', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                json: {
                    maxLogsLines: 10000,
                    maxMonitoredTasksQuantity: 1000,
                    monitorizationTasksInterval: 60
                }
            })
        } else if (route.request().method() === 'PUT') {
            await route.fulfill({
                status: 200,
                json: JSON.parse(route.request().postData() || '{}')
            })
        } else {
            await route.continue()
        }
    })

    await page.goto('/settings')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /login/i}).click()

    await expect(page).toHaveURL(/\/settings$/)

    // Wait for the mocked GET to finish
    await expect(page.locator('input[type="number"]').first()).toHaveValue('10000')

    // Change a setting
    await page.locator('input[type="number"]').first().fill('12345')

    // Save
    await page.getByRole('button', {name: /guardar/i}).click()

    // Verify snackbar appears
    await expect(page.getByText('Configuraciones guardadas')).toBeVisible()
})
