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

type GitLabPipelineResponse = {
    id: number
    iid: number
    sha: string
    ref: string
    status: string
    source: string
    web_url: string
    created_at: string
    updated_at: string
}

type GitLabJobResponse = {
    id: number
    name: string
    stage: string
    status: string
    allow_failure: boolean
    web_url?: string | null
    started_at?: string | null
    finished_at?: string | null
}

export type GitLabTagPipeline = {
    tag: string
    pipeline: {
        id: number
        iid: number
        sha: string
        ref: string
        status: string
        source: string
        webUrl: string
        createdAt: string
        updatedAt: string
    } | null
    jobs: Array<{
        id: number
        name: string
        stage: string
        status: string
        allowFailure: boolean
        webUrl: string | null
        startedAt: string | null
        finishedAt: string | null
    }>
}

export async function fetchProjects({page = '1', perPage = '10', search = ''}: {page?: string; perPage?: string; search?: string} = {}) {
    const response = await gitLabFetch('projects/', {
        page,
        per_page: perPage,
        order_by: 'last_activity_at',
        sort: 'desc',
        ...(search.trim() ? {search: search.trim()} : {})
    })
    return {totalItems: Number.parseInt(response.headers.get('x-total') ?? '0', 10), items: await response.json()}
}

export async function fetchProjectTags(id: string) {
    return (await gitLabFetch(`projects/${encodeURIComponent(id)}/repository/tags`)).json()
}

export async function fetchTagPipeline(projectId: string, tag: string): Promise<GitLabTagPipeline> {
    const normalizedTag = tag.trim()
    if (!normalizedTag) throw new Error('GitLab tag is required')

    const pipelinesResponse = await gitLabFetch(`projects/${encodeURIComponent(projectId)}/pipelines`, {
        ref: normalizedTag,
        scope: 'tags',
        per_page: '1',
        order_by: 'id',
        sort: 'desc',
    })
    const [pipeline] = await pipelinesResponse.json() as GitLabPipelineResponse[]
    if (!pipeline) return {tag: normalizedTag, pipeline: null, jobs: []}

    const jobsResponse = await gitLabFetch(`projects/${encodeURIComponent(projectId)}/pipelines/${pipeline.id}/jobs`, {
        include_retried: 'true',
        per_page: '100',
    })
    const jobs = await jobsResponse.json() as GitLabJobResponse[]

    return {
        tag: normalizedTag,
        pipeline: {
            id: pipeline.id,
            iid: pipeline.iid,
            sha: pipeline.sha,
            ref: pipeline.ref,
            status: pipeline.status,
            source: pipeline.source,
            webUrl: pipeline.web_url,
            createdAt: pipeline.created_at,
            updatedAt: pipeline.updated_at,
        },
        // ponytail: first 100 jobs; paginate only if a real pipeline exceeds it.
        jobs: jobs.map((job) => ({
            id: job.id,
            name: job.name,
            stage: job.stage,
            status: job.status,
            allowFailure: job.allow_failure,
            webUrl: job.web_url ?? null,
            startedAt: job.started_at ?? null,
            finishedAt: job.finished_at ?? null,
        })),
    }
}
