# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/services-tasks.spec.ts >> Services tasks >> opens an interactive terminal for a running task
- Location: e2e/services-tasks.spec.ts:28:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/services", waiting until "load"

```

# Test source

```ts
  1  | import {expect, test} from '@playwright/test'
  2  | 
  3  | const username = process.env.CONTAINERHUB_E2E_USERNAME ?? 'root'
  4  | const password = process.env.CONTAINERHUB_E2E_PASSWORD ?? 'root.123'
  5  | 
  6  | test.describe('Services tasks', () => {
  7  |     test('shows task details and opens its logs', async ({page}) => {
  8  |         await page.goto('/services')
  9  |         await page.getByLabel('Username').fill(username)
  10 |         await page.getByLabel('Password').fill(password)
  11 |         await page.getByRole('button', {name: 'LOGIN'}).click()
  12 |         await expect(page).toHaveURL(/\/services$/)
  13 | 
  14 |         await page.locator('tbody > tr').first().getByRole('button').click()
  15 |         const taskRows = page.locator('table').filter({has: page.getByRole('columnheader', {name: 'Tarea'})}).locator('tbody > tr')
  16 |         await expect(taskRows.first()).toBeVisible()
  17 |         await expect(taskRows.first()).toContainText(/running|starting|complete|failed|shutdown/)
  18 |         await expect(taskRows.first().locator('td').nth(4)).not.toBeEmpty()
  19 | 
  20 |         const logSocket = page.waitForEvent('websocket', (socket) => socket.url().includes('/logs/stream'))
  21 |         const logPage = await page.waitForEvent('popup')
  22 |         await taskRows.first().getByRole('button', {name: 'Ver logs'}).click()
  23 |         await logSocket
  24 |         await logPage.waitForLoadState()
  25 |         await expect(logPage).toHaveURL(/\/logs\/[^/]+/)
  26 |     })
  27 | 
  28 |     test('opens an interactive terminal for a running task', async ({page}) => {
> 29 |         await page.goto('/services')
     |                    ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  30 |         await page.getByLabel('Username').fill(username)
  31 |         await page.getByLabel('Password').fill(password)
  32 |         await page.getByRole('button', {name: 'LOGIN'}).click()
  33 |         await page.locator('tbody > tr').first().getByRole('button').click()
  34 | 
  35 |         const taskRows = page.locator('table').filter({has: page.getByRole('columnheader', {name: 'Tarea'})}).locator('tbody > tr')
  36 |         const terminalButton = taskRows.filter({hasText: 'running'}).getByRole('button', {name: 'Abrir terminal'}).first()
  37 |         await expect(terminalButton).toBeVisible()
  38 |         await terminalButton.click()
  39 |         const terminalSocket = page.waitForEvent('websocket', (socket) => socket.url().includes('/api/docker/terminal'))
  40 |         await page.getByRole('listitem').filter({hasText: 'sh'}).click()
  41 |         await terminalSocket
  42 |         await expect(page).toHaveURL(/\/terminal\/[^/]+/)
  43 |         await expect(page.locator('.task-terminal .xterm')).toBeVisible()
  44 |     })
  45 | })
  46 | 
```