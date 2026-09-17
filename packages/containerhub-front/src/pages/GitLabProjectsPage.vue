<template>
    <Crud :entity="GitLabProjectsCrud.instance">
        <template #item.tags="{item}">
            <v-btn :loading="loadingTags[(item as any).id]" :text="t('gitLabProjects.loadTags')" size="small" variant="text" @click="loadTags((item as any).id)"/>
            <v-chip v-for="tag in projectTags[(item as any).id] ?? []" :key="tag" class="ma-1" size="small">{{ tag }}</v-chip>
        </template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'
import {GitLabProjectsCrud} from '@/cruds/GitLabProjectsCrud'

type GitLabTag = {name: string}
const {t} = useI18n()
const projectTags = ref<Record<number, string[] | undefined>>({})
const loadingTags = ref<Record<number, boolean | undefined>>({})

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
</script>
