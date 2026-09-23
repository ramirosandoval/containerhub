import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('services retain the original expandable task list and separate logs page', async () => {
    const [servicesPage, router, logsPage, rest] = await Promise.all([
        readFile(new URL('../ServicesPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../../router/index.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../logs/TaskLogsPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../../rest.ts', import.meta.url), 'utf8')
    ])

    assert.match(servicesPage, /show-expand/)
    assert.match(servicesPage, /#item\.data-table-expand=/)
    assert.match(servicesPage, /toggleTasks\(item, internalItem, isExpanded, toggleExpand\)/)
    assert.match(servicesPage, /#expanded-row=/)
    assert.match(servicesPage, /\/api\/docker\/tasks\/\$\{currentService\.id\}/)
    assert.match(servicesPage, /router\.resolve\(\{name: 'task-logs'/)
    assert.match(servicesPage, /window\.open\(logsUrl, '_blank', 'noopener'\)/)
    assert.match(router, /path: '\/logs\/:taskId'/)
    assert.match(router, /name: 'task-logs'/)
    assert.match(router, /path: '\/terminal\/:taskId'/)
    assert.match(router, /name: 'task-terminal'/)
    assert.match(logsPage, /new WebSocket\(/)
    assert.match(logsPage, /\/api\/docker\/task\/\$\{taskId\.value\}\/logs\/stream/)
    assert.match(servicesPage, /openTerminal\(task, 'sh'\)/)
    assert.match(servicesPage, /DOCKER_TERMINAL/)
    assert.match(rest, /export async function restPost/)
})

test('task terminal waits for backend readiness, forwards binary input and offers a fresh-ticket retry', async () => {
    const source = await readFile(new URL('../TaskTerminalPage.vue', import.meta.url), 'utf8')

    assert.match(source, /message\.type === 'ready'/)
    assert.match(source, /terminal\.onBinary/)
    assert.match(source, /event\.reason/)
    assert.match(source, /terminal-sessions/)
    assert.match(source, /taskTerminal\.retry/)
})

test('services restart one or many selected rows through one bulk action', async () => {
    const servicesPage = await readFile(new URL('../ServicesPage.vue', import.meta.url), 'utf8')

    assert.match(servicesPage, /v-model="selected"/)
    assert.match(servicesPage, /:show-select="authStore\.hasPermission\('DOCKER_RESTART'\) \|\| authStore\.hasPermission\('DOCKER_REMOVE'\)"/)
    assert.match(servicesPage, /return-object/)
    assert.match(servicesPage, /hasPermission\('DOCKER_RESTART'\)/)
    assert.match(servicesPage, /restartSelectedConfirmation/)
    assert.match(servicesPage, /\/api\/docker\/service\/restart/)
    assert.match(servicesPage, /serviceIds: selected\.value\.map/)
    assert.match(servicesPage, /await doPaginate\(\)/)
    assert.doesNotMatch(servicesPage, /\/api\/docker\/service\/restart\/\$\{/)
})

test('services remove one or many selected rows through one destructive action', async () => {
    const servicesPage = await readFile(new URL('../ServicesPage.vue', import.meta.url), 'utf8')

    assert.match(servicesPage, /hasPermission\('DOCKER_REMOVE'\)/)
    assert.match(servicesPage, /removeSelectedConfirmation/)
    assert.match(servicesPage, /services\.removeIrreversible/)
    assert.match(servicesPage, /\/api\/docker\/service\/remove/)
    assert.match(servicesPage, /serviceIds: selected\.value\.map/)
    assert.match(servicesPage, /removeResults\.value = results\.map/)
    assert.match(servicesPage, /await doPaginate\(\)/)
    assert.doesNotMatch(servicesPage, /\/api\/docker\/service\/remove\/\$\{/)
})

test('service images link to Registry and accept image deep-link filters', async () => {
    const servicesPage = await readFile(new URL('../ServicesPage.vue', import.meta.url), 'utf8')

    assert.match(servicesPage, /serviceRegistryTarget/)
    assert.match(servicesPage, /name: 'registry-images'/)
    assert.match(servicesPage, /query: \{repository: target\.repository, tag: target\.tag/)
    assert.match(servicesPage, /applyInitialFilter\('image', route\.query\.image\)/)
})
