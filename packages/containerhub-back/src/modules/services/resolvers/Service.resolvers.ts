import {fetchService, findServiceById, dockerRestart, dockerRemove} from '../services/ServiceService.js'
import {DockerPermissions} from '../permissions/DockerPermissions.js'

export const resolvers = {
    Query: {
        fetchService: (_: any, args: {stack?: string | null}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.View)
            return fetchService(args.stack)
        },
        findServiceById: (_: any, args: {id: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.View)
            return findServiceById(args.id)
        }
    },
    Mutation: {
        dockerRestart: (_: any, args: {serviceId: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.Restart)
            return dockerRestart(args.serviceId)
        },
        dockerRemove: (_: any, args: {serviceId: string}, context: any) => {
            context.rbac.assertPermission(DockerPermissions.Remove)
            return dockerRemove(args.serviceId)
        }
    }
}

export default resolvers
