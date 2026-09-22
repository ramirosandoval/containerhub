import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {AuditServiceFactory} from '@drax/audit-back'
import {AuthUtils, RoleServiceFactory} from '@drax/identity-back'
import SetupContainerHub from '../../setup/SetupContainerHub.js'
import YogaFastifyServerFactory from '../YogaFastifyServerFactory.js'

test('serves persisted audits only to roles with audit read access', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'containerhub-audit-section-'))
    const previousEnvironment = {...process.env}
    let server: ReturnType<typeof YogaFastifyServerFactory> | undefined

    try {
        Object.assign(process.env, {
            DRAX_DB_ENGINE: 'sqlite',
            DRAX_SQLITE_FILE: join(temporaryDirectory, 'audit.sqlite'),
            DRAX_JWT_SECRET: 'test-only-audit-secret',
            DRAX_APIKEY_SECRET: 'test-only-audit-api-key-secret',
            CONTAINERHUB_BOOTSTRAP_ENABLED: 'false',
            NODE_ENV: 'test'
        })

        await SetupContainerHub()
        await AuditServiceFactory.instance.create({
            entity: 'Service',
            resourceId: 'service-1',
            user: {id: 'user-1', username: 'operator', rolName: 'Sudo'},
            action: 'UPDATE',
            ip: '127.0.0.1',
            userAgent: 'node-test',
            changes: [{field: 'image', old: 'app:1', new: 'app:2'}],
            sessionId: 'session-1',
            requestId: 'request-1',
            detail: 'Updated service image'
        })

        const roleService = RoleServiceFactory()
        const adminRole = await roleService.findByName('Admin')
        assert.ok(adminRole)
        const adminToken = AuthUtils.generateToken({
            id: 'admin-user',
            username: 'admin',
            session: 'admin-session',
            roleId: adminRole._id,
            roleName: adminRole.name
        })

        const deniedRole = await roleService.create({
            name: 'No audit access',
            permissions: [],
            childRoles: [],
            readonly: false
        })
        const deniedToken = AuthUtils.generateToken({
            id: 'denied-user',
            username: 'denied',
            session: 'denied-session',
            roleId: deniedRole._id,
            roleName: deniedRole.name
        })

        server = YogaFastifyServerFactory()

        const allowed = await server.fastify.inject({
            method: 'GET',
            url: '/api/audits?page=1&limit=10&orderBy=createdAt&order=desc',
            headers: {authorization: `Bearer ${adminToken}`}
        })
        assert.equal(allowed.statusCode, 200)
        const page = allowed.json() as {total: number; items: Array<{entity: string; action: string; resourceId?: string}>}
        assert.equal(page.total, 1)
        assert.deepEqual(page.items.map(({entity, action, resourceId}) => ({entity, action, resourceId})), [
            {entity: 'Service', action: 'UPDATE', resourceId: 'service-1'}
        ])

        const denied = await server.fastify.inject({
            method: 'GET',
            url: '/api/audits?page=1&limit=10',
            headers: {authorization: `Bearer ${deniedToken}`}
        })
        assert.equal(denied.statusCode, 403)

        const anonymous = await server.fastify.inject({method: 'GET', url: '/api/audits?page=1&limit=10'})
        assert.equal(anonymous.statusCode, 401)
    } finally {
        await server?.fastify.close()
        process.env = previousEnvironment
        await rm(temporaryDirectory, {recursive: true, force: true})
    }
})
