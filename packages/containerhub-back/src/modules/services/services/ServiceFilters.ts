import type {ServiceModel} from '../helpers/mapInspectToServiceModel.js'

type ServiceFilterOperator = 'eq' | 'like' | 'empty' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin'
type ServiceFilterScalar = string | number | boolean
type ServiceFilterValue = ServiceFilterScalar | ServiceFilterScalar[]
type ServiceField = 'id' | 'name' | 'stack' | 'createdAt' | 'updatedAt'
type ServiceFilterField = ServiceField | 'image' | 'ports'

const SERVICE_FILTER_FIELDS = new Set<string>([
    'id', 'name', 'stack', 'image', 'ports', 'createdAt', 'updatedAt'
])
const SERVICE_FILTER_OPERATORS = new Set<ServiceFilterOperator>([
    'eq', 'like', 'empty', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'nin'
])

export type ServiceFilter = {
    field: ServiceFilterField
    operator: ServiceFilterOperator
    value: ServiceFilterValue | null
}

function isServiceFilterField(field: string): field is ServiceFilterField {
    return SERVICE_FILTER_FIELDS.has(field)
}

function parseServiceFilterField(field: unknown, index: number): ServiceFilterField {
    if (typeof field !== 'string' || !isServiceFilterField(field)) {
        throw new Error(`filter at index ${index} has invalid field "${String(field)}"`)
    }
    return field
}

export function parseServiceFilters(raw: unknown): ServiceFilter[] {
    if (raw === undefined || raw === null || raw === '') return []
    let parsed: unknown
    try {
        parsed = JSON.parse(String(raw))
    } catch {
        throw new Error('filters must be a JSON-encoded array')
    }
    if (!Array.isArray(parsed)) throw new Error('filters must be a JSON-encoded array')

    return parsed.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
            throw new Error(`filter at index ${index} must be an object`)
        }
        const candidate = entry as Record<string, unknown>
        const field = parseServiceFilterField(candidate.field, index)
        const operator = candidate.operator
        const value = candidate.value
        if (typeof operator !== 'string' || !SERVICE_FILTER_OPERATORS.has(operator as ServiceFilterOperator)) {
            throw new Error(`filter at index ${index} has invalid operator "${String(operator)}"`)
        }
        const validScalar = (item: unknown) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
        if (value !== null && !validScalar(value) && !(Array.isArray(value) && value.every(validScalar))) {
            throw new Error(`filter at index ${index} value must be string, number, boolean, an array of those values, or null`)
        }
        return {field, operator: operator as ServiceFilterOperator, value: value as ServiceFilterValue | null}
    })
}

export function serviceOrderValue(service: ServiceModel, orderBy: string): string | null {
    switch (orderBy) {
        case 'id': return service.id
        case 'name': return service.name ?? null
        case 'stack': return service.stack
        case 'createdAt': return service.createdAt
        case 'updatedAt': return service.updatedAt
        case 'image.nameWithTag': return service.image.nameWithTag
        default: return null
    }
}

function serviceFilterValue(service: ServiceModel, field: ServiceFilterField): unknown {
    if (field === 'image') return service.image.nameWithTag
    if (field === 'ports') return service.ports.map((port) => `${port.hostPort}:${port.containerPort}`).join(',')
    return service[field]
}

function isEmptyFilterValue(value: unknown): boolean {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function equalFilterValue(actual: unknown, expected: ServiceFilterScalar): boolean {
    return String(actual ?? '') === String(expected)
}

function compareFilterValue(actual: unknown, expected: ServiceFilterScalar, field: ServiceFilterField): number {
    if (field === 'createdAt' || field === 'updatedAt') {
        return Date.parse(String(actual ?? '')) - Date.parse(String(expected))
    }
    return String(actual ?? '').localeCompare(String(expected), undefined, {numeric: true, sensitivity: 'base'})
}

export function matchesServiceFilters(service: ServiceModel, filters: ServiceFilter[] = []): boolean {
    return filters.every((filter) => {
        const actual = serviceFilterValue(service, filter.field)
        if (filter.operator === 'empty') return isEmptyFilterValue(actual)
        if (isEmptyFilterValue(filter.value)) return true

        const expectedValues = Array.isArray(filter.value) ? filter.value : [filter.value as ServiceFilterScalar]
        if (filter.operator === 'in') return expectedValues.some((expected) => equalFilterValue(actual, expected))
        if (filter.operator === 'nin') return expectedValues.every((expected) => !equalFilterValue(actual, expected))
        const expected = expectedValues[0]
        if (filter.operator === 'eq') return equalFilterValue(actual, expected)
        if (filter.operator === 'ne') return !equalFilterValue(actual, expected)
        if (filter.operator === 'like') return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase())

        const comparison = compareFilterValue(actual, expected, filter.field)
        if (Number.isNaN(comparison)) return false
        if (filter.operator === 'gt') return comparison > 0
        if (filter.operator === 'gte') return comparison >= 0
        if (filter.operator === 'lt') return comparison < 0
        return comparison <= 0
    })
}
