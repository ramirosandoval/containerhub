import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD
const matchingNetwork = process.env.CONTAINERHUB_E2E_NETWORK_MATCH
const excludedNetwork = process.env.CONTAINERHUB_E2E_NETWORK_EXCLUDED

if (!username || !password || !matchingNetwork || !excludedNetwork) {
    throw new Error('CONTAINERHUB_E2E_USERNAME, CONTAINERHUB_E2E_PASSWORD, CONTAINERHUB_E2E_NETWORK_MATCH and CONTAINERHUB_E2E_NETWORK_EXCLUDED are required')
}

test('filters and refreshes the Docker network inventory', async ({page}) => {
    test.setTimeout(90_000)
    page.on('pageerror', (error) => { throw error })
    await page.goto('/networks')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /login/i}).click()

    await expect(page).toHaveURL(/\/networks$/)
    await expect(page.getByText(matchingNetwork, {exact: true})).toBeVisible()
    await expect(page.getByText(excludedNetwork, {exact: true})).toBeVisible()
    await expect(page.getByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/).first()).toBeVisible()

    const refreshResponse = page.waitForResponse((response) => response.url().endsWith('/api/docker/network'))
    await page.getByRole('button', {name: 'Actualizar redes'}).click()
    const response = await refreshResponse
    expect(response.status()).toBe(200)
    const refreshedNetworks = await response.json() as Array<{Name?: string; Created?: string}>
    const created = refreshedNetworks.find((network) => network.Name === matchingNetwork)?.Created
    assertCreated(created)
    const createdDate = await page.evaluate((value) => {
        const date = new Date(value)
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
            .map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-')
    }, created)

    await page.getByRole('textbox', {name: 'Nombre', exact: true}).fill('NET02-MATCH')
    await page.getByRole('combobox', {name: 'Adjuntable', exact: true}).press('ArrowDown')
    await page.getByRole('option', {name: 'Sí'}).click()
    await page.getByRole('combobox', {name: 'Driver', exact: true}).press('ArrowDown')
    await page.getByRole('option', {name: 'overlay'}).click()
    await page.getByLabel('Creada desde', {exact: true}).fill(createdDate)
    await page.getByLabel('Creada hasta', {exact: true}).fill(createdDate)
    await page.getByRole('textbox', {name: 'Subred', exact: true}).fill('10.254.1')
    await page.getByRole('button', {name: 'Aplicar'}).click()

    await expect(page.getByText(matchingNetwork, {exact: true})).toBeVisible()
    await expect(page.getByText(excludedNetwork, {exact: true})).toHaveCount(0)

    await page.getByRole('button', {name: 'Limpiar'}).click()
    await expect(page.getByText(excludedNetwork, {exact: true})).toBeVisible()
})

function assertCreated(created: string | undefined): asserts created is string {
    expect(created).toBeTruthy()
}
