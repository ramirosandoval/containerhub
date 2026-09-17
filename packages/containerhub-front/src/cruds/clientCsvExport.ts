import type {IDraxCrudProvider, IDraxCrudProviderExportResult, IDraxExportOptions, IDraxPaginateOptions} from '@drax/crud-share'

function list(value: string[] | string | undefined): string[] {
    return Array.isArray(value) ? value : value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
}

function nestedValue(item: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, item)
}

function cell(value: unknown, separator: string): string {
    if (value === null || value === undefined) return ''
    const raw = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
    return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

async function exportClientCsv<T>(provider: Pick<IDraxCrudProvider<T, never, never>, 'paginate'>, options: IDraxExportOptions, pageSize: number): Promise<IDraxCrudProviderExportResult> {
    if (options.format !== 'CSV') throw new Error(`Unsupported client export format: ${options.format}`)
    const startedAt = Date.now()
    const headers = list(options.headers)
    const translatedHeaders = list(options.headersTranslate)
    const labels = translatedHeaders.length === headers.length ? translatedHeaders : headers
    const separator = options.separator || ';'
    const maximumRows = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY
    const rows: T[] = []
    let page = 1

    while (rows.length < maximumRows) {
        const paginateOptions: IDraxPaginateOptions = {
            page,
            limit: Math.min(pageSize, maximumRows - rows.length),
            orderBy: options.orderBy,
            order: options.order === 'asc' || options.order === 'desc' ? options.order : undefined,
            search: options.search,
            filters: options.filters
        }
        const result = await provider.paginate(paginateOptions)
        rows.push(...result.items.slice(0, maximumRows - rows.length))
        if (!result.items.length || rows.length >= result.total) break
        page += 1
    }

    const csv = '\uFEFF' + [labels, ...rows.map(item => headers.map(header => nestedValue(item, header)))]
        .map(row => row.map(value => cell(value, separator)).join(separator))
        .join('\r\n')
    const fileName = `${options.fileName || 'export'}.csv`
    return {
        url: URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})),
        rowCount: rows.length,
        time: Date.now() - startedAt,
        fileName
    }
}

export function withClientCsvExport<T, C, U, P extends IDraxCrudProvider<T, C, U> = IDraxCrudProvider<T, C, U>>(
    provider: P,
    pageSize = 250
): P & {export: NonNullable<IDraxCrudProvider<T, C, U>['export']>} {
    return Object.assign(provider, {export: (options: IDraxExportOptions) => exportClientCsv(provider as Pick<IDraxCrudProvider<T, never, never>, 'paginate'>, options, pageSize)})
}
