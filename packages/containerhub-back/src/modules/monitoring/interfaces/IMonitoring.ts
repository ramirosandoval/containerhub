import type {z} from 'zod'
import type {MonitoringBaseSchema, MonitoringCreateSchema, MonitoringSchema} from '../schemas/MonitoringSchema.js'

export type IMonitoring = z.infer<typeof MonitoringSchema>
export type IMonitoringBase = z.infer<typeof MonitoringBaseSchema>
export type IMonitoringCreate = z.infer<typeof MonitoringCreateSchema>
