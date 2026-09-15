export type TaskInspectTreeItem = {id: string; key: string; title: string; value: string; type: string; children?: TaskInspectTreeItem[]}

export function taskInspectTree(inspection: Record<string, unknown>, path: string[] = []): TaskInspectTreeItem[] {
    return Object.entries(inspection).map(([key, fieldValue]) => {
        const fieldPath = [...path, key]
        const id = JSON.stringify(fieldPath)
        const type = fieldValue === null ? 'null' : Array.isArray(fieldValue) ? 'array' : typeof fieldValue
        if (fieldValue !== null && typeof fieldValue === 'object') {
            const children = taskInspectTree(fieldValue as Record<string, unknown>, fieldPath)
            const value = type === 'array' ? (children.length ? `[${children.length}]` : '[]') : (children.length ? '' : '{}')
            return {id, key, title: `${key}${value ? `: ${value}` : ''}`, value, type, ...(children.length ? {children} : {})}
        }
        const value = fieldValue === '' ? '""' : String(fieldValue)
        return {id, key, title: `${key}: ${value}`, value, type}
    })
}
