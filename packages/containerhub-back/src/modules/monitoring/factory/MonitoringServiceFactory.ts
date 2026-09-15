import {CommonConfig, COMMON, DraxConfig} from '@drax/common-back'
import {MonitoringService} from '../services/MonitoringService.js'
import {MonitoringSqliteRepository} from '../repository/MonitoringSqliteRepository.js'
import {MonitoringMongoRepository} from '../repository/MonitoringMongoRepository.js'

let monitoringService: MonitoringService | undefined
export function MonitoringServiceFactory(): MonitoringService {
    if (!monitoringService) {
        if (DraxConfig.getOrLoad(CommonConfig.DbEngine) === COMMON.DB_ENGINES.SQLITE) {
            const repository = new MonitoringSqliteRepository(DraxConfig.getOrLoad(CommonConfig.SqliteDbFile))
            repository.build()
            monitoringService = new MonitoringService(repository)
        } else {
            monitoringService = new MonitoringService(new MonitoringMongoRepository())
        }
    }
    return monitoringService
}
