import type {IAuditBase} from '@drax/audit-share'

export type ServiceMutationContext = {
    user: {
        id: string
        username: string
        roleName?: string
        tenantId?: string
        tenantName?: string
        apiKeyId?: string
        apiKeyName?: string
        session?: string
    }
    ip: string
    userAgent: string
    requestId: string
}

export function serviceMutationContext(request: any): ServiceMutationContext {
    if (!request.authUser?.id || !request.authUser?.username) throw new Error('Authenticated user is required for service mutations')
    return {
        user: request.authUser,
        ip: request.ip ?? '',
        userAgent: String(request.headers?.['user-agent'] ?? ''),
        requestId: request.id ?? ''
    }
}

export async function registerServiceMutation(action: string, serviceId: string, context: ServiceMutationContext): Promise<void> {
    const record: IAuditBase = {
        entity: 'Service',
        resourceId: serviceId,
        action,
        user: {id: context.user.id, username: context.user.username, rolName: context.user.roleName ?? ''},
        ip: context.ip,
        userAgent: context.userAgent,
        sessionId: context.user.session,
        requestId: context.requestId
    }
    if (context.user.tenantId && context.user.tenantName) record.tenant = {id: context.user.tenantId, name: context.user.tenantName}
    if (context.user.apiKeyId && context.user.apiKeyName) record.apiKey = {id: context.user.apiKeyId, name: context.user.apiKeyName}
    try {
        const {AuditServiceFactory} = await import('@drax/audit-back')
        await AuditServiceFactory.instance.create(record)
    } catch (e) {
        console.error(`Failed to persist ${action} audit for service ${serviceId}:`, e)
        throw new Error(`Mutation executed successfully but audit failed to persist`)
    }
}

export async function registerNetworkMutation(action: string, networkId: string, context: ServiceMutationContext): Promise<void> {
    const record: IAuditBase = {
        entity: 'Network',
        resourceId: networkId,
        action,
        user: {id: context.user.id, username: context.user.username, rolName: context.user.roleName ?? ''},
        ip: context.ip,
        userAgent: context.userAgent,
        sessionId: context.user.session,
        requestId: context.requestId
    }
    if (context.user.tenantId && context.user.tenantName) record.tenant = {id: context.user.tenantId, name: context.user.tenantName}
    if (context.user.apiKeyId && context.user.apiKeyName) record.apiKey = {id: context.user.apiKeyId, name: context.user.apiKeyName}
    try {
        const {AuditServiceFactory} = await import('@drax/audit-back')
        await AuditServiceFactory.instance.create(record)
    } catch (e) {
        console.error(`Failed to persist ${action} audit for network ${networkId}:`, e)
        throw new Error(`Mutation executed successfully but audit failed to persist`)
    }
}