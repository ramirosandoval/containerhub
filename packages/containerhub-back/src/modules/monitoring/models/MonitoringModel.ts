import mongoose, {type PaginateModel} from 'mongoose'
import mongoosePaginate from 'mongoose-paginate-v2'
import type {IMonitoring} from '../interfaces/IMonitoring.js'

const monitoringModelSchema = new mongoose.Schema<IMonitoring>({
    serviceId: {type: String, required: true, unique: true},
    serviceName: {type: String, required: true}, serviceStack: {type: String, default: null},
    type: {type: String, enum: ['calendar', 'permanent'], required: true},
    status: {type: String, enum: ['monitoring', 'paused'], required: true},
    collectionInterval: {type: String, enum: ['15s', '30s', '45s', '60s'], required: true},
    collectionType: {type: String, enum: ['replic', 'global'], required: true},
    since: {type: String, default: null}, until: {type: String, default: null}, holdingTime: {type: Number, default: null}
}, {timestamps: true})
monitoringModelSchema.plugin(mongoosePaginate)
export const MonitoringModel = mongoose.model<IMonitoring, PaginateModel<IMonitoring>>('MonitoringConfiguration', monitoringModelSchema)
