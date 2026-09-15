import mongoose, {Document, Schema} from 'mongoose'

export interface ITaskMonitorization {
    date: Date
    status: 'running' | 'removed'
    taskId: string
    nodeId: string
    nodeName: string
    serviceId: string
    serviceName: string
    modifiedBy: string | null
}

export interface ITaskMonitorizationDocument extends ITaskMonitorization, Document {}

const TaskMonitorizationSchema = new Schema<ITaskMonitorizationDocument>({
    date: {type: Date, required: true},
    status: {type: String, enum: ['running', 'removed'], required: true},
    taskId: {type: String, required: true},
    nodeId: {type: String, required: true},
    nodeName: {type: String, required: true},
    serviceId: {type: String, required: true},
    serviceName: {type: String, required: true},
    modifiedBy: {type: String, default: null}
}, {
    timestamps: false,
    collection: 'taskmonitorizations'
})

// Indice para recuperar rápidamente por fecha descendente
TaskMonitorizationSchema.index({date: -1})

export const TaskMonitorizationModel = mongoose.model<ITaskMonitorizationDocument>('TaskMonitorization', TaskMonitorizationSchema)
