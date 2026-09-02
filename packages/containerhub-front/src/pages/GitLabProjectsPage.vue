<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('gitLabProjects.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="projects" :loading="loading" :items-per-page="perPage">
                <template #item.tags="{item}">
                    <v-btn :loading="loadingTags[item.id]" :text="t('gitLabProjects.loadTags')" size="small" variant="text" @click="loadTags(item.id)"/>
                    <v-chip v-for="tag in projectTags[item.id] ?? []" :key="tag" class="ma-1" size="small">{{ tag }}</v-chip>
                </template>
            </v-data-table>
            <v-pagination v-model="page" :length="pageCount" class="my-3"/>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type GitLabProject = {id: number; name: string; namespace?: {name?: string}; web_url?: string}
type GitLabTag = {name: string}
type PaginatedProjects = {items: GitLabProject[]; totalItems: number}
const {t} = useI18n()
const perPage = 25
const page = ref(1)
const totalItems = ref(0)
const loading = ref(false)
const projects = ref<GitLabProject[]>([])
const projectTags = ref<Record<number, string[] | undefined>>({})
const loadingTags = ref<Record<number, boolean | undefined>>({})
const pageCount = computed(() => Math.max(1, Math.ceil(totalItems.value / perPage)))
const headers = computed(() => [
    {title: t('gitLabProjects.id'), key: 'id'}, {title: t('gitLabProjects.namespace'), key: 'namespace.name'},
    {title: t('gitLabProjects.name'), key: 'name'}, {title: t('gitLabProjects.tags'), key: 'tags', sortable: false}
])
async function fetchProjects() {
    loading.value = true
    try {
        const result = await restGet<PaginatedProjects>('/api/gitlab/project', {page: page.value, per_page: perPage})
        projects.value = result.items
        totalItems.value = result.totalItems
    } finally {
        loading.value = false
    }
}
async function loadTags(projectId: number) {
    if (projectId in projectTags.value) return
    loadingTags.value[projectId] = true
    try {
        const tags = await restGet<GitLabTag[]>(`/api/gitlab/project/${projectId}/tags`)
        projectTags.value[projectId] = tags.map((tag) => tag.name)
    } finally {
        loadingTags.value[projectId] = false
    }
}
onMounted(() => void fetchProjects())
watch(page, () => void fetchProjects())
</script>
