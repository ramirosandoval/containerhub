import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('monitoring configurations open persisted sample history with native date filters and charts', async () => {
    const [monitoringPage, historyPage, router] = await Promise.all([
        readFile(new URL('../MonitoringPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../MonitoringHistoryPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../router/index.ts', import.meta.url), 'utf8')
    ])

    assert.match(monitoringPage, /openHistory\(item\)/)
    assert.match(router, /path: '\/monitoring\/:id'/)
    assert.match(router, /name: 'monitoring-history'/)
    assert.match(historyPage, /\/api\/monitoring-configurations\/\$\{encodeURIComponent\(configurationId\.value\)\}\/samples/)
    assert.match(historyPage, /type="datetime-local"/)
    assert.match(historyPage, /sparklinePoints/)
    assert.match(historyPage, /taskOptions/)
})
