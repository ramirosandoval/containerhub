import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {loadContainerHubSecretsFromVault} from '../VaultSecretLoader.js'

test('loads required and configured bootstrap secrets from Vault', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-vault-'))
    const clientKeyFile = join(temporaryDirectory, 'client-key')
    await writeFile(clientKeyFile, 'test-vault-client-key\n')
    const environment: NodeJS.ProcessEnv = {
        CONTAINERHUB_VAULT_URL: 'http://vault.example:5000',
        CONTAINERHUB_VAULT_CLIENT_ID: 'containerhub',
        CONTAINERHUB_VAULT_CLIENT_KEY_FILE: clientKeyFile,
        CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID: 'containerhub-bootstrap-password'
    }
    const requestedIdentifiers: string[] = []
    const fetchImplementation: typeof fetch = async (input, init) => {
        const requestUrl = new URL(String(input))
        const identifier = requestUrl.pathname.split('/').at(-1)!
        const requestHeaders = new Headers(init?.headers)
        requestedIdentifiers.push(identifier)
        assert.equal(requestHeaders.get('clientid'), 'containerhub')
        assert.equal(requestHeaders.get('clientkey'), 'test-vault-client-key')
        return new Response(JSON.stringify({
            identifier,
            secret: {
                'containerhub-jwt': 'jwt-from-vault',
                'containerhub-api-key': 'api-key-from-vault',
                'containerhub-bootstrap-password': 'bootstrap-password-from-vault'
            }[identifier]
        }))
    }

    try {
        await loadContainerHubSecretsFromVault(environment, fetchImplementation)
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true})
    }

    assert.deepEqual(requestedIdentifiers.sort(), ['containerhub-api-key', 'containerhub-bootstrap-password', 'containerhub-jwt'])
    assert.equal(environment.DRAX_JWT_SECRET, 'jwt-from-vault')
    assert.equal(environment.DRAX_APIKEY_SECRET, 'api-key-from-vault')
    assert.equal(environment.CONTAINERHUB_BOOTSTRAP_PASSWORD, 'bootstrap-password-from-vault')
})

test('rejects a Vault response for a different identifier', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-vault-'))
    const clientKeyFile = join(temporaryDirectory, 'client-key')
    await writeFile(clientKeyFile, 'test-vault-client-key')
    const environment: NodeJS.ProcessEnv = {
        CONTAINERHUB_VAULT_URL: 'http://vault.example:5000',
        CONTAINERHUB_VAULT_CLIENT_ID: 'containerhub',
        CONTAINERHUB_VAULT_CLIENT_KEY_FILE: clientKeyFile
    }
    const fetchImplementation: typeof fetch = async () => new Response(JSON.stringify({
        identifier: 'another-secret',
        secret: 'unexpected-value'
    }))

    try {
        await assert.rejects(
            () => loadContainerHubSecretsFromVault(environment, fetchImplementation),
            /returned an invalid response/
        )
    } finally {
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
