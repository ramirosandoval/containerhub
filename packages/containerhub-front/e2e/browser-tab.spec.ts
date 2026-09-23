import {expect, test, type Page} from '@playwright/test'

const metadataTimeout = 15_000

async function authenticate(page: Page): Promise<void> {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'browser-tab-test'
    ].join('.')

    await page.addInitScript(({token}) => {
        localStorage.setItem('AuthStore', JSON.stringify({
            accessToken: token,
            authUser: {
                username: 'browser-tab-test',
                role: {
                    permissions: [
                        'DOCKER_VIEW',
                        'DOCKER_NODES_FETCH',
                        'DOCKER_NETWORK_VIEW',
                        'DOCKER_LOGS',
                        'DOCKER_TERMINAL'
                    ]
                }
            }
        }))
    }, {token: accessToken})
}

async function loadedFaviconPathname(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
        if (!link) return ''

        const image = new Image()
        image.src = link.href
        await image.decode()
        return image.naturalWidth > 0 && image.naturalHeight > 0
            ? new URL(link.href).pathname
            : ''
    })
}

async function loadedFaviconSource(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
        return link ? fetch(link.href).then(response => response.text()) : ''
    })
}

test('updates the browser title from the active section', async ({page}) => {
    await authenticate(page)

    await page.goto('/services')
    await expect(page).toHaveTitle('Servicios', {timeout: metadataTimeout})

    await page.goto('/')
    await expect(page).toHaveTitle('ContainerHub', {timeout: metadataTimeout})
})

test('matches the favicon to the active section and resets it on home', async ({page}) => {
    await authenticate(page)

    const sections = [
        {path: '/services', title: 'Servicios', favicon: '/favicons/mdi-docker.svg'},
        {path: '/nodes', title: 'Nodos swarm', favicon: '/favicons/mdi-server-network.svg'},
        {path: '/ghost-containers', title: 'Contenedores fantasma', favicon: '/favicons/mdi-ghost.svg'},
        {path: '/gitlab-projects', title: 'Proyectos GitLab', favicon: '/favicons/mdi-gitlab.svg'},
        {path: '/cluster', title: 'Información de swarm', favicon: '/favicons/mdi-server-network.svg'},
        {path: '/statistics/missing-task', title: 'Estadísticas de tarea', favicon: '/poll.svg'},
        {path: '/inspect/missing-task', title: 'Inspección de tarea', favicon: '/file-document.svg'},
        {path: '/logs/missing-task?service=test-service', title: 'Logs de tarea', favicon: '/favicon.svg'},
        {path: '/terminal/missing-task', title: 'Terminal de tarea', favicon: '/console.svg'},
    ]

    for (const section of sections) {
        await page.goto(section.path)
        await expect(page).toHaveTitle(section.title, {timeout: metadataTimeout})
        await expect.poll(() => loadedFaviconPathname(page)).toBe(section.favicon)
        const faviconSource = await loadedFaviconSource(page)
        expect(faviconSource).toContain('fill="#2196F3"')
        expect(faviconSource).not.toContain('fill="#FFFFFF"')
        expect(faviconSource).not.toContain('<rect')
    }

    await page.goto('/')
    await expect(page).toHaveTitle('ContainerHub', {timeout: metadataTimeout})
    await expect.poll(() => loadedFaviconPathname(page)).toBe('/favicon.svg')
    const homeFaviconSource = await loadedFaviconSource(page)
    expect(homeFaviconSource).toContain('fill="#2196F3"')
    expect(homeFaviconSource).not.toContain('fill="#FFFFFF"')
    expect(homeFaviconSource).not.toContain('<rect')
})
