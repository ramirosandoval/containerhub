import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

test('shows Docker node resources and filters them with Drax field metadata', async ({page}) => {
    test.setTimeout(90_000)
    page.on('pageerror', (error) => { throw error })
    const nodesResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/docker/nodes'))

    const usernameInput = page.locator('#username-input')
    for (let attempt = 0; attempt < 3 && !await usernameInput.isVisible().catch(() => false); attempt++) {
        await page.goto('/nodes')
        await page.waitForTimeout(2_000)
    }
    await usernameInput.fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /Iniciar Sesión|Login/i}).click()

    await expect(page).toHaveURL(/\/nodes$/)
    const nodesResponse = await nodesResponsePromise
    expect(nodesResponse.status()).toBe(200)
    const nodes = await nodesResponse.json() as Array<{
        hostname?: string
        resources?: {NanoCPUs?: number; MemoryBytes?: number} | null
    }>
    const node = nodes.find(({hostname, resources}) => hostname && resources?.NanoCPUs !== undefined && resources.MemoryBytes !== undefined)
    expect(node).toBeTruthy()

    const resources = `${node!.resources!.NanoCPUs! / 1_000_000_000} CPU / ${(node!.resources!.MemoryBytes! / 1024 ** 3).toFixed(2)} GB`
    await expect(page.getByRole('cell', {name: resources, exact: true})).toBeVisible()

    await page.locator('#crud-filter-button').click()
    await page.getByRole('combobox', {name: /Campo|Field/, exact: true}).press('ArrowDown')
    await page.getByRole('option', {name: /Nombre del host|Hostname/, exact: true}).click()
    await page.getByRole('combobox', {name: /Operador|Operator/, exact: true}).press('ArrowDown')
    await page.getByRole('option', {name: /Contiene|Contains/, exact: true}).click()
    const filterValue = page.locator('#crud-dynamic-filter-value-field-0 input')
    await filterValue.fill(node!.hostname!)

    await expect(page.getByRole('cell', {name: node!.hostname!, exact: true})).toBeVisible()
    await filterValue.fill('__missing_hostname__')
    await expect(page.getByRole('cell', {name: node!.hostname!, exact: true})).toBeHidden()

    await page.goto('/services')
    await page.locator('#crud-filter-button').click()
    await expect(page.getByRole('combobox', {name: /Imagen|Image/, exact: true})).toBeVisible()
    await expect(page.getByRole('combobox', {name: /Campo|Field/, exact: true})).toBeVisible()
})
