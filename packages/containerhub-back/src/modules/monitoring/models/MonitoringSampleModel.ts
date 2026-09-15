import mongoose, {type PaginateModel} from 'mongoose'
import mongoosePaginate from 'mongoose-paginate-v2'
import type {IMonitoringSample} from '../interfaces/IMonitoringSample.js'

const monitoringSampleSchema = new mongoose.Schema<IMonitoringSample>({
    sampleKey: {type: String, required: true, unique: true},
    configurationId: {type: String, required: true, index: true}, serviceId: {type: String, required: true}, serviceName: {type: String, required: true},
    taskId: {type: String, required: true}, nodeId: {type: String, default: null}, sampledAt: {type: Date, required: true, index: true},
    metrics: {type: mongoose.Schema.Types.Mixed, required: true}
}, {timestamps: {createdAt: true, updatedAt: false}})
monitoringSampleSchema.plugin(mongoosePaginate)
export const MonitoringSampleModel = mongoose.model<IMonitoringSample, PaginateModel<IMonitoringSample>>('MonitoringSample', monitoringSampleSchema)
