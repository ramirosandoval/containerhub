import {AbstractSqliteRepository} from '@drax/crud-back'
import type {SqliteTableField} from '@drax/common-back'
import type {ISettings} from '../models/Settings.js'

export class SettingsSqliteRepository extends AbstractSqliteRepository<ISettings, ISettings, Partial<ISettings>> {
    protected tableName = 'Settings'
    protected searchFields = []
    protected populateFields = []
    protected jsonFields = []
    protected tableFields: SqliteTableField[] = [
        {name: 'maxLogsLines', type: 'INTEGER', unique: false, primary: false},
        {name: 'maxMonitoredTasksQuantity', type: 'INTEGER', unique: false, primary: false},
        {name: 'monitorizationTasksInterval', type: 'INTEGER', unique: false, primary: false}
    ]

    async getSettings(): Promise<ISettings> {
        const settings = await this.findById('1')
        if (!settings) {
            return await this.create({
                _id: '1',
                maxLogsLines: 10000,
                maxMonitoredTasksQuantity: 1000,
                monitorizationTasksInterval: 60
            } as any)
        }
        return settings
    }

    async updateSettings(updates: Partial<ISettings>): Promise<ISettings> {
        const settings = await this.getSettings()
        const newSettings = {...settings, ...updates}
        await this.update('1', newSettings)
        return newSettings
    }
}
