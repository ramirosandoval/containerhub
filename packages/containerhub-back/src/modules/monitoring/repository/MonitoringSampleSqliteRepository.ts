import {AbstractSqliteRepository} from '@drax/crud-back'
import type {SqliteTableField} from '@drax/common-back'
import type {IDraxFindOptions} from '@drax/crud-share'
import type {IMonitoringSample, IMonitoringSampleBase} from '../interfaces/IMonitoringSample.js'

export class MonitoringSampleSqliteRepository extends AbstractSqliteRepository<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>> {
    protected tableName = 'MonitoringSample'
    protected searchFields = ['serviceName', 'taskId']
    protected populateFields = []
    protected jsonFields = ['metrics']
    protected tableFields: SqliteTableField[] = [
        {name: 'sampleKey', type: 'TEXT', unique: true, primary: false},
        ...['configurationId', 'serviceId', 'serviceName', 'taskId', 'nodeId', 'sampledAt', 'createdAt'].map((name): SqliteTableField => ({name, type: 'TEXT', unique: false, primary: false})),
        {name: 'metrics', type: 'TEXT', unique: false, primary: false}
    ]
    override async find(options: IDraxFindOptions): Promise<IMonitoringSample[]> {
        return super.find({...options, filters: options.filters?.map(filter => ({...filter, value: filter.value instanceof Date ? filter.value.toISOString() : filter.value}))})
    }
    override async findByIds(...parameters: Parameters<AbstractSqliteRepository<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>>['findByIds']>): Promise<IMonitoringSample[]> { return await super.findByIds(...parameters) ?? [] }
    override async findBy(...parameters: Parameters<AbstractSqliteRepository<IMonitoringSample, IMonitoringSampleBase, Partial<IMonitoringSampleBase>>['findBy']>): Promise<IMonitoringSample[]> { return await super.findBy(...parameters) ?? [] }
    close(): void { this.db.close() }
}
