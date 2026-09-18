import {COMMON, CommonConfig, DraxConfig} from '@drax/common-back'
import {TaskMonitorizationMongoRepository} from '../repository/TaskMonitorizationMongoRepository.js'
import {TaskMonitorizationSqliteRepository} from '../repository/TaskMonitorizationSqliteRepository.js'
import type {ITaskMonitorization} from '../models/TaskMonitorization.js'
import type {IDraxPaginateOptions, IDraxPaginateResult} from '@drax/crud-share'

export interface ITaskMonitorizationRepository {
    getRecent(limit: number): Promise<ITaskMonitorization[]>
    paginate(options: IDraxPaginateOptions): Promise<IDraxPaginateResult<ITaskMonitorization>>
    createDoc(data: ITaskMonitorization): Promise<ITaskMonitorization>
    purgeOld(maxQuantity: number): Promise<void>
}

let cachedRepository: ITaskMonitorizationRepository | null = null

export class TaskMonitorizationFactory {
    static getRepository(): ITaskMonitorizationRepository {
        if (!cachedRepository) {
            const engine = DraxConfig.getOrLoad(CommonConfig.DbEngine)
            if (engine === COMMON.DB_ENGINES.MONGODB) {
                cachedRepository = new TaskMonitorizationMongoRepository()
            } else {
                cachedRepository = new TaskMonitorizationSqliteRepository(DraxConfig.getOrLoad(CommonConfig.SqliteDbFile))
            }
        }
        return cachedRepository
    }
}
