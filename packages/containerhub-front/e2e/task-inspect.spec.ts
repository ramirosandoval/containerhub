import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD
if (!username || !password) throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')

test('opens a real task inspection in a separate tab and expands its full tree', async ({page, context}) => {
    context.on('page', openedPage => {
        openedPage.on('pageerror', error => { throw error })
    })
    page.on('pageerror', (error) => { throw error })
    await page.goto('/services')
    await page.locator('input').nth(0).fill(username)
    await page.locator('input').nth(1).fill(password)
    await page.getByRole('button', {name: /login/i}).click()
    await expect(page).toHaveURL(/\/services$/)
    await page.locator('tbody > tr').first().getByRole('button').click()
    const taskRow = page.getByRole('columnheader', {name: 'Tarea', exact: true}).locator('xpath=ancestor::table[1]').locator('tbody > tr').first()
    const taskId = await taskRow.locator('td').nth(4).innerText()
    const [inspectPage, inspectResponse] = await Promise.all([
        page.waitForEvent('popup'),
        context.waitForEvent('response', response => response.url().endsWith(`/api/docker/task/${taskId}/inspect`)),
        taskRow.getByRole('button', {name: 'Inspección de tarea', exact: true}).click()
    ])
    expect(inspectResponse.status()).toBe(200)
    expect(new URL(inspectResponse.url()).origin).toBe(new URL(page.url()).origin)
    inspectPage.on('pageerror', (error) => { throw error })
    await expect(inspectPage).toHaveURL(new RegExp(`/inspect/${taskId}$`))
    await expect(inspectPage.locator('.inspect-heading')).toContainText(`ID: ${taskId}`)
    await expect(inspectPage.getByText('ContainerSpec', {exact: true})).toBeVisible()
    const specification = inspectPage.getByRole('treeitem').filter({has: inspectPage.locator('.inspect-key', {hasText: /^Spec$/})}).first()
    await specification.getByRole('button').click()
    await expect(inspectPage.getByText('ContainerSpec', {exact: true})).not.toBeVisible()
    await specification.getByRole('button').click()
    await expect(inspectPage.getByText('ContainerSpec', {exact: true})).toBeVisible()
    await expect(inspectPage.locator('.inspect-heading')).not.toContainText('Servicio: —')
    await inspectPage.getByRole('tab', {name: 'JSON', exact: true}).click()
    expect(JSON.parse(await inspectPage.locator('pre').innerText())).toEqual(await inspectResponse.json())
    await inspectPage.getByRole('button', {name: 'Actualizar', exact: true}).click()
    await expect(inspectPage.getByRole('button', {name: 'Actualizar', exact: true})).toBeEnabled()
    await inspectPage.goto('/inspect/missing-task')
    await expect(inspectPage.getByText('No se pudo cargar la inspección de la tarea.')).toBeVisible()
    const retryResponse = inspectPage.waitForResponse(response => response.url().endsWith('/api/docker/task/missing-task/inspect'))
    await inspectPage.getByRole('button', {name: 'Reintentar'}).click()
    expect((await retryResponse).status()).toBe(404)
})

// UI scenarios below use explicitly synthetic payloads; authentication remains real.
const syntheticInspection = {
    ID: 'synthetic-task', ServiceID: 'synthetic-service', NodeID: 'synthetic-node',
    DesiredState: 'shutdown', CreatedAt: '2026-09-05T10:00:00Z', UpdatedAt: '2026-09-05T10:01:00Z',
    Status: {State: 'failed', Message: 'Synthetic diagnostic', Err: 'Synthetic execution error', ContainerStatus: {ContainerID: 'synthetic-container', ExitCode: 0}},
    Spec: {ContainerSpec: {Image: 'example.invalid/synthetic-image:verification', Args: ['synthetic needle\nsecond line'], Labels: {long: 'synthetic-long-value-'.repeat(20)}}},
    EmptyObject: {}, EmptyArray: [], EmptyString: '', Nullable: null, Enabled: false
}

async function login(page: import('@playwright/test').Page, path = '/inspect/synthetic-task') {
    page.on('pageerror', error => { throw error })
    await page.goto(path)
    await page.locator('input').nth(0).fill(username!)
    await page.locator('input').nth(1).fill(password!)
    await page.getByRole('button', {name: /login/i}).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
}

test('synthetic UI: summary, native search, expansion, JSON, clipboard, themes and narrow layout', async ({page, context}, testInfo) => {
    let inspectRequests = 0
    await page.route('**/api/docker/task/synthetic-task/inspect', route => { inspectRequests++; return route.fulfill({json: syntheticInspection}) })
    await page.route('**/api/docker/service/synthetic-service', route => route.fulfill({status: 404, json: {message: 'Synthetic removed service'}}))
    await login(page)
    await expect(page.locator('.inspect-heading')).toContainText('synthetic-service')
    await expect(page.locator('dl')).toContainText('Estado observadofailed')
    await expect(page.locator('dl')).toContainText('Estado deseadoshutdown')
    await expect(page.locator('dl')).toContainText('Código de salida0')
    await expect(page.getByText('Error de ejecución: Synthetic execution error')).toBeVisible()
    const tree = page.getByRole('tree')
    await expect(tree.getByText('ContainerSpec', {exact: true})).toBeVisible()
    await expect(tree.getByText('Image', {exact: true})).not.toBeVisible()
    for (const value of [': {}', ': []', ': ""', ': null', ': false']) await expect(tree.getByText(value, {exact: true})).toBeVisible()
    await page.screenshot({path: testInfo.outputPath('synthetic-overview.png'), fullPage: true, animations: 'disabled'})
    await page.getByRole('button', {name: 'Contraer todo'}).click()
    await expect(tree.getByText('ContainerSpec', {exact: true})).not.toBeVisible()
    const search = page.getByRole('textbox', {name: 'Buscar clave o valor'})
    await search.fill('synthetic needle')
    await expect(tree.getByText('Spec', {exact: true})).toBeVisible()
    await expect(tree.getByText('ContainerSpec', {exact: true})).toBeVisible()
    await expect(tree.getByText(': synthetic needle\nsecond line', {exact: true})).toBeVisible()
    await expect(tree.getByText('Status', {exact: true})).not.toBeVisible()
    await search.fill('no-synthetic-match')
    await expect(tree.getByText('Sin coincidencias')).toBeVisible()
    await search.fill('')
    await expect(tree.getByText('ContainerSpec', {exact: true})).not.toBeVisible()
    await page.getByRole('button', {name: 'Expandir todo'}).click()
    await expect(tree.getByText('Image', {exact: true})).toBeVisible()
    expect(inspectRequests).toBe(1)
    await page.getByRole('tab', {name: 'JSON', exact: true}).focus()
    await page.keyboard.press('Enter')
    expect(JSON.parse(await page.locator('pre').innerText())).toEqual(syntheticInspection)
    await expect(page.getByText(/puede contener datos sensibles/)).toBeVisible()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', {name: 'Copiar JSON'}).click()
    await expect(page.getByText('JSON copiado.', {exact: true})).toBeVisible()
    expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(syntheticInspection)
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', {configurable: true, value: () => Promise.reject(new Error('Synthetic denied clipboard'))}) })
    await page.getByRole('button', {name: 'Copiar JSON'}).click()
    await expect(page.getByText(/No se pudo copiar/)).toBeVisible()
    await page.getByRole('tab', {name: 'Árbol', exact: true}).click()
    await search.fill('synthetic needle')
    await page.screenshot({path: testInfo.outputPath('synthetic-light.png'), fullPage: true, animations: 'disabled'})
    await page.getByRole('button', {name: 'Cambiar tema'}).click()
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--dark/)
    await page.screenshot({path: testInfo.outputPath('synthetic-dark.png'), fullPage: true, animations: 'disabled'})
    await page.setViewportSize({width: 390, height: 844})
    await expect(search).toBeVisible()
    await search.fill('long')
    await expect(tree.getByText(`: ${syntheticInspection.Spec.ContainerSpec.Labels.long}`, {exact: true})).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({path: testInfo.outputPath('synthetic-mobile.png'), fullPage: true, animations: 'disabled'})
    await page.getByRole('tab', {name: 'JSON', exact: true}).click()
    await expect(page.locator('pre')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({path: testInfo.outputPath('synthetic-json-mobile.png'), fullPage: true, animations: 'disabled'})
})

test('synthetic UI: refresh preserves previous data and timestamp on failure, then recovers', async ({page}) => {
    let failRefresh = false
    let releaseRefresh: () => void = () => {}
    await page.route('**/api/docker/task/synthetic-task/inspect', async route => {
        if (failRefresh) {
            await new Promise<void>(resolve => { releaseRefresh = resolve })
            await route.fulfill({status: 500, json: {message: 'Synthetic failure'}})
        } else await route.fulfill({json: syntheticInspection})
    })
    await page.route('**/api/docker/service/synthetic-service', route => route.fulfill({json: {name: 'Synthetic service'}}))
    await login(page)
    await expect(page.locator('dl')).toBeVisible()
    const previousTimestamp = await page.getByRole('status').innerText()
    failRefresh = true
    const refreshRequest = page.waitForRequest('**/api/docker/task/synthetic-task/inspect')
    await page.getByRole('button', {name: 'Actualizar', exact: true}).click()
    await refreshRequest
    await expect(page.locator('dl')).toContainText('synthetic-node')
    releaseRefresh()
    await expect(page.getByText(/Se muestran los datos de la última lectura exitosa/)).toBeVisible()
    expect(await page.getByRole('status').innerText()).toBe(previousTimestamp)
    failRefresh = false
    await page.getByRole('button', {name: 'Reintentar'}).click()
    await expect(page.getByText(/Se muestran los datos de la última lectura exitosa/)).not.toBeVisible()
})

test('synthetic UI: rejects malformed inspection and ignores late task responses after route changes', async ({page}) => {
    let payload: unknown = null
    let releaseOld: () => void = () => {}
    await page.route('**/api/docker/task/synthetic-task/inspect', route => route.fulfill({json: payload}))
    await page.route('**/api/docker/service/synthetic-service', route => route.fulfill({json: {name: 'Synthetic service'}}))
    await login(page)
    for (const invalidPayload of [[], {ID: 'wrong-task'}]) {
        await expect(page.getByText('No se pudo cargar la inspección de la tarea.')).toBeVisible()
        payload = invalidPayload
        await page.getByRole('button', {name: 'Reintentar'}).click()
    }
    await expect(page.getByText('No se pudo cargar la inspección de la tarea.')).toBeVisible()
    payload = syntheticInspection
    await page.getByRole('button', {name: 'Reintentar'}).click()
    await expect(page.locator('dl')).toBeVisible()
    await page.route('**/api/docker/task/old-task/inspect', async route => {
        await new Promise<void>(resolve => { releaseOld = resolve })
        await route.fulfill({json: {...syntheticInspection, ID: 'old-task', NodeID: 'old-node'}})
    })
    // Browser history navigation reuses the mounted route component, unlike page.goto.
    const oldRequest = page.waitForRequest('**/api/docker/task/old-task/inspect')
    await page.evaluate(() => { history.pushState({}, '', '/inspect/old-task'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await oldRequest
    await expect(page.locator('dl')).not.toBeVisible()
    await page.evaluate(() => { history.pushState({}, '', '/inspect/synthetic-task'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await expect(page.locator('dl')).toContainText('synthetic-node')
    const oldResponse = page.waitForResponse('**/api/docker/task/old-task/inspect')
    releaseOld()
    await oldResponse
    await expect(page.locator('dl')).toContainText('synthetic-node')
    await expect(page.locator('dl')).not.toContainText('old-node')
})
