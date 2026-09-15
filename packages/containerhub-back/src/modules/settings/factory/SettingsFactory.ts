import {COMMON, CommonConfig, DraxConfig} from '@drax/common-back'
import {SettingsMongoRepository} from '../repository/SettingsMongoRepository.js'
import {SettingsSqliteRepository} from '../repository/SettingsSqliteRepository.js'
import type {ISettings} from '../models/Settings.js'

export interface ISettingsRepository {
    getSettings(): Promise<ISettings>
    updateSettings(updates: Partial<ISettings>): Promise<ISettings>
}

let cachedRepository: ISettingsRepository | null = null

export class SettingsFactory {
    static getRepository(): ISettingsRepository {
        if (!cachedRepository) {
            const engine = DraxConfig.getOrLoad(CommonConfig.DbEngine)
            if (engine === COMMON.DB_ENGINES.MONGODB) {
                cachedRepository = new SettingsMongoRepository()
            } else {
                cachedRepository = new SettingsSqliteRepository(DraxConfig.getOrLoad(CommonConfig.SqliteDbFile))
            }
        }
        return cachedRepository
    }
}
