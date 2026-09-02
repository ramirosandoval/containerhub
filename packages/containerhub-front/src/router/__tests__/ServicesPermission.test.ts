import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const [navigation, router] = await Promise.all([
    readFile(new URL('../../navigation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.ts', import.meta.url), 'utf8')
])

test('hides Services and redirects access without DOCKER_VIEW', () => {
    assert.match(navigation, /text: 'app\.services',[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /name: 'services',[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /to\.meta\.permission && !authStore\.hasPermission\(to\.meta\.permission as string\)/)
    assert.match(router, /return \{name: 'home'\}/)
    assert.match(navigation, /name: 'nodes'[\s\S]*permission: 'DOCKER_NODES_FETCH'/)
    assert.match(navigation, /name: 'networks'[\s\S]*permission: 'DOCKER_NETWORK_VIEW'/)
    assert.match(router, /path: '\/registry-images'[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /path: '\/gitlab-projects'[\s\S]*permission: 'DOCKER_VIEW'/)
})
