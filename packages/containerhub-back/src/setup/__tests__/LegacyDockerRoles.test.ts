import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {AuthUtils, Rbac, RoleServiceFactory} from '@drax/identity-back'
import SetupContainerHub from '../SetupContainerHub.js'
import YogaFastifyServerFactory from '../../factories/YogaFastifyServerFactory.js'

const serviceAccess = ['DOCKER_VIEW', 'DOCKER_REMOVE', 'DOCKER_LOGS', 'DOCKER_TERMINAL']
const serviceManagement = [...serviceAccess, 'DOCKER_RESTART', 'DOCKER_CREATE', 'DOCKER_UPDATE']
const isDockerOrSettingsPermission = (permission: string) => permission.startsWith('DOCKER_') || permission.startsWith('SETTINGS_')
const expectedBundles: Record<string, string[]> = {
    Sudo: [...serviceManagement, 'DOCKER_NODES_FETCH', 'DOCKER_NETWORK_VIEW', 'DOCKER_MONITORING_CREATE', 'DOCKER_MONITORING_PAUSE', 'DOCKER_MONITORING_DELETE', 'SETTINGS_SHOW', 'SETTINGS_UPDATE', 'SETTINGS_CREATE', 'SETTINGS_DELETE'],
    Implementaciones: serviceManagement,
    Infraestructura: serviceAccess,
    Desarrollo: serviceManagement,
    Direccion: serviceAccess,
    PM: serviceAccess,
    QA: serviceAccess,
    Soporte: [],
    Admin: [...serviceManagement, 'DOCKER_NODES_FETCH', 'DOCKER_NETWORK_VIEW', 'DOCKER_NETWORK_CREATE', 'DOCKER_NETWORK_UPDATE', 'DOCKER_NETWORK_REMOVE', 'DOCKER_MONITORING_CREATE', 'DOCKER_MONITORING_PAUSE', 'DOCKER_MONITORING_DELETE', 'user:manage', 'role:manage', 'userApiKey:manage', 'userloginfail:manage', 'usersession:manage']
}

test('startup persists the approved Docker bundles idempotently and enforces their API access', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-roles-'))
    const previousEnvironment = {...process.env}
    let server: ReturnType<typeof YogaFastifyServerFactory> | undefined
    try {
        Object.assign(process.env, {
            DRAX_DB_ENGINE: 'sqlite',
            DRAX_SQLITE_FILE: join(temporaryDirectory, 'identity.sqlite'),
            DRAX_JWT_SECRET: 'test-only-role-bundles-secret',
            DRAX_APIKEY_SECRET: 'test-only-api-key-secret',
            CONTAINERHUB_BOOTSTRAP_ENABLED: 'false'
        })
        await SetupContainerHub()
        const roleService = RoleServiceFactory()
        const originalRoleIds = new Map((await roleService.fetchAll()).map((role) => [role.name, role._id]))
        const legacyRoleNames = ['admin', 'sudo']
        const legacyRoleIds = new Map<string, string>()
        for (const name of legacyRoleNames) {
            const role = await roleService._repository.create!({
                name,
                permissions: ['DOCKER_VIEW', 'DOCKER_CONSOLE'],
                childRoles: [],
                readonly: true
            })
            legacyRoleIds.set(name, role._id)
        }
        await SetupContainerHub()
        assert.equal((await roleService.fetchAll()).length, Object.keys(expectedBundles).length + legacyRoleNames.length)
        for (const [roleName, permissions] of Object.entries(expectedBundles)) {
            const storedRole = await roleService.findByName(roleName)
            assert.ok(storedRole, `${roleName} must be seeded`)
            assert.equal(storedRole._id, originalRoleIds.get(roleName), `${roleName} keeps its ID`)
            assert.deepEqual(storedRole.permissions.filter(isDockerOrSettingsPermission).sort(), permissions.filter(isDockerOrSettingsPermission).sort(), roleName)
            assert.equal(Boolean(storedRole.readonly), roleName === 'Admin' || roleName === 'Sudo', roleName)
            const authUser = {id: 'role-bundle-test', username: roleName, session: 'test-session', roleId: storedRole._id, roleName}
            const rbac = new Rbac(authUser, storedRole)
            assert.equal(rbac.hasPermission('DOCKER_RESTART'), permissions.includes('DOCKER_RESTART'), roleName)
            assert.equal(rbac.hasPermission('DOCKER_TERMINAL'), permissions.includes('DOCKER_TERMINAL'), roleName)
            assert.equal(rbac.hasPermission('user:manage'), roleName === 'Admin' || roleName === 'Sudo', roleName)
        }
        for (const name of legacyRoleNames) {
            const storedRole = await roleService.findByName(name)
            assert.ok(storedRole)
            assert.equal(storedRole._id, legacyRoleIds.get(name), `${name} keeps its legacy ID`)
            assert.deepEqual(storedRole.permissions, ['DOCKER_VIEW', 'DOCKER_TERMINAL'])
        }
        server = YogaFastifyServerFactory()
        for (const roleName of ['Implementaciones', 'Soporte']) {
            const storedRole = await roleService.findByName(roleName)
            assert.ok(storedRole)
            const token = AuthUtils.generateToken({id: 'role-bundle-test', username: roleName, session: 'test-session', roleId: storedRole._id, roleName})
            const accessResponse: {statusCode: number} = await server.fastify.inject({
                method: 'GET', url: '/api/services/health', headers: {authorization: `Bearer ${token}`}
            })
            assert.equal(accessResponse.statusCode, roleName === 'Soporte' ? 403 : 200, roleName)
        }
        const anonymousResponse = await server.fastify.inject({method: 'GET', url: '/api/services/health'})
        assert.equal(anonymousResponse.statusCode, 401)
        await roleService.create({name: 'Custom operator', permissions: ['DOCKER_VIEW', 'DOCKER_CONSOLE'], childRoles: [], readonly: false})
        await SetupContainerHub()
        const customRole = await roleService.findByName('Custom operator')
        assert.deepEqual(customRole?.permissions, ['DOCKER_VIEW', 'DOCKER_TERMINAL'], 'startup migrates custom roles with the renamed terminal grant')
        const editableRole = await roleService.findByName('QA')
        assert.ok(editableRole)
        await roleService.update(editableRole._id, {name: 'QA', permissions: ['DOCKER_VIEW', 'DOCKER_CONSOLE'], childRoles: [], readonly: false})
        await SetupContainerHub()
        const migratedRole = await roleService.findByName('QA')
        assert.deepEqual(migratedRole?.permissions, ['DOCKER_VIEW', 'DOCKER_TERMINAL'], 'startup migrates the renamed legacy terminal grant')
        assert.ok(migratedRole)
        await roleService.update(migratedRole._id, {name: 'QA', permissions: ['DOCKER_VIEW'], childRoles: [], readonly: false})
        await SetupContainerHub()
        const preservedRole = await roleService.findByName('QA')
        assert.deepEqual(preservedRole?.permissions, ['DOCKER_VIEW'], 'startup preserves administrator edits to editable roles')
    } finally {
        await server?.fastify.close()
        process.env = previousEnvironment
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
