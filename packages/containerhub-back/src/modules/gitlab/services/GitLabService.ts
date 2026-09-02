function gitLabUrl(path: string, query?: Record<string, string>) {
    const baseUrl = process.env.GITLAB_URL
    if (!baseUrl || !process.env.GITLAB_TOKEN) throw new Error('GITLAB_URL and GITLAB_TOKEN must be configured')
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    return url
}

async function gitLabFetch(path: string, query?: Record<string, string>) {
    const response = await fetch(gitLabUrl(path, query), {
        headers: {'Private-Token': process.env.GITLAB_TOKEN as string},
        signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error(`GitLab request failed with status ${response.status}`)
    return response
}

export async function fetchProjects(page = '1', perPage = '10') {
    const response = await gitLabFetch('projects/', {page, per_page: perPage})
    return {totalItems: Number.parseInt(response.headers.get('x-total') ?? '0', 10), items: await response.json()}
}

export async function fetchProjectTags(id: string) {
    return (await gitLabFetch(`projects/${encodeURIComponent(id)}/repository/tags`)).json()
}
