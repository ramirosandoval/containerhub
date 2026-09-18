import {TaskMonitorizationModel, type ITaskMonitorization} from '../models/TaskMonitorization.js'
import {AbstractMongoRepository} from '@drax/crud-back'

export class TaskMonitorizationMongoRepository extends AbstractMongoRepository<ITaskMonitorization, ITaskMonitorization, Partial<ITaskMonitorization>> {
    constructor() {
        super()
        this._model = TaskMonitorizationModel as any
        this._searchFields = ['taskId', 'serviceName']
    }

    async getRecent(limit: number): Promise<ITaskMonitorization[]> {
        return await TaskMonitorizationModel.find().sort({date: -1}).limit(limit)
    }

    async count(): Promise<number> {
        return await TaskMonitorizationModel.countDocuments()
    }

    async createDoc(data: ITaskMonitorization): Promise<ITaskMonitorization> {
        const doc = new TaskMonitorizationModel(data)
        await doc.save()
        return doc
    }

    async purgeOld(maxQuantity: number): Promise<void> {
        const toKeep = await TaskMonitorizationModel.find().sort({date: -1}).limit(maxQuantity).select('_id')
        const idsToKeep = toKeep.map(doc => doc._id)
        await TaskMonitorizationModel.deleteMany({_id: {$nin: idsToKeep}})
    }
}
