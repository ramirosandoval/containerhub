import {readFile} from 'node:fs/promises'

type VaultSecretMapping = readonly [identifier: string, environmentVariable: string]

const requiredVaultSecrets: readonly VaultSecretMapping[] = [
    ['containerhub-jwt', 'DRAX_JWT_SECRET'],
    ['containerhub-api-key', 'DRAX_APIKEY_SECRET']
]

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, variable: string): string {
    const value = environment[variable]?.trim()
    if (!value) throw new Error(`${variable} must be configured when CONTAINERHUB_VAULT_URL is set`)
    return value
}

async function fetchVaultSecret(
    vaultUrl: string,
    identifier: string,
    clientId: string,
    clientKey: string,
    fetchImplementation: typeof fetch
): Promise<string> {
    const response = await fetchImplementation(new URL(`/api/client/secret/${identifier}`, vaultUrl), {
        headers: {clientid: clientId, clientkey: clientKey},
        signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error(`Vault secret ${identifier} request failed with status ${response.status}`)

    const payload: unknown = await response.json()
    if (
        !payload
        || typeof payload !== 'object'
        || (payload as {identifier?: unknown}).identifier !== identifier
        || typeof (payload as {secret?: unknown}).secret !== 'string'
        || (payload as {secret: string}).secret.length === 0
    ) {
        throw new Error(`Vault secret ${identifier} returned an invalid response`)
    }
    return (payload as {secret: string}).secret
}

export async function loadContainerHubSecretsFromVault(
    environment: NodeJS.ProcessEnv = process.env,
    fetchImplementation: typeof fetch = fetch
): Promise<void> {
    const vaultUrl = environment.CONTAINERHUB_VAULT_URL?.trim()
    if (!vaultUrl) return

    const clientId = requiredEnvironmentValue(environment, 'CONTAINERHUB_VAULT_CLIENT_ID')
    const clientKeyFile = requiredEnvironmentValue(environment, 'CONTAINERHUB_VAULT_CLIENT_KEY_FILE')
    const clientKey = (await readFile(clientKeyFile, 'utf8')).trim()
    if (!clientKey) throw new Error('CONTAINERHUB_VAULT_CLIENT_KEY_FILE must not be empty')

    const configuredVaultSecrets = [...requiredVaultSecrets]
    const bootstrapPasswordIdentifier = environment.CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID?.trim()
    if (bootstrapPasswordIdentifier) configuredVaultSecrets.push([bootstrapPasswordIdentifier, 'CONTAINERHUB_BOOTSTRAP_PASSWORD'])

    const resolvedSecrets = await Promise.all(configuredVaultSecrets.map(async ([identifier, environmentVariable]) => [
        environmentVariable,
        await fetchVaultSecret(vaultUrl, identifier, clientId, clientKey, fetchImplementation)
    ] as const))

    for (const [environmentVariable, secret] of resolvedSecrets) environment[environmentVariable] = secret
}
