import {DraxConfig, CommonConfig, MongooseConector, LoadCommonConfigFromEnv, COMMON} from '@drax/common-back'
import {CreateOrUpdateRole, CreateUserIfNotExist, IdentityConfig, LoadIdentityConfigFromEnv, LoadPermissions} from '@drax/identity-back'
import {dockerPermissions} from '../modules/services/permissions/DockerPermissions.js'

async function createRootUser() {
    await CreateOrUpdateRole({
        name: 'Admin',
        permissions: dockerPermissions,
        childRoles: [],
        readonly: true
    })
    await CreateUserIfNotExist({
        active: true,
        name: 'Root',
        username: 'root',
        password: 'root.123',
        email: 'root@example.com',
        phone: '123456789',
        role: 'Admin'
    })
}

export function validateContainerHubEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
    const dbEngine = environment[CommonConfig.DbEngine]?.trim()
    if (!Object.values(COMMON.DB_ENGINES).includes(dbEngine as 'mongo' | 'sqlite')) {
        throw new Error(`${CommonConfig.DbEngine} must be configured as one of: ${Object.values(COMMON.DB_ENGINES).join(', ')}`)
    }

    const databaseConfig = dbEngine === COMMON.DB_ENGINES.MONGODB
        ? CommonConfig.MongoDbUri
        : CommonConfig.SqliteDbFile
    if (!environment[databaseConfig]?.trim()) {
        throw new Error(`${databaseConfig} must be configured when ${CommonConfig.DbEngine}=${dbEngine}`)
    }

    if (!environment[IdentityConfig.JwtSecret]?.trim()) {
        throw new Error(`${IdentityConfig.JwtSecret} must be configured`)
    }
}

export default async function SetupContainerHub() {
    validateContainerHubEnvironment()
    LoadCommonConfigFromEnv()
    LoadIdentityConfigFromEnv()
    LoadPermissions(dockerPermissions)

    if (DraxConfig.getOrLoad(CommonConfig.DbEngine) === COMMON.DB_ENGINES.MONGODB) {
        console.log('Connecting to MongoDB...')
        const uri = DraxConfig.getOrLoad(CommonConfig.MongoDbUri)
        await new MongooseConector(uri).connect()
    }

    await createRootUser()
}
