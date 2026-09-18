import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const [setupEntities, main] = await Promise.all([
    readFile(new URL('../SetupEntities.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../main.ts', import.meta.url), 'utf8'),
])

test('registers every ContainerHub CRUD entity for Drax dynamic filters', () => {
    for (const crud of [
        'ServiceCrud',
        'MonitoringCrud',
        'NetworksCrud',
        'NodesCrud',
        'StacksCrud',
        'GhostContainersCrud',
        'RegistryImagesCrud',
        'GitLabProjectsCrud',
        'TaskMonitorizationCrud',
    ]) {
        assert.match(setupEntities, new RegExp(`${crud}\\.instance`))
    }
    assert.match(setupEntities, /useEntityStore\(\)\.setEntities\(/)
    assert.match(main, /installPinia\(app\)\s+setupEntities\(\)/)
})
