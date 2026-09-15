import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {AuditServiceFactory} from '@drax/audit-back'
import {CommonConfig, DraxConfig} from '@drax/common-back'
import {registerServiceMutation} from '../ServiceMutationAudit.js'

test('service mutation audit survives a real SQLite read', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-audit-'))
    try {
        DraxConfig.set(CommonConfig.DbEngine, 'sqlite')
        DraxConfig.set(CommonConfig.SqliteDbFile, join(temporaryDirectory, 'audit.sqlite'))

        await registerServiceMutation('DELETE', 'service-1', {
            user: {id: 'user-1', username: 'operator', roleName: 'Admin', session: 'session-1'},
            ip: '127.0.0.1',
            userAgent: 'node-test',
            requestId: 'request-1'
        })
        const records = await AuditServiceFactory.instance.fetchAll()

        assert.equal(records.length, 1)
        assert.equal(records[0]?.entity, 'Service')
        assert.equal(records[0]?.resourceId, 'service-1')
        assert.equal(records[0]?.action, 'DELETE')
        assert.deepEqual(records[0]?.user, {id: 'user-1', username: 'operator', rolName: 'Admin'})
        assert.equal(records[0]?.sessionId, 'session-1')
        assert.equal(records[0]?.requestId, 'request-1')
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
