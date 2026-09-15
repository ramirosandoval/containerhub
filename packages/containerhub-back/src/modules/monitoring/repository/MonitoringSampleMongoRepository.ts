import {AbstractMongoRepository} from '@drax/crud-back'
import type {IMonitoringSample, IMonitoringSampleBase} from '../interfaces/IMonitoringSample.js'
import {MonitoringSampleModel} from '../models/MonitoringSampleModel.js'

export class MonitoringSampleMongoRepository extends AbstractMongoRepository<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>> {
    constructor() {
        super()
        this._model = MonitoringSampleModel
        this._searchFields = ['serviceName', 'taskId']
    }
}
