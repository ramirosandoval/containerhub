import { restGet, restPut } from '@/rest'

export interface ISettings {
    maxLogsLines: number
    maxMonitoredTasksQuantity: number
    monitorizationTasksInterval: number
}

export class SettingsApi {
    static async getSettings(): Promise<ISettings> {
        return restGet<ISettings>('/api/settings')
    }

    static async updateSettings(settings: Partial<ISettings>): Promise<ISettings> {
        return restPut<ISettings>('/api/settings', settings)
    }
}
