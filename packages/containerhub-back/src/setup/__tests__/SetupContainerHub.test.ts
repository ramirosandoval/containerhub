import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mock, test} from 'node:test'
import {
    initializeContainerHubRuntime,
    resolveContainerHubBootstrapUser,
    validateContainerHubEnvironment
} from '../SetupContainerHub.js'

const validMongoEnvironment: NodeJS.ProcessEnv = {
    DRAX_DB_ENGINE: 'mongo',
    DRAX_MONGO_URI: 'mongodb://127.0.0.1:27017/incartainer',
    DRAX_JWT_SECRET: 'test-only-secret',
    DRAX_APIKEY_SECRET: 'test-only-api-key-secret'
}

const enabledBootstrapEnvironment: NodeJS.ProcessEnv = {
    CONTAINERHUB_BOOTSTRAP_ENABLED: 'true',
    CONTAINERHUB_BOOTSTRAP_NAME: 'Initial Administrator',
    CONTAINERHUB_BOOTSTRAP_USERNAME: 'initial-admin',
    CONTAINERHUB_BOOTSTRAP_PASSWORD: 'test-only-bootstrap-password',
    CONTAINERHUB_BOOTSTRAP_EMAIL: 'initial-admin@example.com',
    CONTAINERHUB_BOOTSTRAP_PHONE: '+15550000000'
}

test('accepts enabled bootstrap with every required identity value', () => {
    assert.doesNotThrow(() => validateContainerHubEnvironment({
        ...validMongoEnvironment,
        ...enabledBootstrapEnvironment
    }))
    assert.deepEqual(resolveContainerHubBootstrapUser(enabledBootstrapEnvironment), {
        active: true,
        name: 'Initial Administrator',
        username: 'initial-admin',
        password: 'test-only-bootstrap-password',
        email: 'initial-admin@example.com',
        phone: '+15550000000',
        role: 'Admin'
    })
})

test('rejects enabled bootstrap when the username is missing', () => {
    const environment = {...enabledBootstrapEnvironment}
    delete environment.CONTAINERHUB_BOOTSTRAP_USERNAME

    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, ...environment}),
        /CONTAINERHUB_BOOTSTRAP_USERNAME must be configured when CONTAINERHUB_BOOTSTRAP_ENABLED=true/
    )
})

test('rejects enabled bootstrap when the password is missing instead of using a default', () => {
    const environment = {...enabledBootstrapEnvironment}
    delete environment.CONTAINERHUB_BOOTSTRAP_PASSWORD

    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, ...environment}),
        /CONTAINERHUB_BOOTSTRAP_PASSWORD must be configured when CONTAINERHUB_BOOTSTRAP_ENABLED=true/
    )
})

test('rejects enabled bootstrap when the Drax-required name is missing', () => {
    const environment = {...enabledBootstrapEnvironment}
    delete environment.CONTAINERHUB_BOOTSTRAP_NAME

    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, ...environment}),
        /CONTAINERHUB_BOOTSTRAP_NAME must be configured when CONTAINERHUB_BOOTSTRAP_ENABLED=true/
    )
})

test('rejects enabled bootstrap when the Drax-required email is missing', () => {
    const environment = {...enabledBootstrapEnvironment}
    delete environment.CONTAINERHUB_BOOTSTRAP_EMAIL

    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, ...environment}),
        /CONTAINERHUB_BOOTSTRAP_EMAIL must be configured when CONTAINERHUB_BOOTSTRAP_ENABLED=true/
    )
})

test('rejects enabled bootstrap when the Drax-required phone is missing', () => {
    const environment = {...enabledBootstrapEnvironment}
    delete environment.CONTAINERHUB_BOOTSTRAP_PHONE

    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, ...environment}),
        /CONTAINERHUB_BOOTSTRAP_PHONE must be configured when CONTAINERHUB_BOOTSTRAP_ENABLED=true/
    )
})

test('does not require bootstrap credentials when bootstrap is disabled', () => {
    const environment = {...validMongoEnvironment, CONTAINERHUB_BOOTSTRAP_ENABLED: 'false'}

    assert.doesNotThrow(() => validateContainerHubEnvironment(environment))
    assert.equal(resolveContainerHubBootstrapUser(environment), null)
})

test('loads Vault secrets before validating the worker runtime', async () => {
    const originalEnvironment = {...process.env}
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-runtime-vault-'))
    const clientKeyFile = join(temporaryDirectory, 'client-key')
    await writeFile(clientKeyFile, 'test-vault-client-key')
    const fetchMock = mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
        const identifier = new URL(String(input)).pathname.split('/').at(-1)
        const secret = identifier === 'containerhub-jwt' ? 'test-only-secret' : 'test-only-api-key-secret'
        return new Response(JSON.stringify({identifier, secret}))
    })
    try {
        delete process.env.DRAX_JWT_SECRET
        delete process.env.DRAX_APIKEY_SECRET
        Object.assign(process.env, {
            DRAX_DB_ENGINE: 'sqlite',
            DRAX_SQLITE_FILE: 'containerhub-worker.sqlite',
            DRAX_PORT: '0',
            CONTAINERHUB_BOOTSTRAP_ENABLED: 'false',
            CONTAINERHUB_VAULT_URL: 'http://vault.example:5000',
            CONTAINERHUB_VAULT_CLIENT_ID: 'containerhub',
            CONTAINERHUB_VAULT_CLIENT_KEY_FILE: clientKeyFile,
            NODE_ENV: 'test'
        })
        await initializeContainerHubRuntime()
        assert.equal(fetchMock.mock.callCount(), 2)
        assert.equal(process.env.DRAX_JWT_SECRET, 'test-only-secret')
        assert.equal(process.env.DRAX_APIKEY_SECRET, 'test-only-api-key-secret')
    } finally {
        mock.restoreAll()
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnvironment)) delete process.env[key]
        }
        Object.assign(process.env, originalEnvironment)
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})

test('defaults bootstrap to disabled when the opt-in variable is absent', () => {
    assert.equal(resolveContainerHubBootstrapUser({}), null)
})

test('rejects ambiguous bootstrap enabled values', () => {
    assert.throws(
        () => resolveContainerHubBootstrapUser({CONTAINERHUB_BOOTSTRAP_ENABLED: 'yes'}),
        /CONTAINERHUB_BOOTSTRAP_ENABLED must be configured as true or false/
    )
})

test('accepts the mandatory MongoDB, JWT, and API-key configuration', () => {
    assert.doesNotThrow(() => validateContainerHubEnvironment(validMongoEnvironment))
})

test('rejects startup when DRAX_APIKEY_SECRET is blank', () => {
    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, DRAX_APIKEY_SECRET: '   '}),
        /DRAX_APIKEY_SECRET must be configured/
    )
})

test('rejects startup when the API-key secret reuses the JWT secret', () => {
    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, DRAX_APIKEY_SECRET: validMongoEnvironment.DRAX_JWT_SECRET}),
        /DRAX_APIKEY_SECRET must differ from DRAX_JWT_SECRET/
    )
})

test('requires the browser terminal origin in production', () => {
    assert.throws(
        () => validateContainerHubEnvironment({...validMongoEnvironment, NODE_ENV: 'production'}),
        /TERMINAL_ALLOWED_ORIGIN must be configured as an HTTP\(S\) origin in production/
    )
    assert.doesNotThrow(() => validateContainerHubEnvironment({
        ...validMongoEnvironment,
        NODE_ENV: 'production',
        TERMINAL_ALLOWED_ORIGIN: 'https://containerhub.example.com'
    }))
    for (const invalidOrigin of ['ftp://containerhub.example.com', 'https://containerhub.example.com/path', 'https://user:password@containerhub.example.com']) {
        assert.throws(
            () => validateContainerHubEnvironment({...validMongoEnvironment, NODE_ENV: 'production', TERMINAL_ALLOWED_ORIGIN: invalidOrigin}),
            /TERMINAL_ALLOWED_ORIGIN must be configured as an HTTP\(S\) origin in production/
        )
    }
})

test('rejects startup when DRAX_DB_ENGINE is missing', () => {
    const environment = {...validMongoEnvironment}
    delete environment.DRAX_DB_ENGINE

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_DB_ENGINE must be configured as one of: mongo, sqlite/
    )
})

test('rejects startup when DRAX_DB_ENGINE is unsupported', () => {
    const environment = {...validMongoEnvironment, DRAX_DB_ENGINE: 'postgres'}

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_DB_ENGINE must be configured as one of: mongo, sqlite/
    )
})

test('rejects MongoDB startup when DRAX_MONGO_URI is missing', () => {
    const environment = {...validMongoEnvironment}
    delete environment.DRAX_MONGO_URI

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_MONGO_URI must be configured when DRAX_DB_ENGINE=mongo/
    )
})

test('rejects startup when DRAX_JWT_SECRET is blank', () => {
    const environment = {...validMongoEnvironment, DRAX_JWT_SECRET: '   '}

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_JWT_SECRET must be configured/
    )
})

test('accepts SQLite when DRAX_SQLITE_FILE is configured', () => {
    const environment: NodeJS.ProcessEnv = {
        DRAX_DB_ENGINE: 'sqlite',
        DRAX_SQLITE_FILE: 'containerhub.db',
        DRAX_JWT_SECRET: 'test-only-secret',
        DRAX_APIKEY_SECRET: 'test-only-api-key-secret'
    }

    assert.doesNotThrow(() => validateContainerHubEnvironment(environment))
})

test('rejects SQLite startup when DRAX_SQLITE_FILE is missing', () => {
    const environment: NodeJS.ProcessEnv = {
        DRAX_DB_ENGINE: 'sqlite',
        DRAX_JWT_SECRET: 'test-only-secret',
        DRAX_APIKEY_SECRET: 'test-only-api-key-secret'
    }

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_SQLITE_FILE must be configured when DRAX_DB_ENGINE=sqlite/
    )
})
