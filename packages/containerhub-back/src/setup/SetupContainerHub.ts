import {DraxConfig, CommonConfig, MongooseConector, LoadCommonConfigFromEnv, COMMON, ValidationError} from '@drax/common-back'
import {
    CreateOrUpdateRole,
    CreateUserIfNotExist,
    IdentityConfig,
    LoadIdentityConfigFromEnv,
    LoadPermissions,
    PasswordPolicyServiceFactory,
    RoleServiceFactory,
    UserServiceFactory
} from '@drax/identity-back'
import type {IUserCreate} from '@drax/identity-share'
import {DockerPermissions, dockerPermissions} from '../modules/services/permissions/DockerPermissions.js'

const bootstrapEnabledEnvironmentVariable = 'CONTAINERHUB_BOOTSTRAP_ENABLED'

function requiredBootstrapValue(environment: NodeJS.ProcessEnv, variable: string): string {
    const value = environment[variable]?.trim()
    if (!value) {
        throw new Error(`${variable} must be configured when ${bootstrapEnabledEnvironmentVariable}=true`)
    }
    return value
}

export function resolveContainerHubBootstrapUser(environment: NodeJS.ProcessEnv = process.env): IUserCreate | null {
    const enabled = environment[bootstrapEnabledEnvironmentVariable]?.trim().toLowerCase()
    if (enabled === undefined || enabled === 'false') {
        return null
    }
    if (enabled !== 'true') {
        throw new Error(`${bootstrapEnabledEnvironmentVariable} must be configured as true or false`)
    }

    return {
        active: true,
        name: requiredBootstrapValue(environment, 'CONTAINERHUB_BOOTSTRAP_NAME'),
        username: requiredBootstrapValue(environment, 'CONTAINERHUB_BOOTSTRAP_USERNAME'),
        password: requiredBootstrapValue(environment, 'CONTAINERHUB_BOOTSTRAP_PASSWORD'),
        email: requiredBootstrapValue(environment, 'CONTAINERHUB_BOOTSTRAP_EMAIL'),
        phone: requiredBootstrapValue(environment, 'CONTAINERHUB_BOOTSTRAP_PHONE'),
        role: 'Admin'
    }
}

async function createRolesAndBootstrapUser(bootstrapUser: IUserCreate | null) {
    const identityPermissions = [
        'user:manage', 'user:view', 'user:create', 'user:update', 'user:delete', 'user:changePassword',
        'role:manage', 'role:view', 'role:create', 'role:update', 'role:delete', 'role:permissions',
        'userApiKey:manage', 'userApiKey:view', 'userApiKey:create', 'userApiKey:update', 'userApiKey:delete',
        'userloginfail:manage', 'userloginfail:view', 'userloginfail:create', 'userloginfail:update', 'userloginfail:delete',
        'usersession:manage', 'usersession:view', 'usersession:create', 'usersession:update', 'usersession:delete',
        'tenant:manage', 'tenant:view', 'tenant:create', 'tenant:update', 'tenant:delete'
    ]
    await CreateOrUpdateRole({
        name: 'Admin',
        permissions: [...dockerPermissions, ...identityPermissions],
        childRoles: [],
        readonly: true
    })
    const serviceAccess = [DockerPermissions.View, DockerPermissions.Remove, DockerPermissions.Logs, DockerPermissions.Terminal]
    const serviceManagement = [...serviceAccess, DockerPermissions.Restart, DockerPermissions.Create, DockerPermissions.Update]
    const monitoringManagement = [DockerPermissions.MonitoringCreate, DockerPermissions.MonitoringPause, DockerPermissions.MonitoringDelete]
    const settingsPermissions = ['SETTINGS_SHOW', 'SETTINGS_UPDATE', 'SETTINGS_CREATE', 'SETTINGS_DELETE']
    const rolePermissions = {
        Sudo: [...serviceManagement, DockerPermissions.NodesFetch, DockerPermissions.NetworkView, ...monitoringManagement, ...settingsPermissions, ...identityPermissions.filter(permission => permission.startsWith('user:') || permission.startsWith('role:') || permission.startsWith('userApiKey:') || permission.startsWith('userloginfail:') || permission.startsWith('usersession:') || permission.startsWith('tenant:'))],
        Implementaciones: serviceManagement,
        Infraestructura: serviceAccess,
        Desarrollo: serviceManagement,
        Direccion: serviceAccess,
        PM: serviceAccess,
        QA: serviceAccess,
        Soporte: []
    }
    const roleService = RoleServiceFactory()
    for (const [name, permissions] of Object.entries(rolePermissions)) {
        const existingRole = await roleService.findByName(name)
        if (existingRole && !existingRole.readonly) continue
        await CreateOrUpdateRole({name, permissions: [...permissions], childRoles: [], readonly: name === 'Sudo'})
    }
    for (const existingRole of await roleService.fetchAll()) {
        if (!existingRole.permissions.includes('DOCKER_CONSOLE')) continue
        const migratedRole = {
            name: existingRole.name,
            permissions: [...new Set(existingRole.permissions.map((permission) => permission === 'DOCKER_CONSOLE' ? DockerPermissions.Terminal : permission))],
            childRoles: existingRole.childRoles?.map((childRole) => typeof childRole === 'string' ? childRole : childRole._id),
            readonly: Boolean(existingRole.readonly),
            ...(existingRole.icon ? {icon: existingRole.icon} : {}),
            ...(existingRole.color ? {color: existingRole.color} : {})
        }
        if (existingRole.readonly) await roleService.systemUpdate(existingRole._id, migratedRole)
        else await roleService.update(existingRole._id, migratedRole)
    }
    if (bootstrapUser) {
        const existingUser = await UserServiceFactory().findByUsername(bootstrapUser.username)
        if (!existingUser) {
            try {
                await PasswordPolicyServiceFactory().validatePassword(bootstrapUser.password)
            } catch (error) {
                if (error instanceof ValidationError) {
                    throw new Error('CONTAINERHUB_BOOTSTRAP_PASSWORD does not satisfy the Drax password policy')
                }
                throw error
            }
        }
        await CreateUserIfNotExist(bootstrapUser)
    }
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

    if (environment.NODE_ENV === 'production') {
        const configuredOrigin = environment.TERMINAL_ALLOWED_ORIGIN?.trim()
        try {
            const origin = new URL(configuredOrigin ?? '')
            if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error()
        } catch {
            throw new Error('TERMINAL_ALLOWED_ORIGIN must be configured as an HTTP(S) origin in production')
        }
    }

    resolveContainerHubBootstrapUser(environment)
}

export default async function SetupContainerHub() {
    validateContainerHubEnvironment()
    LoadCommonConfigFromEnv()
    LoadIdentityConfigFromEnv()
    LoadPermissions([
        ...dockerPermissions,
        'user:manage', 'user:view', 'user:create', 'user:update', 'user:delete', 'user:changePassword',
        'role:manage', 'role:view', 'role:create', 'role:update', 'role:delete', 'role:permissions',
        'userApiKey:manage', 'userApiKey:view', 'userApiKey:create', 'userApiKey:update', 'userApiKey:delete',
        'userloginfail:manage', 'userloginfail:view', 'userloginfail:create', 'userloginfail:update', 'userloginfail:delete',
        'usersession:manage', 'usersession:view', 'usersession:create', 'usersession:update', 'usersession:delete',
        'tenant:manage', 'tenant:view', 'tenant:create', 'tenant:update', 'tenant:delete',
        'SETTINGS_SHOW', 'SETTINGS_UPDATE', 'SETTINGS_CREATE', 'SETTINGS_DELETE'
    ])

    if (DraxConfig.getOrLoad(CommonConfig.DbEngine) === COMMON.DB_ENGINES.MONGODB) {
        console.log('Connecting to MongoDB...')
        const uri = DraxConfig.getOrLoad(CommonConfig.MongoDbUri)
        await new MongooseConector(uri).connect()
    }

    await createRolesAndBootstrapUser(resolveContainerHubBootstrapUser())
}
