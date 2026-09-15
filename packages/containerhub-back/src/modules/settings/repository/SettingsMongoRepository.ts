import {Settings, type ISettings} from '../models/Settings.js'

export class SettingsMongoRepository {
    async getSettings(): Promise<ISettings> {
        let settings = await Settings.findOne()
        if (!settings) {
            settings = await Settings.create({})
        }
        return settings
    }

    async updateSettings(updates: Partial<ISettings>): Promise<ISettings> {
        let settings = await Settings.findOne()
        if (!settings) {
            settings = new Settings()
        }

        if (updates.maxLogsLines !== undefined) settings.maxLogsLines = updates.maxLogsLines
        if (updates.maxMonitoredTasksQuantity !== undefined) settings.maxMonitoredTasksQuantity = updates.maxMonitoredTasksQuantity
        if (updates.monitorizationTasksInterval !== undefined) settings.monitorizationTasksInterval = updates.monitorizationTasksInterval

        await settings.save()
        return settings
    }
}
