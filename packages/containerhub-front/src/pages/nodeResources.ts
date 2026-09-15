export type NodeResources = {NanoCPUs?: number; MemoryBytes?: number}

export function formatNodeResources(resources: NodeResources | null): string {
    if (typeof resources?.NanoCPUs !== 'number' || typeof resources.MemoryBytes !== 'number') return '—'
    return `${resources.NanoCPUs / 1_000_000_000} CPU / ${(resources.MemoryBytes / 1024 ** 3).toFixed(2)} GB`
}
