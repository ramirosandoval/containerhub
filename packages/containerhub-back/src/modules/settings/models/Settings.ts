import mongoose, { Schema } from 'mongoose'

export interface ISettings {
    maxLogsLines: number
    maxMonitoredTasksQuantity: number
    monitorizationTasksInterval: number
}

const SettingsSchema = new Schema<ISettings>({
    maxLogsLines: { type: Number, required: true, default: 10000 },
    maxMonitoredTasksQuantity: { type: Number, required: true, default: 1000 },
    monitorizationTasksInterval: { type: Number, required: true, default: 60 }
}, {
    timestamps: true
})

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema)
