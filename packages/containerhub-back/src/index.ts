import * as path from 'path'
import {fileURLToPath} from 'url'
import SetupContainerHub from './setup/SetupContainerHub.js'
import YogaFastifyServerFactory from './factories/YogaFastifyServerFactory.js'

await SetupContainerHub()

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const server = YogaFastifyServerFactory()
const port = Number(process.env.PORT ?? 9998)
await server.start(port)
console.log(`containerhub-back listening on ${port}`)
