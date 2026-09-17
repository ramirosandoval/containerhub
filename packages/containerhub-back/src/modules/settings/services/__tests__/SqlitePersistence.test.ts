import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SettingsSqliteRepository} from '../../repository/SettingsSqliteRepository.js'
import {TaskMonitorizationSqliteRepository} from '../../../monitoring/repository/TaskMonitorizationSqliteRepository.js'

test('SQLite settings and task lifecycle repositories persist with the Drax identifier', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containerhub-sqlite-'))
    const database = join(directory, 'containerhub.sqlite')
    const settings = new SettingsSqliteRepository(database)
    const lifecycle = new TaskMonitorizationSqliteRepository(database)

    try {
        settings.build()
        lifecycle.build()

        assert.equal((await settings.getSettings() as any)._id, '1')
        assert.equal((await settings.getSettings()).maxLogsLines, 10000)
        assert.equal((await settings.updateSettings({maxLogsLines: 250})).maxLogsLines, 250)

        const event = {
            status: 'running' as const,
            taskId: 'task-1',
            nodeId: 'node-1',
            nodeName: 'worker-1',
            serviceId: 'service-1',
            serviceName: 'stack_api',
            modifiedBy: 'operator',
            date: new Date('2026-09-16T09:00:00.000Z')
        }
        await lifecycle.createDoc(event)
        await lifecycle.createDoc({...event, taskId: 'task-2', date: new Date('2026-09-16T10:00:00.000Z')})
        await lifecycle.purgeOld(1)
        assert.equal(await lifecycle.count(), 1)
        assert.equal((await lifecycle.getRecent(1))[0]?.taskId, 'task-2')

        const reopenedSettings = new SettingsSqliteRepository(database)
        const reopenedLifecycle = new TaskMonitorizationSqliteRepository(database)
        reopenedSettings.build()
        reopenedLifecycle.build()
        assert.equal((await reopenedSettings.getSettings()).maxLogsLines, 250)
        assert.equal((await reopenedLifecycle.getRecent(1))[0]?.taskId, 'task-2')
    } finally {
        await rm(directory, {recursive: true, force: true})
    }
})
