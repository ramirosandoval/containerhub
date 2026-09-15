import {z} from 'zod'

export const MonitoringOptionsSchema = z.object({
    type: z.enum(['calendar', 'permanent']),
    collectionInterval: z.enum(['15s', '30s', '45s', '60s']),
    collectionType: z.enum(['replic', 'global']),
    since: z.iso.date().nullable().optional(),
    until: z.iso.date().nullable().optional(),
    holdingTime: z.number().int().positive().nullable().optional()
})
export const MonitoringCreateSchema = MonitoringOptionsSchema.extend({serviceIds: z.array(z.string().min(1)).min(1)}).strict().superRefine((configuration, context) => {
    if (configuration.type === 'calendar' && (!configuration.since || !configuration.until || configuration.since >= configuration.until)) {
        context.addIssue({code: 'custom', path: ['until'], message: 'Calendar requires valid since < until dates'})
    }
    if (configuration.type === 'permanent' && !configuration.holdingTime) {
        context.addIssue({code: 'custom', path: ['holdingTime'], message: 'Permanent monitoring requires positive holdingTime'})
    }
})
export const MonitoringBaseSchema = MonitoringOptionsSchema.extend({
    serviceId: z.string().min(1), serviceName: z.string().min(1), serviceStack: z.string().nullable(),
    status: z.enum(['monitoring', 'paused']),
    since: z.iso.date().nullable(), until: z.iso.date().nullable(), holdingTime: z.number().int().positive().nullable()
})
export const MonitoringSchema = MonitoringBaseSchema.extend({
    _id: z.coerce.string(), createdAt: z.coerce.date(), updatedAt: z.coerce.date()
})
