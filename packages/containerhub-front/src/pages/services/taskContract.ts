export type ServiceTask = {
    id: string
    nodeId?: string
    containerId?: string
    createdAt?: string
    updatedAt?: string
    state?: string
}

type TaskRecord = Record<string, unknown>

function record(value: unknown): TaskRecord | undefined {
    return value && typeof value === 'object' ? value as TaskRecord : undefined
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined
}

export function toServiceTask(value: unknown): ServiceTask | undefined {
    const task = record(value)
    if (!task) return undefined
    const status = record(task.Status)
    const containerStatus = record(status?.ContainerStatus)
    const id = stringValue(task.id) ?? stringValue(task.ID)
    if (!id) return undefined
    return Object.fromEntries(Object.entries({
        id,
        nodeId: stringValue(task.nodeId) ?? stringValue(task.NodeID),
        containerId: stringValue(task.containerId) ?? stringValue(containerStatus?.ContainerID),
        createdAt: stringValue(task.createdAt) ?? stringValue(task.CreatedAt),
        updatedAt: stringValue(task.updatedAt) ?? stringValue(task.UpdatedAt),
        state: stringValue(task.state) ?? stringValue(status?.State)
    }).filter(([, propertyValue]) => propertyValue !== undefined)) as ServiceTask
}
