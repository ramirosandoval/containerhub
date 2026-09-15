import winston from 'winston'
import Docker from 'dockerode'
import {AuditServiceFactory} from '@drax/audit-back'
import {ITaskMonitorization} from '../models/TaskMonitorization.js'
import {TaskMonitorizationFactory} from '../factory/TaskMonitorizationFactory.js'
import {SettingsService} from '../../settings/services/SettingsService.js'

const docker = new Docker({socketPath: process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock'})

class TaskMonitorizationsManager {
    private static instance: TaskMonitorizationsManager
    private memoryTaskMonitorizations: ITaskMonitorization[] = []
    private maxTaskMonitorizationsQuantity = 1000
    private checkInterval = 60000
    private started = false
    private timeoutId: NodeJS.Timeout | null = null

    private constructor() {}

    public static getInstance(): TaskMonitorizationsManager {
        if (!TaskMonitorizationsManager.instance) {
            TaskMonitorizationsManager.instance = new TaskMonitorizationsManager()
        }
        return TaskMonitorizationsManager.instance
    }

    public async start() {
        if (this.started) return
        this.started = true
        await this.loadTaskMonitorizationsFromDB()
        await this.checkTasks()
    }

    public stop() {
        this.started = false
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
        }
    }

    private async loadTaskMonitorizationsFromDB() {
        try {
            const settings = await SettingsService.getSettings()
            this.maxTaskMonitorizationsQuantity = settings.maxMonitoredTasksQuantity
            this.checkInterval = settings.monitorizationTasksInterval * 1000

            const docs = await TaskMonitorizationFactory.getRepository().getRecent(this.maxTaskMonitorizationsQuantity)
            // Memory array is used to compare what's running vs what's removed
            // We'll keep the newest ones
            this.memoryTaskMonitorizations = docs

            await this.purgeTaskMonitorizationsThatSurpassMaxQuantity()
        } catch (error) {
            winston.error(`Error loading task monitorizations from db: ${error}`)
        }
    }

    private async checkTasks() {
        if (!this.started) return

        try {
            const settings = await SettingsService.getSettings()
            this.maxTaskMonitorizationsQuantity = settings.maxMonitoredTasksQuantity
            this.checkInterval = settings.monitorizationTasksInterval * 1000

            const runningDockerTasks = await docker.listTasks({filters: {'desired-state': ['running']}})
            const allNodes = await docker.listNodes()
            const allServices = await docker.listServices()
            
            await this.createTaskMonitorizationsFromRunningTasks(runningDockerTasks, allServices, allNodes)
            await this.createTaskMonitorizationsFromRemovedTasks(runningDockerTasks)
            await this.purgeTaskMonitorizationsThatSurpassMaxQuantity()
        } catch (error) {
            winston.error(`Error while checking tasks for monitorization: ${error}`)
        } finally {
            if (this.started) {
                this.timeoutId = setTimeout(() => this.checkTasks(), this.checkInterval)
            }
        }
    }

    private async createTaskMonitorizationsFromRemovedTasks(runningDockerTasks: any[]) {
        try {
            for (const taskMonitorization of this.memoryTaskMonitorizations) {
                if (taskMonitorization.status === 'removed') continue

                const dockerTaskIsRunning = runningDockerTasks.find((task) => task.ID === taskMonitorization.taskId)

                if (!dockerTaskIsRunning) {
                    const removedTaskMonitorizationExists = this.memoryTaskMonitorizations.find(
                        (existing) => existing.taskId === taskMonitorization.taskId && existing.status === 'removed'
                    )

                    if (!removedTaskMonitorizationExists) {
                        await this.saveTaskMonitorization({
                            ID: taskMonitorization.taskId,
                            NodeID: taskMonitorization.nodeId,
                            ServiceID: taskMonitorization.serviceId,
                            Status: {State: 'removed'}
                        }, taskMonitorization.serviceName, taskMonitorization.nodeName)
                    }
                }
            }
        } catch (error) {
            winston.error(`Error in createTaskMonitorizationsFromRemovedTasks: ${error}`)
        }
    }

    private async createTaskMonitorizationsFromRunningTasks(runningTasks: any[], allServices: any[], allNodes: any[]) {
        try {
            for (const task of runningTasks) {
                if (task.Status.State !== 'running') continue
                
                const taskMonitorizationIsOnMemory = this.memoryTaskMonitorizations.find(
                    (taskMonitorization) => taskMonitorization.taskId === task.ID && taskMonitorization.status === 'running'
                )

                if (!taskMonitorizationIsOnMemory) {
                    const serviceName = allServices.find(s => s.ID === task.ServiceID)?.Spec?.Name ?? task.ServiceID
                    const nodeName = allNodes.find(n => n.ID === task.NodeID)?.Description?.Hostname ?? task.NodeID
                    await this.saveTaskMonitorization(task, serviceName, nodeName)
                }
            }
        } catch (error) {
            winston.error(`Error in createTaskMonitorizationsFromRunningTasks: ${error}`)
        }
    }

    private async saveTaskMonitorization(task: any, serviceName: string, nodeName: string) {
        try {
            const {ID: taskId, NodeID: nodeId, ServiceID: serviceId, Status: {State: taskState}} = task

            // Heuristica legacy para el usuario:
            let modifiedBy = null
            
            // Buscar un log de auditoría reciente para el recurso `Service` con action UPDATE/RESTART/DELETE
            // dentro de los últimos 2 minutos, usando la API abstracta de Drax (soporta Mongo y SQLite).
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
            try {
                const recentAudits = await AuditServiceFactory.instance.find({
                    limit: 1,
                    orderBy: 'createdAt',
                    order: 'desc',
                    filters: [
                        {field: 'entity', operator: 'eq', value: 'Service'},
                        {field: 'resourceId', operator: 'eq', value: serviceId},
                        {field: 'action', operator: 'in', value: ['UPDATE', 'RESTART', 'DELETE']},
                        {field: 'createdAt', operator: 'gte', value: twoMinutesAgo.toISOString()}
                    ]
                })
                const recentAudit = recentAudits[0]
                if (recentAudit && recentAudit.user) {
                    modifiedBy = recentAudit.user.username ?? null
                }
            } catch (e) {
                winston.warn(`Could not query audit for modifiedBy heuristic: ${e}`)
            }

            const docData: ITaskMonitorization = {
                date: new Date(),
                status: taskState,
                taskId,
                serviceId,
                serviceName,
                nodeId,
                nodeName,
                modifiedBy
            }

            const doc = await TaskMonitorizationFactory.getRepository().createDoc(docData)
            this.memoryTaskMonitorizations.unshift(doc)
        } catch (error) {
            winston.error(`Error saving new task monitorization: ${error}`)
        }
    }

    private async purgeTaskMonitorizationsThatSurpassMaxQuantity() {
        try {
            if (this.memoryTaskMonitorizations.length > this.maxTaskMonitorizationsQuantity) {
                this.memoryTaskMonitorizations = this.memoryTaskMonitorizations.slice(0, this.maxTaskMonitorizationsQuantity)
            }
            await TaskMonitorizationFactory.getRepository().purgeOld(this.maxTaskMonitorizationsQuantity)
        } catch (error) {
            winston.error(`Error removing excess task monitorizations: ${error}`)
        }
    }
}

export const taskMonitorizationsManager = TaskMonitorizationsManager.getInstance()
