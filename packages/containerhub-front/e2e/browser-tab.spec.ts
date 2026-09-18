import {expect, test, type Page} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

async function signIn(page: Page): Promise<void> {
    await page.goto('/services')
    await expect(page).toHaveTitle('Iniciar Sesión')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: 'Iniciar Sesión'}).click()
    await expect(page).toHaveURL(/\/services$/)
}

test('updates the browser title from the active section', async ({page}) => {
    await signIn(page)
    await expect(page).toHaveTitle('Servicios', {timeout: 15_000})

    await page.goto('/')
    await expect(page).toHaveTitle('ContainerHub')
})
