import SetupContainerHub from './setup/SetupContainerHub.js'
import YogaFastifyServerFactory from './factories/YogaFastifyServerFactory.js'
import {MonitoringCollectorFactory} from './modules/monitoring/factory/MonitoringCollectorFactory.js'
import {registerFrontendStatic} from './servers/FrontendStatic.js'
import {taskMonitorizationsManager} from './modules/monitoring/services/TaskMonitorizationManager.js'

await SetupContainerHub()

const server = YogaFastifyServerFactory()
if (process.env.CONTAINERHUB_FRONT_DIR) {
    await registerFrontendStatic(server.fastify, process.env.CONTAINERHUB_FRONT_DIR)
}
MonitoringCollectorFactory().start()
await taskMonitorizationsManager.start()

server.fastify.get('/status', async () => {
    return 'RUNNING'
})

const port = Number(process.env.DRAX_PORT ?? 9998)
await server.start(port)
console.log(`containerhub-back listening on ${port}`)
