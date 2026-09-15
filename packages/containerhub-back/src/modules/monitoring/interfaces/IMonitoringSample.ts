import type {z} from 'zod'
import type {MonitoringMetricsSchema, MonitoringSampleBaseSchema, MonitoringSampleSchema} from '../schemas/MonitoringSampleSchema.js'

export type IMonitoringMetrics = z.infer<typeof MonitoringMetricsSchema>
export type IMonitoringSampleBase = z.infer<typeof MonitoringSampleBaseSchema>
export type IMonitoringSample = z.infer<typeof MonitoringSampleSchema>
