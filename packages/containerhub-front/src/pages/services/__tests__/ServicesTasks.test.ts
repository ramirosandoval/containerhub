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
