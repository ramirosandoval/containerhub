<template>
    <v-container fluid>
        <v-card :class="entity.cardClass" :density="entity.cardDensity">
            <v-toolbar :class="entity.toolbarClass" :density="entity.toolbarDensity">
                <v-toolbar-title>{{ t('gitLabProjects.title') }}</v-toolbar-title>
                <v-spacer/>
                <crud-columns-button :entity="entity"/>
                <crud-refresh-button @click="doPaginate"/>
            </v-toolbar>
            <v-card-text><crud-search v-model="search"/></v-card-text>
            <v-divider/>
            <v-data-table-server
                v-model:expanded="expanded"
                v-model:items-per-page="itemsPerPage"
                v-model:page="page"
                v-model:sort-by="sortBy"
                :density="entity.tableDensity"
                :headers="filteredHeaders"
                :header-props="entity.headerProps"
                :items="items"
                :items-length="totalItems"
                :loading="loading"
                :search="search"
                :striped="entity.tableStriped"
                item-value="id"
                show-expand
                @update:options="doPaginate"
            >
                <template #bottom><v-data-table-footer :class="entity.footerClass" :items-per-page-options="[5, 10, 20, 50]"/></template>
                <template #item.data-table-expand="{item, internalItem, isExpanded, toggleExpand}">
                    <v-btn :aria-label="t('gitLabProjects.details')" :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small" variant="text" @click.stop="toggleProject(project(item), internalItem, isExpanded, toggleExpand)"/>
                </template>
                <template #item.name="{item}">
                    <div class="py-1">
                        <strong>{{ project(item).name }}</strong>
                        <div class="text-caption text-medium-emphasis">{{ project(item).path_with_namespace }}</div>
                        <div v-if="project(item).description" class="text-caption text-medium-emphasis text-truncate" style="max-width: 520px">{{ project(item).description }}</div>
                    </div>
                </template>
                <template #item.last_activity_at="{item}">{{ formatActivity(project(item).last_activity_at) }}</template>
                <template #item.deployments="{item}">
                    <span v-if="servicesLoaded">{{ t('gitLabProjects.deployedServices', {count: deployedServices(project(item)).length}) }}</span>
                    <span v-else class="text-medium-emphasis">—</span>
                </template>
                <template #item.tags="{item}">
                    <div class="d-flex align-center ga-1">
                        <v-btn v-if="project(item).web_url" :aria-label="t('gitLabProjects.openGitLab')" :href="project(item).web_url" icon="mdi-open-in-new" rel="noopener" size="small" target="_blank" variant="text"/>
                        <v-btn v-if="project(item).container_registry_image_prefix" :aria-label="t('gitLabProjects.openRegistry')" :to="registryRoute(project(item))" icon="mdi-package-variant-closed" size="small" variant="text"/>
                    </div>
                </template>
                <template #expanded-row="{columns, item}">
                    <tr><td :colspan="columns.length" class="pa-0">
                        <v-card class="ma-3" variant="outlined">
                            <v-progress-linear v-if="loadingTags[project(item).id]" indeterminate/>
                            <v-card-text v-if="tagErrors[project(item).id]">
                                <v-alert density="compact" type="error" variant="tonal">{{ tagErrors[project(item).id] }} <v-btn size="small" variant="text" @click="loadTags(project(item).id)">{{ t('gitLabProjects.retry') }}</v-btn></v-alert>
                            </v-card-text>
                            <v-card-text v-else>
                                <div class="d-flex flex-wrap align-center ga-2 mb-3">
                                    <strong>{{ t('gitLabProjects.gitTags') }}</strong>
                                    <span class="text-medium-emphasis">{{ t('gitLabProjects.tagCount', {count: projectTags[project(item).id]?.length ?? 0}) }}</span>
                                    <v-spacer/>
                                    <v-text-field v-model="tagSearch[project(item).id]" :label="t('gitLabProjects.searchTags')" density="compact" hide-details prepend-inner-icon="mdi-magnify" style="max-width: 280px"/>
                                </div>
                                <v-alert v-if="projectTags[project(item).id] && !projectTags[project(item).id]!.length" density="compact" type="info" variant="tonal">{{ t('gitLabProjects.noTags') }}</v-alert>
                                <div v-else class="tag-list">
                                    <v-chip
                                        v-for="tag in filteredProjectTags(project(item).id)"
                                        :key="tag.name"
                                        class="ma-1"
                                        :color="selectedTags[project(item).id] === tag.name ? 'primary' : undefined"
                                        label
                                        size="small"
                                        :variant="selectedTags[project(item).id] === tag.name ? 'flat' : 'outlined'"
                                        @click="selectTag(project(item).id, tag.name)"
                                    >{{ tag.name }}</v-chip>
                                </div>
                                <v-divider class="my-4"/>
                                <div class="d-flex flex-wrap align-center ga-2">
                                    <strong>{{ t('gitLabProjects.deployments') }}</strong>
                                    <v-chip v-for="service in deployedServices(project(item))" :key="service.id" size="small" variant="outlined">{{ service.name }} · {{ service.image.tag }}</v-chip>
                                </div>
                                <v-divider class="my-4"/>
                                <div class="d-flex flex-wrap align-center ga-2 mb-3">
                                    <strong>{{ t('gitLabProjects.tagPipeline') }}</strong>
                                    <v-chip v-if="selectedTags[project(item).id]" color="primary" size="small" variant="tonal">{{ selectedTags[project(item).id] }}</v-chip>
                                </div>
                                <v-alert v-if="!selectedTags[project(item).id]" density="compact" type="info" variant="tonal">{{ t('gitLabProjects.selectTag') }}</v-alert>
                                <template v-else>
                                    <v-progress-linear v-if="loadingPipelines[tagPipelineKey(project(item).id, selectedTags[project(item).id])]" indeterminate/>
                                    <v-alert v-else-if="pipelineErrors[tagPipelineKey(project(item).id, selectedTags[project(item).id])]" density="compact" type="error" variant="tonal">
                                        {{ pipelineErrors[tagPipelineKey(project(item).id, selectedTags[project(item).id])] }}
                                        <v-btn size="small" variant="text" @click="selectTag(project(item).id, selectedTags[project(item).id])">{{ t('gitLabProjects.retry') }}</v-btn>
                                    </v-alert>
                                    <template v-else-if="selectedPipeline(project(item).id)">
                                        <v-alert v-if="!selectedPipeline(project(item).id)?.pipeline" density="compact" type="info" variant="tonal">{{ t('gitLabProjects.noTagPipeline') }}</v-alert>
                                        <template v-else>
                                            <div class="d-flex flex-wrap align-center ga-2 mb-3">
                                                <v-chip :color="pipelineStatusColor(selectedPipeline(project(item).id)?.pipeline?.status ?? '')" size="small" variant="tonal">
                                                    {{ t('gitLabProjects.pipelineStatus') }}: {{ selectedPipeline(project(item).id)?.pipeline?.status }}
                                                </v-chip>
                                                <span class="text-caption text-medium-emphasis">{{ selectedPipeline(project(item).id)?.pipeline?.sha.slice(0, 8) }}</span>
                                                <v-btn :href="selectedPipeline(project(item).id)?.pipeline?.webUrl" rel="noopener" size="small" target="_blank" variant="text">{{ t('gitLabProjects.openPipeline') }}</v-btn>
                                            </div>
                                            <v-alert v-if="!selectedPipeline(project(item).id)?.jobs.length" density="compact" type="info" variant="tonal">{{ t('gitLabProjects.noPipelineJobs') }}</v-alert>
                                            <v-list v-else density="compact">
                                                <v-list-item
                                                    v-for="job in selectedPipeline(project(item).id)?.jobs ?? []"
                                                    :key="job.id"
                                                    :href="job.webUrl || undefined"
                                                    :subtitle="job.stage"
                                                    :target="job.webUrl ? '_blank' : undefined"
                                                    rel="noopener"
                                                    :title="job.name"
                                                >
                                                    <template #append><v-chip :color="pipelineStatusColor(job.status)" size="x-small" variant="tonal">{{ job.status }}</v-chip></template>
                                                </v-list-item>
                                            </v-list>
                                        </template>
                                    </template>
                                </template>
                            </v-card-text>
                        </v-card>
                    </td></tr>
                </template>
            </v-data-table-server>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {formatDateTime} from '@drax/common-front'
import {CrudRefreshButton, CrudSearch, useCrud} from '@drax/crud-vue'
import CrudColumnsButton from '@drax/crud-vue/src/components/buttons/CrudColumnsButton.vue'
import {useCrudColumns} from '@drax/crud-vue/src/composables/UseCrudColumns'
import {GitLabProjectsCrud, type GitLabProject} from '@/cruds/GitLabProjectsCrud'
import {restGet} from '@/rest'
import {projectRegistryTarget} from '@/images/registryImageReference'
import {projectServiceUsage, type ServiceImageUsageInput} from '@/images/serviceImageUsage'

type GitLabTag = {name: string}
type TagPipeline = {
    tag: string
    pipeline: {id: number; iid: number; ref: string; sha: string; status: string; source: string; webUrl: string; createdAt: string; updatedAt: string} | null
    jobs: Array<{id: number; name: string; stage: string; status: string; allowFailure: boolean; webUrl: string | null; startedAt: string | null; finishedAt: string | null}>
}

const {t} = useI18n()
const entity = GitLabProjectsCrud.instance
const {doPaginate, items, itemsPerPage, loading, page, search, sortBy, totalItems} = useCrud(entity)
const {filteredHeaders} = useCrudColumns(entity)
const expanded = ref<string[]>([])
const projectTags = ref<Record<number, GitLabTag[] | undefined>>({})
const loadingTags = ref<Record<number, boolean>>({})
const tagErrors = ref<Record<number, string>>({})
const tagSearch = ref<Record<number, string>>({})
const services = ref<ServiceImageUsageInput[]>([])
const servicesLoaded = ref(false)
const selectedTags = ref<Record<number, string>>({})
const tagPipelines = ref<Record<string, TagPipeline | undefined>>({})
const loadingPipelines = ref<Record<string, boolean>>({})
const pipelineErrors = ref<Record<string, string>>({})

onMounted(async () => {
    try {
        services.value = await restGet<ServiceImageUsageInput[]>('/api/services')
        servicesLoaded.value = true
    } catch {
        servicesLoaded.value = false
    }
})

function project(item: unknown): GitLabProject {
    if (item && typeof item === 'object' && 'raw' in item) return project(item.raw)
    return item as GitLabProject
}

function toggleProject(currentProject: GitLabProject, internalItem: unknown, isExpanded: (item: any) => boolean, toggleExpand: (item: any) => void): void {
    const willExpand = !isExpanded(internalItem)
    toggleExpand(internalItem)
    if (willExpand && !(currentProject.id in projectTags.value)) void loadTags(currentProject.id)
}

async function loadTags(projectId: number): Promise<void> {
    loadingTags.value[projectId] = true
    tagErrors.value[projectId] = ''
    try {
        projectTags.value[projectId] = await restGet<GitLabTag[]>(`/api/gitlab/project/${projectId}/tags`)
    } catch (error) {
        tagErrors.value[projectId] = error instanceof Error ? error.message : t('gitLabProjects.loadFailed')
    } finally {
        loadingTags.value[projectId] = false
    }
}

function filteredProjectTags(projectId: number): GitLabTag[] {
    const filter = (tagSearch.value[projectId] ?? '').toLowerCase()
    return (projectTags.value[projectId] ?? []).filter(({name}) => name.toLowerCase().includes(filter))
}

function tagPipelineKey(projectId: number, tag: string): string {
    return `${projectId}:${tag}`
}

function selectedPipeline(projectId: number): TagPipeline | undefined {
    const tag = selectedTags.value[projectId]
    return tag ? tagPipelines.value[tagPipelineKey(projectId, tag)] : undefined
}

async function selectTag(projectId: number, tag: string): Promise<void> {
    selectedTags.value[projectId] = tag
    const key = tagPipelineKey(projectId, tag)
    if (tagPipelines.value[key] || loadingPipelines.value[key]) return

    loadingPipelines.value[key] = true
    pipelineErrors.value[key] = ''
    try {
        tagPipelines.value[key] = await restGet<TagPipeline>(`/api/gitlab/project/${projectId}/tag-pipeline`, {tag})
    } catch (error) {
        pipelineErrors.value[key] = error instanceof Error ? error.message : t('gitLabProjects.pipelineLoadFailed')
    } finally {
        loadingPipelines.value[key] = false
    }
}

function pipelineStatusColor(status: string): string | undefined {
    if (status === 'success') return 'success'
    if (status === 'failed') return 'error'
    if (status === 'running') return 'info'
    if (status === 'pending' || status === 'created' || status === 'manual') return 'warning'
    return undefined
}

function deployedServices(currentProject: GitLabProject): ServiceImageUsageInput[] {
    return currentProject.container_registry_image_prefix ? projectServiceUsage(services.value, currentProject.container_registry_image_prefix) : []
}

function registryRoute(currentProject: GitLabProject) {
    const target = projectRegistryTarget(currentProject.container_registry_image_prefix ?? '')
    return {name: 'registry-images', query: {repository: target.repository}}
}

function formatActivity(value: string | undefined): string {
    return value ? formatDateTime(value) : '—'
}
</script>

<style scoped>
.tag-list {max-height: 180px; overflow: auto;}
</style>