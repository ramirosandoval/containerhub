import {expect, test, type Page} from '@playwright/test'

const username = process.env.CONTAINERHUB_E2E_USERNAME
const password = process.env.CONTAINERHUB_E2E_PASSWORD
const metadataTimeout = 15_000

if (!username || !password) {
    throw new Error('CONTAINERHUB_E2E_USERNAME and CONTAINERHUB_E2E_PASSWORD are required')
}

async function signIn(page: Page): Promise<void> {
    await page.goto('/services')
    await expect(page).toHaveTitle('Iniciar Sesión', {timeout: metadataTimeout})
    await page.locator('#username-input').fill(username)
    await page.locator('#password-input').fill(password)
    await page.getByRole('button', {name: 'Iniciar Sesión'}).click()
    await expect(page).toHaveURL(/\/services$/)
    await expect(page).toHaveTitle('Servicios', {timeout: metadataTimeout})
}

async function faviconPathname(page: Page): Promise<string> {
    return page.evaluate(() => {
        const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
        return link ? new URL(link.href).pathname : ''
    })
}

test('updates the browser title from the active section', async ({page}) => {
    await signIn(page)

    await page.goto('/')
    await expect(page).toHaveTitle('ContainerHub', {timeout: metadataTimeout})
})

test('updates and resets the favicon from the active section', async ({page}) => {
    await signIn(page)
    await expect.poll(() => faviconPathname(page)).toBe('/favicon.ico')

    const sections = [
        {path: '/cluster', title: 'Información de swarm', favicon: '/information.svg'},
        {path: '/statistics/missing-task', title: 'Estadísticas de tarea', favicon: '/poll.svg'},
        {path: '/inspect/missing-task', title: 'Inspección de tarea', favicon: '/information.svg'},
        {path: '/logs/missing-task?service=test-service', title: 'Logs de tarea', favicon: '/file-document.svg'},
        {path: '/terminal/missing-task', title: 'Terminal de tarea', favicon: '/console.svg'},
    ]

    for (const section of sections) {
        await page.goto(section.path)
        await expect(page).toHaveTitle(section.title, {timeout: metadataTimeout})
        await expect.poll(() => faviconPathname(page)).toBe(section.favicon)
    }

    await page.goto('/services')
    await expect(page).toHaveTitle('Servicios', {timeout: metadataTimeout})
    await expect.poll(() => faviconPathname(page)).toBe('/favicon.ico')
})
