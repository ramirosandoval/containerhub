import Fastify from 'fastify'
import {createSchema, createYoga} from 'graphql-yoga'

export default class YogaFastifyServer {
    fastify: any
    private yoga: any

    constructor(typeDefs: any, resolvers: any) {
        this.fastify = Fastify({logger: true})
        // Drax validates requests at the service layer, not through Fastify schemas.
        this.fastify.setValidatorCompiler(() => () => true)
        this.yoga = createYoga({
            schema: createSchema({typeDefs, resolvers}),
            graphqlEndpoint: '/graphql',
            landingPage: true
        })
        this.fastify.route({
            url: this.yoga.graphqlEndpoint,
            method: ['GET', 'POST', 'OPTIONS'],
            handler: async (req: any, reply: any) => {
                const response = await this.yoga.handleNodeRequestAndResponse(req, reply, {
                    authUser: req.authUser,
                    rbac: req.rbac
                })
                response.headers.forEach((value: string, key: string) => reply.header(key, value))
                reply.status(response.status)
                reply.send(response.body)
                return reply
            }
        })
    }

    async start(port: number) {
        await this.fastify.listen({port, host: '0.0.0.0'})
    }
}
