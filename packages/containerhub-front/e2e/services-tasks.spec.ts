import {expect, test} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME ?? 'root'
const password = process.env.CONTAINERHUB_E2E_PASSWORD ?? 'root.123'

test.describe('Services tasks', () => {
    test.beforeEach(async ({page}) => {
        page.on('pageerror', (error) => { throw error })
        await page.goto('/services')
        const inputs = page.locator('input')
        await inputs.nth(0).fill(username)
        await inputs.nth(1).fill(password)
        await page.getByRole('button', {name: /login/i}).click()
        await expect(page).toHaveURL(/\/services$/)
    })

    test('shows task details and opens its logs', async ({page}) => {
        await page.locator('tbody > tr').first().getByRole('button').click()
        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        await expect(taskRows.first()).toBeVisible()
        await expect(taskRows.first()).toContainText(/running|starting|complete|failed|shutdown/)
        await expect(taskRows.first().locator('td').nth(4)).not.toBeEmpty()

        const logPage = page.waitForEvent('popup')
        await taskRows.first().getByRole('button', {name: 'Ver logs'}).click()
        const popup = await logPage
        const logSocket = popup.waitForEvent('websocket', (socket) => socket.url().includes('/logs/stream'))
        await expect(popup).toHaveURL(/\/logs\/[^/]+/)
        await expect(popup.locator('.xterm')).toBeVisible()
        await logSocket
        await popup.locator('input[type="number"]').fill('20')
    })

    test('opens an interactive terminal for a running task', async ({page}) => {
        await page.locator('tbody > tr').first().getByRole('button').click()

        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        const terminalButton = taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first()
        await expect(terminalButton).toBeVisible()
        await terminalButton.click()
        const [terminalSocket] = await Promise.all([
            page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal')),
            page.locator('.v-list-item').filter({hasText: /^Terminal sh$/}).click()
        ])
        await expect(page).toHaveURL(/\/terminal\/[^/]+/)
        await expect(page.locator('.task-terminal .xterm')).toBeVisible()
        const input = terminalSocket.waitForEvent('framesent')
        await page.locator('.xterm-helper-textarea').press('x')
        await input
    })

    test('keeps the terminal writable after Unicode and modifier-key input', async ({page}) => {
        await page.locator('tbody > tr').first().getByRole('button').click()
        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        await taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first().click()
        const [terminalSocket] = await Promise.all([
            page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal')),
            page.locator('.v-list-item').filter({hasText: /^Terminal sh$/}).click()
        ])
        const terminalInput = page.locator('.xterm-helper-textarea')
        const output: string[] = []
        terminalSocket.on('framereceived', ({payload}) => output.push(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)))

        await terminalInput.pressSequentially('´ç`+')
        await terminalInput.press('Shift+Digit1')
        await terminalInput.press('Enter')
        await terminalInput.pressSequentially('echo terminal-special-input-proof')
        await terminalInput.press('Enter')

        await expect.poll(() => output.join('')).toContain('terminal-special-input-proof')
    })

    test('does not freeze terminal output after Ctrl+S', async ({page}) => {
        await page.locator('tbody > tr').first().getByRole('button').click()
        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        await taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first().click()
        const [terminalSocket] = await Promise.all([
            page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal')),
            page.locator('.v-list-item').filter({hasText: /^Terminal sh$/}).click()
        ])
        const terminalInput = page.locator('.xterm-helper-textarea')
        const output: string[] = []
        terminalSocket.on('framereceived', ({payload}) => output.push(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)))

        await expect.poll(() => output.join('')).toContain('/ #')
        await terminalInput.press('Control+S')
        await terminalInput.pressSequentially('echo terminal-xoff-proof')
        await terminalInput.press('Enter')

        await expect.poll(() => output.join(''), {timeout: 3_000}).toContain('terminal-xoff-proof')
    })

    test('recovers from the exact unmatched-backtick sequence with Ctrl+C', async ({page}) => {
        await page.locator('tbody > tr').first().getByRole('button').click()
        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        await taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first().click()
        const [terminalSocket] = await Promise.all([
            page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal')),
            page.locator('.v-list-item').filter({hasText: /^Terminal sh$/}).click()
        ])
        const terminalInput = page.locator('.xterm-helper-textarea')
        const output: string[] = []
        const input: string[] = []
        terminalSocket.on('framereceived', ({payload}) => output.push(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)))
        terminalSocket.on('framesent', ({payload}) => input.push(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)))

        await expect.poll(() => output.join('')).toContain('/ #')
        await terminalInput.pressSequentially('ḉḉç´´`+`+çç--..-ñ´çḉ+`')
        await expect.poll(() => input.join('')).toContain('ḉḉç´´`+`+çç--..-ñ´çḉ+`')
        await terminalInput.press('Enter')
        await terminalInput.press('Control+C')
        await terminalInput.pressSequentially('echo terminal-recovery-proof')
        await terminalInput.press('Enter')

        await expect.poll(() => output.join('')).toContain('terminal-recovery-proof')
    })

    test('selects, copies, and pastes with the keyboard only', async ({page, context}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.locator('tbody > tr').first().getByRole('button').click()
        const taskRows = page.getByRole('columnheader', {name: 'Tarea'}).locator('xpath=ancestor::table[1]').locator('tbody > tr')
        await taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first().click()
        const [terminalSocket] = await Promise.all([
            page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal')),
            page.locator('.v-list-item').filter({hasText: /^Terminal sh$/}).click()
        ])
        const output: string[] = []
        terminalSocket.on('framereceived', ({payload}) => output.push(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)))
        await expect.poll(() => output.join('')).toContain('/ #')

        const terminalInput = page.locator('.xterm-helper-textarea')
        await terminalInput.press('Control+Shift+B')
        await terminalInput.press('Control+Alt+C')
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe('')

        await page.evaluate(() => navigator.clipboard.writeText('echo terminal-clipboard-proof\n'))
        await terminalInput.press('Control+Alt+V')
        await expect.poll(() => output.join('')).toContain('terminal-clipboard-proof')
    })
})
