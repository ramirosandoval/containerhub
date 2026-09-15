import {CommonConfig, COMMON, DraxConfig} from '@drax/common-back'
import {MonitoringSampleService} from '../services/MonitoringSampleService.js'
import {MonitoringSampleSqliteRepository} from '../repository/MonitoringSampleSqliteRepository.js'
import {MonitoringSampleMongoRepository} from '../repository/MonitoringSampleMongoRepository.js'

let monitoringSampleService: MonitoringSampleService | undefined
export function MonitoringSampleServiceFactory(): MonitoringSampleService {
    if (!monitoringSampleService) {
        if (DraxConfig.getOrLoad(CommonConfig.DbEngine) === COMMON.DB_ENGINES.SQLITE) {
            const repository = new MonitoringSampleSqliteRepository(DraxConfig.getOrLoad(CommonConfig.SqliteDbFile))
            repository.build()
            monitoringSampleService = new MonitoringSampleService(repository)
        } else {
            monitoringSampleService = new MonitoringSampleService(new MonitoringSampleMongoRepository())
        }
    }
    return monitoringSampleService
}
