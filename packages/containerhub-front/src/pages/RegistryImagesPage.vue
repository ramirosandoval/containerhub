<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('registryImages.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="images" :loading="loading">
                <template #item.tags="{item}">
                    <v-btn :loading="loadingTags[item.name]" :text="t('registryImages.loadTags')" size="small" variant="text" @click="loadTags(item.name)"/>
                    <v-chip v-for="tag in imageTags[item.name] ?? []" :key="tag" class="ma-1" size="small">{{ tag }}</v-chip>
                </template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type RegistryImage = {name: string; tags: string[] | null}
type RegistryImageTags = {tags?: string[] | null}
const {t} = useI18n()
const loading = ref(false)
const images = ref<RegistryImage[]>([])
const imageTags = ref<Record<string, string[] | undefined>>({})
const loadingTags = ref<Record<string, boolean | undefined>>({})
const headers = computed(() => [{title: t('registryImages.name'), key: 'name'}, {title: t('registryImages.tags'), key: 'tags', sortable: false}])
async function loadTags(name: string) {
    if (name in imageTags.value) return
    loadingTags.value[name] = true
    try {
        const result = await restGet<RegistryImageTags>('/api/registry/image/tags', {name})
        imageTags.value[name] = result.tags ?? []
    } finally {
        loadingTags.value[name] = false
    }
}
onMounted(async () => {
    loading.value = true
    try { images.value = await restGet<RegistryImage[]>('/api/registry/image') } finally { loading.value = false }
})
</script>
