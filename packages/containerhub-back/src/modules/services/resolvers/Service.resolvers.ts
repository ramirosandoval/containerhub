import {fetchService, findServiceById, dockerRestart, dockerRemove, paginateServices, parseServiceFilters} from '../services/ServiceService.js'
import {DockerPermissions} from '../permissions/DockerPermissions.js'
import {serviceMutationContext} from '../services/ServiceMutationAudit.js'

export const resolvers = {
    Query: {
        fetchService: (_: any, args: {stack?: string | null}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.View)
            return fetchService(args.stack)
        },
        paginateServices: (_: unknown, args: {
            page: number; limit: number; orderBy?: string; order?: 'asc' | 'desc'
            search?: string; stack?: string | null; filters?: string | null
        }, context: any) => {
            context.rbac.assertPermission(DockerPermissions.View)
            return paginateServices({
                page: Math.max(1, args.page), limit: Math.min(200, Math.max(1, args.limit)),
                orderBy: args.orderBy, order: args.order, search: args.search,
                stack: args.stack, filters: parseServiceFilters(args.filters)
            })
        },
        findServiceById: (_: any, args: {id: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.View)
            return findServiceById(args.id)
        }
    },
    Mutation: {
        dockerRestart: (_: any, args: {serviceId: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.Restart)
            return dockerRestart(args.serviceId, serviceMutationContext(context.request))
        },
        dockerRemove: (_: any, args: {serviceId: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.Remove)
            return dockerRemove(args.serviceId, serviceMutationContext(context.request))
        }
    }
}

export default resolvers
