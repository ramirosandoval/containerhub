import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

test('shows the CPU and memory returned for a Docker node', async ({page}) => {
    page.on('pageerror', (error) => { throw error })
    const nodesResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/docker/nodes'))

    await page.goto('/nodes')
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: /login/i}).click()

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
})
