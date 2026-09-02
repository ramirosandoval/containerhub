import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const [loginPage, router] = await Promise.all([
    readFile(new URL('../LoginPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../router/index.ts', import.meta.url), 'utf8'),
])

test('sends a direct login and authenticated Login visit to Home', () => {
    assert.match(loginPage, /:\s*'\/'\s*\n\s*void router\.replace\(destination\)/)
    assert.doesNotMatch(loginPage, /:\s*'\/services'\s*\n\s*void router\.replace\(destination\)/)

    const loginDestination = router.match(/function loginDestination[\s\S]*?\n}\n\nrouter\.beforeEach/)?.[0]
    assert.ok(loginDestination)
    assert.match(loginDestination, /:\s*'\/'\n}/)
    assert.doesNotMatch(loginDestination, /:\s*'\/services'/)
})
