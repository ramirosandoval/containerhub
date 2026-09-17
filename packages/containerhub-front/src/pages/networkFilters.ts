export type Network = {
    Name?: string
    Created?: string
    Driver?: string
    Attachable?: boolean
    IPAM?: {Driver?: string; Config?: Array<{Subnet?: string; Gateway?: string}>}
}

export type NetworkFilters = {
    name?: string
    attachable?: boolean
    driver?: string
    since?: string
    until?: string
    subnet?: string
}

function localDate(created: string | Date | undefined): string | undefined {
    if (typeof created === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(created)) return created
    const date = new Date(created ?? '')
    if (Number.isNaN(date.getTime())) return undefined
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

export function filterNetworks(networks: Network[], filters: NetworkFilters): Network[] {
    const name = filters.name?.trim().toLocaleLowerCase()
    const subnet = filters.subnet?.trim().toLocaleLowerCase()

    return networks.filter((network) => {
        const created = localDate(network.Created)
        if (name && !network.Name?.toLocaleLowerCase().includes(name)) return false
        if (filters.attachable !== undefined && network.Attachable !== filters.attachable) return false
        if (filters.driver && network.Driver !== filters.driver) return false
        if (filters.since && (!created || created < filters.since)) return false
        if (filters.until && (!created || created > filters.until)) return false
        if (subnet && !network.IPAM?.Config?.[0]?.Subnet?.toLocaleLowerCase().includes(subnet)) return false
        return true
    })
}

type DraxNetworkFilter = {field?: string; name?: string; operator?: string; value?: unknown}

export function networkFiltersFromDrax(draxFilters: DraxNetworkFilter[] | undefined): NetworkFilters {
    if (!draxFilters) return {}
    const filters: NetworkFilters = {}
    for (const filter of draxFilters) {
        const field = filter.field ?? filter.name
        if (field === 'name' && typeof filter.value === 'string') filters.name = filter.value
        else if (field === 'attachable' && typeof filter.value === 'boolean') filters.attachable = filter.value
        else if (field === 'driver' && typeof filter.value === 'string') filters.driver = filter.value
        else if (field === 'created' && filter.operator === 'gte') filters.since = localDate(filter.value as string | Date)
        else if (field === 'created' && filter.operator === 'lte') filters.until = localDate(filter.value as string | Date)
        else if (field === 'subnet' && typeof filter.value === 'string') filters.subnet = filter.value
    }
    return filters
}
