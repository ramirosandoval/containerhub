import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {AuthUtils, UserServiceFactory} from '@drax/identity-back'
import SetupContainerHub from '../SetupContainerHub.js'

const initialUsername = 'bootstrap-idempotency-test'
const initialPassword = 'Initial.Password-123'
const ignoredReplacementPassword = 's3cr'

test('Drax bootstrap preserves the existing user password on repeated startup', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-bootstrap-'))
    const sqliteFile = join(temporaryDirectory, 'identity.sqlite')

    try {
        Object.assign(process.env, {
            DRAX_DB_ENGINE: 'sqlite',
            DRAX_SQLITE_FILE: sqliteFile,
            DRAX_JWT_SECRET: 'test-only-secret',
            DRAX_APIKEY_SECRET: 'test-only-api-key-secret',
            CONTAINERHUB_BOOTSTRAP_ENABLED: 'true',
            CONTAINERHUB_BOOTSTRAP_NAME: 'Initial Administrator',
            CONTAINERHUB_BOOTSTRAP_USERNAME: initialUsername,
            CONTAINERHUB_BOOTSTRAP_PASSWORD: initialPassword,
            CONTAINERHUB_BOOTSTRAP_EMAIL: 'initial-admin@example.com',
            CONTAINERHUB_BOOTSTRAP_PHONE: '+15550000000'
        })

        await SetupContainerHub()
        process.env.CONTAINERHUB_BOOTSTRAP_PASSWORD = ignoredReplacementPassword
        await SetupContainerHub()
        const storedUser = await UserServiceFactory().findByUsernameWithPassword(initialUsername)

        assert.ok(storedUser)
        assert.equal(AuthUtils.checkPassword(initialPassword, storedUser.password), true)
        assert.equal(AuthUtils.checkPassword(ignoredReplacementPassword, storedUser.password), false)
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
