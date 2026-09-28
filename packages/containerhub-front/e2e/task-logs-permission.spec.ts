import {expect, test} from '@playwright/test'

async function setupLogsPage(page: import('@playwright/test').Page) {
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
                if (this.taskLogSocket) (window as any).logSocketCount = ((window as any).logSocketCount ?? 0) + 1
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
