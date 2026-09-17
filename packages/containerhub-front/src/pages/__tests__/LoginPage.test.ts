import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const [loginPage, app, router] = await Promise.all([
    readFile(new URL('../LoginPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../App.vue', import.meta.url), 'utf8'),
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

test('matches the Vault login composition with ContainerHub branding', () => {
    assert.match(loginPage, /useDisplay/)
    assert.match(loginPage, /useTheme/)
    assert.match(loginPage, /mdi-docker/)
    assert.match(loginPage, /class="[^\"]*login-brand/)
    assert.match(loginPage, /Container[\s\S]*Hub/)
    assert.match(loginPage, /switchTheme/)
    assert.match(app, /<v-app-bar v-if="authStore\.authUser"/)
})
