import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('Docker version page requests and displays the protected legacy fields', async () => {
    const page = await readFile(new URL('../DockerVersionPage.vue', import.meta.url), 'utf8')
    const router = await readFile(new URL('../../router/index.ts', import.meta.url), 'utf8')
    const navigation = await readFile(new URL('../../navigation.ts', import.meta.url), 'utf8')

    assert.match(page, /restGet<DockerVersion>\('\/api\/docker\/version'\)/)
    assert.match(page, /version\.Version/)
    assert.match(page, /version\.ApiVersion/)
    assert.match(router, /path: '\/docker\/version'/)
    assert.match(navigation, /name: 'docker-version'.*permission: 'DOCKER_VIEW'/)
})
