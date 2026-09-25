import type {IDraxFieldFilter} from '@drax/crud-share'

export function activeMonitoringFilters(filters: IDraxFieldFilter[]): IDraxFieldFilter[] {
    return filters.filter(filter => Boolean(filter.field) && (filter.operator === 'empty' || (filter.value !== null && filter.value !== undefined)))
}
