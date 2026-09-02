<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('ghostContainers.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="containers" :loading="loading">
                <template #item.Created="{value}">{{ formatCreated(value) }}</template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type GhostContainer = {Created: number; Image?: string; Status?: string; Id?: string; NodeID?: string}
const {t} = useI18n()
const loading = ref(false)
const containers = ref<GhostContainer[]>([])
const headers = computed(() => [
    {title: t('ghostContainers.created'), key: 'Created'}, {title: t('ghostContainers.image'), key: 'Image'},
    {title: t('ghostContainers.status'), key: 'Status'}, {title: t('ghostContainers.id'), key: 'Id'}, {title: t('ghostContainers.node'), key: 'NodeID'}
])
function formatCreated(created: unknown): string {
    return typeof created === 'number' ? new Date(created * 1000).toLocaleString() : '—'
}
onMounted(async () => {
    loading.value = true
    try { containers.value = await restGet<GhostContainer[]>('/api/docker/ghostContainers') } finally { loading.value = false }
})
</script>
