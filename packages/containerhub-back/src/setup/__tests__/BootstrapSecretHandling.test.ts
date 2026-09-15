import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test, {mock} from 'node:test'
import {inspect} from 'node:util'
import SetupContainerHub from '../SetupContainerHub.js'

test('rejects an invalid initial password without logging the secret', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-bootstrap-secret-'))
    const rejectedPassword = 's3cr'
    const loggedErrors: unknown[] = []
    const consoleError = mock.method(console, 'error', (...arguments_: unknown[]) => loggedErrors.push(...arguments_))

    Object.assign(process.env, {
        DRAX_DB_ENGINE: 'sqlite',
        DRAX_SQLITE_FILE: join(temporaryDirectory, 'identity.sqlite'),
        DRAX_JWT_SECRET: 'test-only-secret',
        CONTAINERHUB_BOOTSTRAP_ENABLED: 'true',
        CONTAINERHUB_BOOTSTRAP_NAME: 'Initial Administrator',
        CONTAINERHUB_BOOTSTRAP_USERNAME: 'bootstrap-secret-test',
        CONTAINERHUB_BOOTSTRAP_PASSWORD: rejectedPassword,
        CONTAINERHUB_BOOTSTRAP_EMAIL: 'initial-admin@example.com',
        CONTAINERHUB_BOOTSTRAP_PHONE: '+15550000000'
    })

    try {
        await assert.rejects(
            () => SetupContainerHub(),
            /CONTAINERHUB_BOOTSTRAP_PASSWORD does not satisfy the Drax password policy/
        )
        assert.equal(inspect(loggedErrors).includes(rejectedPassword), false)
    } finally {
        consoleError.mock.restore()
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
