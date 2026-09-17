import {MonitoringCollectorFactory} from './modules/monitoring/factory/MonitoringCollectorFactory.js'
import {runMonitoringWorker} from './modules/monitoring/services/MonitoringWorker.js'
import {initializeContainerHubRuntime} from './setup/SetupContainerHub.js'

await initializeContainerHubRuntime()
await runMonitoringWorker(MonitoringCollectorFactory())
