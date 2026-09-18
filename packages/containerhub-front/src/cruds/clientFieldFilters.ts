import type {IDraxFieldFilter} from '@drax/crud-share'

type FieldValueResolver<T> = (item: T, field: string) => unknown

function nestedValue(item: unknown, field: string): unknown {
    return field.split('.').reduce<unknown>((value, part) => {
        if (value === null || typeof value !== 'object') return undefined
        return (value as Record<string, unknown>)[part]
    }, item)
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function equals(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(actual)) return actual.some((value) => equals(value, expected))
    if (actual instanceof Date || expected instanceof Date) {
        return new Date(actual as string | number | Date).getTime() === new Date(expected as string | number | Date).getTime()
    }
    return actual === expected
}

function listValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return value.split(',').map((entry) => entry.trim())
    return [value]
}

function compare(actual: unknown, expected: unknown): number {
    if (actual instanceof Date || expected instanceof Date) {
        return new Date(actual as string | number | Date).getTime() - new Date(expected as string | number | Date).getTime()
    }
    if (typeof actual === 'number' && typeof expected === 'number') return actual - expected
    return String(actual).localeCompare(String(expected))
}

function matchesFilter(actual: unknown, filter: IDraxFieldFilter): boolean {
    switch (filter.operator) {
        case 'eq': return equals(actual, filter.value)
        case 'ne': return !equals(actual, filter.value)
        case 'like': return String(actual ?? '').toLocaleLowerCase().includes(String(filter.value).toLocaleLowerCase())
        case 'empty': return isEmpty(actual)
        case 'gt': return !isEmpty(actual) && compare(actual, filter.value) > 0
        case 'gte': return !isEmpty(actual) && compare(actual, filter.value) >= 0
        case 'lt': return !isEmpty(actual) && compare(actual, filter.value) < 0
        case 'lte': return !isEmpty(actual) && compare(actual, filter.value) <= 0
        case 'in': return listValue(filter.value).some((value) => equals(actual, value))
        case 'nin': return listValue(filter.value).every((value) => !equals(actual, value))
        default: return false
    }
}

export function applyClientFieldFilters<T>(
    items: T[],
    filters: IDraxFieldFilter[] = [],
    resolveValue: FieldValueResolver<T> = nestedValue,
): T[] {
    const activeFilters = filters.filter((filter) =>
        filter.field && (filter.operator === 'empty' || !isEmpty(filter.value)),
    )
    if (!activeFilters.length) return items

    return items.filter((item) => activeFilters.every((filter) =>
        matchesFilter(resolveValue(item, filter.field), filter),
    ))
}
