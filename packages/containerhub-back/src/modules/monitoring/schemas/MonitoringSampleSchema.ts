import {z} from 'zod'

export const MonitoringMetricsSchema = z.object({
    sampledAt: z.string().nullable(),
    cpuUsage: z.object({cpuPercentage: z.number().nullable(), cpuCoreQuantity: z.number().nullable()}),
    memoryUsage: z.object({memoryTotalUsage: z.number().nullable(), memoryLimitUsage: z.number().nullable()}),
    ioUsage: z.object({readIoBytes: z.number().nullable(), writeIoBytes: z.number().nullable()}),
    networksUsage: z.array(z.object({network: z.string(), rxBytes: z.number(), txBytes: z.number()}))
})

export const MonitoringSampleBaseSchema = z.object({
    sampleKey: z.string().min(1), configurationId: z.string().min(1), serviceId: z.string().min(1), serviceName: z.string().min(1),
    taskId: z.string().min(1), nodeId: z.string().nullable(), sampledAt: z.coerce.date(), metrics: MonitoringMetricsSchema
})
export const MonitoringSampleSchema = MonitoringSampleBaseSchema.extend({_id: z.coerce.string(), createdAt: z.coerce.date()})
