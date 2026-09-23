import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import type {ITaskMonitorization} from '../../models/TaskMonitorization.js'

const events: string[] = []
const stored: ITaskMonitorization[] = []
let runningTasks: {ID: string; NodeID: string; ServiceID: string; Status: {State: string}}[] = []
let auditFails = false
const repository = {
    getRecent: async () => { events.push('recent'); return [...stored].reverse() },
    createDoc: async (doc: ITaskMonitorization) => { events.push(`create:${doc.status}`); stored.push(doc); return doc },
    purgeOld: async () => { events.push('purge') }
}
class DockerStub {
    async listTasks() { events.push('tasks'); return runningTasks }
    async listNodes() { events.push('nodes'); return [{ID: 'node-1', Description: {Hostname: 'worker'}}] }
    async listServices() { events.push('services'); return [{ID: 'service-1', Spec: {Name: 'team_api'}}] }
}
const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const settingsMock = mock.module('../../../settings/services/SettingsService.js', {namedExports: {
    SettingsService: {getSettings: async () => { events.push('settings'); return {maxMonitoredTasksQuantity: 100, monitorizationTasksInterval: 60} }}
}})
const repositoryMock = mock.module('../../factory/TaskMonitorizationFactory.js', {namedExports: {
    TaskMonitorizationFactory: {getRepository: () => repository}
}})
const auditMock = mock.module('@drax/audit-back', {namedExports: {
    AuditServiceFactory: {instance: {find: async (query: {limit: number; orderBy: string; order: string; filters: {field: string; operator: string; value: unknown}[]}) => {
        events.push('audit')
        assert.deepEqual([query.limit, query.orderBy, query.order], [1, 'createdAt', 'desc'])
        assert.deepEqual(query.filters.slice(0, 3), [
            {field: 'entity', operator: 'eq', value: 'Service'},
            {field: 'resourceId', operator: 'eq', value: 'service-1'},
            {field: 'action', operator: 'in', value: ['UPDATE', 'RESTART', 'DELETE']}
        ])
        assert.deepEqual([query.filters[3].field, query.filters[3].operator], ['createdAt', 'gte'])
        const threshold = Date.parse(String(query.filters[3].value))
        assert.ok(threshold <= Date.now() && threshold > Date.now() - 2 * 60_000 - 1_000)
        if (auditFails) throw new Error('audit unavailable')
        return [{user: {username: 'operator'}}]
    }}}
}})
const {taskMonitorizationsManager: manager} = await import('../TaskMonitorizationManager.js')
test.after(() => {
    manager.stop()
    for (const dependency of [dockerMock, settingsMock, repositoryMock, auditMock]) dependency.restore()
})

test('task lifecycle persists running then removed with audit attribution and fallback in order', async () => {
    runningTasks = [{ID: 'task-1', NodeID: 'node-1', ServiceID: 'service-1', Status: {State: 'running'}}]
    try {
        await manager.start()
        assert.deepEqual(events, ['settings', 'recent', 'purge', 'settings', 'tasks', 'nodes', 'services', 'audit', 'create:running', 'purge'])
        assert.equal(stored[0].modifiedBy, 'operator')
        assert.equal(stored[0].serviceName, 'team_api')
        assert.equal(stored[0].nodeName, 'worker')
        manager.stop()
        events.length = 0
        runningTasks = []
        auditFails = true
        await manager.start()
        assert.deepEqual(events, ['settings', 'recent', 'purge', 'settings', 'tasks', 'nodes', 'services', 'audit', 'create:removed', 'purge'])
        assert.equal(stored[1].status, 'removed')
        assert.equal(stored[1].modifiedBy, null)
        assert.equal(stored[1].taskId, stored[0].taskId)
    } finally {
        manager.stop()
    }
})
