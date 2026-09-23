import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

test('shows the Docker engine and API versions returned by the protected endpoint', async ({page}) => {
    page.on('pageerror', (error) => { throw error })
    const versionResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/docker/version'))

    await page.goto('/')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /login/i}).click()

    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('button', {name: /Abrir menú|Open menu/i}).click()
    const versionResponse = await versionResponsePromise
    expect(versionResponse.status()).toBe(200)
    const version = await versionResponse.json() as {Version: string; ApiVersion: string}

    await expect(page.getByText(version.Version, {exact: true})).toBeVisible()
    await expect(page.getByText(version.ApiVersion, {exact: true})).toBeVisible()

    await page.goto('/docker/version')
    await expect(page).toHaveURL(/\/$/)
})
