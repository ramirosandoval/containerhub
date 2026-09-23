import {expect, test} from '@playwright/test'

const configured = {
    _id: 'configuration-1', serviceId: 'service-1', serviceName: 'team_api', serviceStack: 'team',
    type: 'permanent', status: 'monitoring', collectionInterval: '15s', collectionType: 'replic',
    since: null, until: null, holdingTime: 30
}
const availableServices = [
    {id: 'service-1', name: 'team_api', stack: 'team'},
    {id: 'service-2', name: 'team_worker', stack: 'team'}
]

test('monitoring creation keeps selection, validation, failure and list refresh', async ({page}) => {
    const accessToken = [
        Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url'),
        Buffer.from(JSON.stringify({exp: 4_102_444_800})).toString('base64url'),
        'readability-test'
    ].join('.')
    await page.addInitScript(token => localStorage.setItem('AuthStore', JSON.stringify({
        accessToken: token,
        authUser: {username: 'readability-test', role: {permissions: ['DOCKER_VIEW', 'DOCKER_MONITORING_CREATE', 'DOCKER_MONITORING_PAUSE', 'DOCKER_MONITORING_DELETE']}}
    })), accessToken)

    let listRequests = 0
    let createRequests = 0
    let releaseCreate: (() => void) | undefined
    await page.route('**/api/docker/version', route => route.fulfill({json: {}}))
    await page.route('**/api/services**', route => route.fulfill({json: availableServices}))
    await page.route('**/api/monitoring-configurations**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/statuses')) {
            await route.fulfill({json: [{serviceId: 'service-1', status: 'monitoring'}]})
        } else if (path === '/api/monitoring-configurations' && request.method() === 'GET') {
            listRequests++
            await route.fulfill({json: {items: [configured], total: 1, page: 1, limit: 10}})
        } else if (path === '/api/monitoring-configurations' && request.method() === 'POST') {
            createRequests++
            expect(request.postDataJSON().serviceIds).toEqual(['service-2'])
            if (createRequests === 2) await new Promise<void>(resolve => { releaseCreate = resolve })
            await route.fulfill(createRequests === 1
                ? {status: 500, json: {message: 'try again'}}
                : {json: {created: [{...configured, _id: 'configuration-2', serviceId: 'service-2'}], skipped: []}})
        } else {
            await route.abort()
        }
    })

    await page.goto('/monitoring')
    await expect(page.getByText('team_api').first()).toBeVisible()
    await page.getByRole('button', {name: 'Configurar servicios'}).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('team_api')).toBeVisible()
    await expect(dialog.getByText('team_worker')).toBeVisible()
    await expect(dialog.getByText('Habilitado')).toBeVisible()
    await expect(dialog.getByRole('button', {name: 'Guardar'})).toBeDisabled()
    expect(createRequests).toBe(0)

    await dialog.locator('tbody > tr').filter({hasText: 'team_worker'}).getByRole('checkbox').check()
    await dialog.getByRole('textbox', {name: 'Hasta'}).fill(await dialog.getByRole('textbox', {name: 'Desde'}).inputValue())
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    expect(createRequests).toBe(0)
    await dialog.getByRole('radio', {name: 'Permanente'}).check()
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    await expect(dialog.getByRole('alert').filter({hasText: 'error.server'})).toBeVisible()
    expect(createRequests).toBe(1)
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    await expect.poll(() => createRequests).toBe(2)
    await expect(dialog.getByRole('button', {name: 'Cancelar'})).toBeDisabled()
    await expect(page.locator('[aria-label="Pausar team_api"]')).toBeDisabled()
    releaseCreate?.()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Configuraciones creadas: 1. Servicios ya configurados: 0.')).toBeVisible()
    expect(createRequests).toBe(2)
    expect(listRequests).toBeGreaterThan(1)
})
