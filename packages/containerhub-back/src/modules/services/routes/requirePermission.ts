import type {FastifyRequest} from 'fastify'

export async function requirePermission(request: FastifyRequest, permission: string) {
    ;(request as any).rbac.assertPermission(permission)
}
