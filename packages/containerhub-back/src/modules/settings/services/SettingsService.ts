import { Settings, type ISettings } from '../models/Settings.js'
import { COMMON, CommonConfig, DraxConfig, ZodErrorToValidationError } from '@drax/common-back'
import {z} from 'zod'
import {SettingsFactory} from '../factory/SettingsFactory.js'

export const SettingsUpdateSchema = z.object({
    maxLogsLines: z.number().int().min(1).optional(),
    maxMonitoredTasksQuantity: z.number().int().min(1).optional(),
    monitorizationTasksInterval: z.number().int().min(1).optional()
}).strict()

export class SettingsService {
    /**
     * Gets the singleton settings document, creating it with defaults if it doesn't exist.
     */
    static async getSettings(): Promise<ISettings> {
        return await SettingsFactory.getRepository().getSettings()
    }

    /**
     * Updates the singleton settings document.
     */
    static async updateSettings(newSettings: unknown): Promise<ISettings> {
        let validatedSettings: z.infer<typeof SettingsUpdateSchema>
        try {
            validatedSettings = SettingsUpdateSchema.parse(newSettings)
        } catch (error) {
            if (error instanceof z.ZodError) throw ZodErrorToValidationError(error, newSettings)
            throw error
        }

        return await SettingsFactory.getRepository().updateSettings(validatedSettings)
    }
}
