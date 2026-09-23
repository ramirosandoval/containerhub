import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const [summary, app, navigation, router] = await Promise.all([
    readFile(new URL('../DockerVersionSummary.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../navigation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../router/index.ts', import.meta.url), 'utf8')
])

test('shows Docker versions in the permitted sidebar footer instead of a page', () => {
    assert.match(summary, /restGet<DockerVersion>\('\/api\/docker\/version'\)/)
    assert.match(summary, /version\?\.Version/)
    assert.match(summary, /version\?\.ApiVersion/)
    assert.match(app, /<docker-version-summary v-if="authStore\.hasPermission\('DOCKER_VIEW'\)"\/>[\s\S]*app\.logout/)
    assert.doesNotMatch(navigation, /docker-version/)
    assert.doesNotMatch(router, /path: '\/docker\/version'/)
})

test('redirects every unknown route to home', () => {
    assert.match(router, /path: '\/:pathMatch\(\.\*\)\*'[\s\S]*redirect: \{name: 'home'\}/)
})
