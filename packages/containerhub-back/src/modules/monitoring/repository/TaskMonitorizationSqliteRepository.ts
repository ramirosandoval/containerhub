import {AbstractSqliteRepository} from '@drax/crud-back'
import type {SqliteTableField} from '@drax/common-back'
import type {ITaskMonitorization} from '../models/TaskMonitorization.js'
import crypto from 'crypto'

export class TaskMonitorizationSqliteRepository extends AbstractSqliteRepository<ITaskMonitorization, ITaskMonitorization, Partial<ITaskMonitorization>> {
    protected tableName = 'TaskMonitorization'
    protected searchFields = ['taskId', 'serviceName']
    protected populateFields = []
    protected jsonFields = []
    protected tableFields: SqliteTableField[] = [
        ...['status', 'taskId', 'nodeId', 'nodeName', 'serviceId', 'serviceName', 'modifiedBy'].map((name): SqliteTableField => ({name, type: 'TEXT', unique: false, primary: false})),
        {name: 'date', type: 'TEXT', unique: false, primary: false}
    ]

    async getRecent(limit: number): Promise<ITaskMonitorization[]> {
        const rows = this.db.prepare(`SELECT * FROM ${this.tableName} ORDER BY date DESC LIMIT ?`).all(limit)
        return await Promise.all(rows.map((row: any) => this.prepareItem(row)))
    }

    async getPaginated(skip: number, limit: number): Promise<ITaskMonitorization[]> {
        const rows = this.db.prepare(`SELECT * FROM ${this.tableName} ORDER BY date DESC LIMIT ? OFFSET ?`).all(limit, skip)
        return await Promise.all(rows.map((row: any) => this.prepareItem(row)))
    }

    async count(): Promise<number> {
        const result = this.db.prepare(`SELECT count(1) AS count FROM ${this.tableName}`).get()
        return result.count
    }

    async createDoc(data: ITaskMonitorization): Promise<ITaskMonitorization> {
        const id = crypto.randomUUID()
        const toSave = {
            ...data,
            id,
            date: data.date instanceof Date ? data.date.toISOString() : data.date
        }
        await this.create(toSave as any)
        return data
    }

    async purgeOld(maxQuantity: number): Promise<void> {
        if (maxQuantity < 1) return
        this.db.prepare(`
            DELETE FROM ${this.tableName} 
            WHERE id NOT IN (
                SELECT id FROM ${this.tableName} 
                ORDER BY date DESC 
                LIMIT ?
            )
        `).run(maxQuantity)
    }
}
