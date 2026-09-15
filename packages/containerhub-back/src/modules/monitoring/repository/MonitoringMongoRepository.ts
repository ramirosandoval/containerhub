import {AbstractMongoRepository} from '@drax/crud-back'
import type {IMonitoring, IMonitoringBase} from '../interfaces/IMonitoring.js'
import {MonitoringModel} from '../models/MonitoringModel.js'

export class MonitoringMongoRepository extends AbstractMongoRepository<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>> {
    constructor() {
        super()
        this._model = MonitoringModel
        this._searchFields = ['serviceName']
    }
}
