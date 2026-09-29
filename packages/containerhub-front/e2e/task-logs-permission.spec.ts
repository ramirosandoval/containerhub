import {expect, test, type Page} from '@playwright/test'

async function setupLogsPage(page: Page) {
    const token = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'logs-only-test'
    ].join('.')
    await page.addInitScript(accessToken => {
        localStorage.setItem('AuthStore', JSON.stringify({
            accessToken, authUser: {username: 'logs-only-test', role: {permissions: ['DOCKER_LOGS']}}
        }))
        class FakeSocket extends EventTarget {
            private readonly taskLogSocket: boolean
            constructor(url: string) {
                super()
                this.taskLogSocket = url.includes('/api/docker/task/') && url.includes('/logs/stream')
                window.setTimeout(() => this.dispatchEvent(new Event('open')), 0)
                if (this.taskLogSocket) {
                    ;(window as any).logSocketCount = ((window as any).logSocketCount ?? 0) + 1
                    ;(window as any).latestLogSocket = this
                }
            }
            send(message: string) { if (this.taskLogSocket) (window as any).logSocketMessages.push(JSON.parse(message)) }
            close() { this.dispatchEvent(new Event('close')) }
        }
        ;(window as any).logSocketMessages = []
        ;(window as any).WebSocket = FakeSocket
    }, token)
    await page.route('**/api/**', route => route.abort())
    let settingsRequests = 0
    await page.route('**/api/settings', route => { settingsRequests++; return route.abort() })
    return {settingsRequests: () => settingsRequests}
}

async function openConfiguredLogsPage(page: Page): Promise<void> {
    await setupLogsPage(page)
    await page.route('**/api/docker/logs/config', route => route.fulfill({json: {maxLogsLines: 100}}))
    await page.goto('/logs/task-1')
    await expect(page.locator('.log-terminal .xterm')).toBeVisible()
}

test('logs-only operator uses the permitted line limit without reading settings', async ({page}) => {
    const {settingsRequests} = await setupLogsPage(page)
    let configRequests = 0
    await page.route('**/api/docker/logs/config', route => {
        configRequests++
        return route.fulfill({json: {maxLogsLines: 100}})
    })
    await page.goto('/logs/task-1')
    await expect(page.getByText('Logs de tarea')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as any).logSocketMessages[0]?.tail)).toBe(100)
    expect(configRequests).toBe(1)
    expect(settingsRequests()).toBe(0)
})

test('invalid line limit displays an error and never starts a log socket', async ({page}) => {
    await setupLogsPage(page)
    await page.route('**/api/docker/logs/config', route => route.fulfill({json: {maxLogsLines: 0}}))
    await page.goto('/logs/task-1')
    await expect(page.getByText('No se pudo cargar la configuración de logs.')).toBeVisible()
    expect(await page.evaluate(() => (window as any).logSocketCount ?? 0)).toBe(0)
})

test('configuration failure displays an error and never starts a log socket', async ({page}) => {
    const {settingsRequests} = await setupLogsPage(page)
    await page.route('**/api/docker/logs/config', route => route.fulfill({status: 503, json: {error: 'Synthetic config failure'}}))
    await page.goto('/logs/task-1')
    await expect(page.getByText('No se pudo cargar la configuración de logs.')).toBeVisible()
    expect(await page.evaluate(() => (window as any).logSocketCount ?? 0)).toBe(0)
    expect(settingsRequests()).toBe(0)
})

test('groups filters separately from viewer controls at desktop and mobile widths', async ({page}) => {
    await openConfiguredLogsPage(page)
    const filters = page.getByRole('group', {name: 'Filtros de logs'})
    const actions = page.getByRole('group', {name: 'Acciones del visor'})
    await expect(filters.getByRole('combobox', {name: 'Desde'})).toBeVisible()
    await expect(filters.getByRole('combobox', {name: 'Incluir'})).toBeVisible()
    await expect(filters.getByRole('combobox', {name: 'Excluir'})).toBeVisible()
    await expect(filters.locator('input[type="number"]')).toBeVisible()
    await expect(actions.getByRole('switch', {name: 'Timestamps'})).toBeVisible()
    await expect(actions.getByRole('switch', {name: 'Pausar'})).toBeVisible()
    const desktopFilters = await filters.boundingBox()
    const desktopActions = await actions.boundingBox()
    const desktopViewer = await page.locator('.log-terminal').boundingBox()
    expect(desktopFilters && desktopActions && desktopViewer).toBeTruthy()
    expect(desktopFilters!.y + desktopFilters!.height).toBeLessThan(desktopActions!.y)
    expect(desktopActions!.y + desktopActions!.height).toBeLessThan(desktopViewer!.y)
    await page.setViewportSize({width: 390, height: 844})
    await expect(filters).toBeVisible()
    await expect(actions).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('Enter adds one blank line locally only inside the log viewer', async ({page}) => {
    await openConfiguredLogsPage(page)
    await expect.poll(() => page.evaluate(() => (window as any).logSocketMessages.length)).toBe(1)
    const rows = page.locator('.log-terminal .xterm-rows')
    const visibleLines = () => rows.locator(':scope > div').allTextContents()
    const emitLog = (text: string) => page.evaluate(value => {
        (window as any).latestLogSocket.dispatchEvent(new MessageEvent('message', {data: `${value}\n`}))
    }, text)
    await emitLog('first log')
    await expect(rows).toContainText('first log')
    await page.locator('input[type="number"]').press('Enter')
    await emitLog('second log')
    await expect(rows).toContainText('second log')
    const before = await visibleLines()
    expect(before.findIndex(line => line.includes('second log')) - before.findIndex(line => line.includes('first log'))).toBe(1)
    const sentBefore = await page.evaluate(() => (window as any).logSocketMessages.length)
    await page.locator('.log-terminal .xterm-helper-textarea').press('Enter')
    await emitLog('third log')
    await expect(rows).toContainText('third log')
    const after = await visibleLines()
    const second = after.findIndex(line => line.includes('second log'))
    expect(after.findIndex(line => line.includes('third log')) - second).toBe(2)
    expect(after[second + 1].trim()).toBe('')
    expect(after.join('')).not.toContain('Separador')
    expect(await page.evaluate(() => (window as any).logSocketMessages.length)).toBe(sentBefore)
    await page.getByRole('switch', {name: 'Timestamps'}).click()
    await expect.poll(() => page.evaluate(() => (window as any).logSocketMessages.length)).toBe(sentBefore + 1)
    await emitLog('fourth log')
    await expect(rows).toContainText('fourth log')
    await expect(rows).not.toContainText('third log')
})
