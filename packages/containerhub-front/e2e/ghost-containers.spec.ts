import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD
const orphanContainerId = process.env.CONTAINERHUB_E2E_GHOST_ORPHAN
const healthyContainerId = process.env.CONTAINERHUB_E2E_GHOST_HEALTHY

if (!username || !password || !orphanContainerId || !healthyContainerId) {
    throw new Error('CONTAINERHUB_E2E_USERNAME, CONTAINERHUB_E2E_PASSWORD, CONTAINERHUB_E2E_GHOST_ORPHAN and CONTAINERHUB_E2E_GHOST_HEALTHY are required')
}

test('shows an orphan running container and excludes a healthy Swarm task', async ({page}) => {
    page.on('pageerror', (error) => { throw error })
    await page.goto('/ghost-containers')
    const inputs = page.locator('input')
    await inputs.nth(0).fill(username)
    await inputs.nth(1).fill(password)
    await page.getByRole('button', {name: /login/i}).click()

    await expect(page).toHaveURL(/\/ghost-containers$/)
    await expect(page.getByText(orphanContainerId, {exact: true})).toBeVisible()
    await expect(page.getByText(healthyContainerId, {exact: true})).toHaveCount(0)
})
