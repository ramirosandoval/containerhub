import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

test('opens the protected audit table from the Home administration section', async ({page}) => {
    await page.goto('/')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /Iniciar Sesión|Login/i}).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(/Administración|Administration/, {exact: true})).toBeVisible()
    const auditCard = page.getByRole('link', {name: /Auditoria|Audit/i})
    await expect(auditCard).toBeVisible()

    const auditsResponsePromise = page.waitForResponse((response) =>
        response.request().method() === 'GET' && response.url().includes('/api/audits?')
    )
    await auditCard.click()

    await expect(page).toHaveURL(/\/crud\/audit$/)
    expect((await auditsResponsePromise).status()).toBe(200)
    await expect(page.locator('#crud-filter-button')).toBeVisible()
})
