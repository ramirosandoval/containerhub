import {DraxConfig, CommonConfig, MongooseConector, LoadCommonConfigFromEnv, COMMON} from '@drax/common-back'
import {CreateOrUpdateRole, CreateUserIfNotExist, LoadIdentityConfigFromEnv, LoadPermissions} from '@drax/identity-back'
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

export default async function SetupContainerHub() {
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
