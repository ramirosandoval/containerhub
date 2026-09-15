import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD
const serviceNames = process.env.CONTAINERHUB_E2E_REMOVE_SERVICES?.split(',').filter(Boolean) ?? []

if (!username || !password || serviceNames.length !== 3) {
    throw new Error('CONTAINERHUB_E2E_USERNAME, CONTAINERHUB_E2E_PASSWORD and three CONTAINERHUB_E2E_REMOVE_SERVICES are required')
}

test('selects and removes one or many services through the same destructive action', async ({page}) => {
    page.on('pageerror', (error) => { throw error })
    await page.goto('/services')
    const inputs = page.locator('input')
    await inputs.nth(0).fill(username)
    await inputs.nth(1).fill(password)
    await page.getByRole('button', {name: /login/i}).click()
    await expect(page).toHaveURL(/\/services$/)

    await page.locator('#crud-search-input').fill(serviceNames[0].replace(/-[^-]+$/, ''))
    const rows = serviceNames.map((name) => page.locator('tbody > tr').filter({hasText: name}))
    for (const row of rows) await expect(row).toBeVisible()

    await rows[0].getByRole('checkbox').check()
    await page.getByRole('button', {name: /Eliminar seleccionados \(1\)/}).click()
    await expect(page.getByRole('dialog')).toContainText('(1)')
    await expect(page.getByRole('dialog')).toContainText('Esta acción es irreversible.')
    const singularResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/docker/service/remove'))
    await page.getByRole('dialog').getByRole('button', {name: 'Eliminar', exact: true}).click()
    expect(await (await singularResponse).json()).toEqual([{serviceId: expect.any(String), success: true}])
    await expect(page.locator('.v-alert')).toContainText(serviceNames[0])
    await expect(page.locator('.v-alert')).toContainText('Servicio eliminado')
    await expect(rows[0]).toHaveCount(0)

    await rows[1].getByRole('checkbox').check()
    await rows[2].getByRole('checkbox').check()
    await page.getByRole('button', {name: /Eliminar seleccionados \(2\)/}).click()
    await expect(page.getByRole('dialog')).toContainText('(2)')
    const bulkResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/docker/service/remove'))
    await page.getByRole('dialog').getByRole('button', {name: 'Eliminar', exact: true}).click()
    expect(await (await bulkResponse).json()).toEqual([
        {serviceId: expect.any(String), success: true},
        {serviceId: expect.any(String), success: true}
    ])
    await expect(page.locator('.v-alert')).toContainText(serviceNames[1])
    await expect(page.locator('.v-alert')).toContainText(serviceNames[2])
    await expect(rows[1]).toHaveCount(0)
    await expect(rows[2]).toHaveCount(0)
})
