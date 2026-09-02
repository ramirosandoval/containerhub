import assert from 'node:assert/strict'
import test from 'node:test'
import {validateContainerHubEnvironment} from '../SetupContainerHub.js'

const validMongoEnvironment: NodeJS.ProcessEnv = {
    DRAX_DB_ENGINE: 'mongo',
    DRAX_MONGO_URI: 'mongodb://127.0.0.1:27017/incartainer',
    DRAX_JWT_SECRET: 'test-only-secret'
}

test('accepts the mandatory MongoDB and JWT configuration', () => {
    assert.doesNotThrow(() => validateContainerHubEnvironment(validMongoEnvironment))
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
        DRAX_JWT_SECRET: 'test-only-secret'
    }

    assert.doesNotThrow(() => validateContainerHubEnvironment(environment))
})

test('rejects SQLite startup when DRAX_SQLITE_FILE is missing', () => {
    const environment: NodeJS.ProcessEnv = {
        DRAX_DB_ENGINE: 'sqlite',
        DRAX_JWT_SECRET: 'test-only-secret'
    }

    assert.throws(
        () => validateContainerHubEnvironment(environment),
        /DRAX_SQLITE_FILE must be configured when DRAX_DB_ENGINE=sqlite/
    )
})
