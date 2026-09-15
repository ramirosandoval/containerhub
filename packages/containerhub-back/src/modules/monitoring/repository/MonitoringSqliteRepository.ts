import {AbstractSqliteRepository} from '@drax/crud-back'
import type {SqliteTableField} from '@drax/common-back'
import type {IMonitoring, IMonitoringBase} from '../interfaces/IMonitoring.js'

export class MonitoringSqliteRepository extends AbstractSqliteRepository<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>> {
    protected tableName = 'MonitoringConfiguration'
    protected searchFields = ['serviceName']
    protected populateFields = []
    protected tableFields: SqliteTableField[] = [
        {name: 'serviceId', type: 'TEXT', unique: true, primary: false},
        ...['serviceName', 'serviceStack', 'type', 'status', 'collectionInterval', 'collectionType', 'since', 'until', 'createdAt', 'updatedAt'].map((name): SqliteTableField => ({name, type: 'TEXT', unique: false, primary: false})),
        {name: 'holdingTime', type: 'INTEGER', unique: false, primary: false}
    ]
    override async findByIds(...parameters: Parameters<AbstractSqliteRepository<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>>['findByIds']>): Promise<IMonitoring[]> { return await super.findByIds(...parameters) ?? [] }
    override async findBy(...parameters: Parameters<AbstractSqliteRepository<IMonitoring, IMonitoringBase, Partial<IMonitoringBase>>['findBy']>): Promise<IMonitoring[]> { return await super.findBy(...parameters) ?? [] }
    close(): void { this.db.close() }
}
