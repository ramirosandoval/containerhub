import {restGet} from '../rest'

export interface ITaskMonitorization {
    _id: string
    date: string
    status: 'running' | 'removed'
    taskId: string
    nodeId: string
    nodeName: string
    serviceId: string
    serviceName: string
    modifiedBy: string | null
}

export interface PaginatedTaskMonitorizations {
    items: ITaskMonitorization[]
    total: number
    page: number
    limit: number
    totalPages: number
}

export const fetchTaskMonitorizations = async (page = 1, limit = 20): Promise<PaginatedTaskMonitorizations> => {
    return restGet<PaginatedTaskMonitorizations>('/api/task-monitorizations', {page, limit})
}
