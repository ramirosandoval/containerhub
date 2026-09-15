import {fetchServiceStats, toServiceTaskModel} from '../../services/services/ServiceService.js'
import {MonitoringCollector} from '../services/MonitoringCollector.js'
import {MonitoringServiceFactory} from './MonitoringServiceFactory.js'
import {MonitoringSampleServiceFactory} from './MonitoringSampleServiceFactory.js'
import {MonitoringMetricsSchema} from '../schemas/MonitoringSampleSchema.js'

let collector: MonitoringCollector | undefined
export function MonitoringCollectorFactory(): MonitoringCollector {
    collector ??= new MonitoringCollector(MonitoringServiceFactory(), MonitoringSampleServiceFactory(), async serviceId => (
        await fetchServiceStats(serviceId)
    ).map(({task, metrics}) => ({task: toServiceTaskModel(task), metrics: metrics ? MonitoringMetricsSchema.parse(metrics) : null})))
    return collector
}
