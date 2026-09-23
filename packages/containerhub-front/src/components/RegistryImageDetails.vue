<template>
    <v-card class="ma-3" variant="outlined">
        <v-progress-linear v-if="loadingTags" indeterminate/>
        <v-card-text v-if="tagsError">
            <v-alert density="compact" type="error" variant="tonal">
                {{ tagsError }}
                <template #append><v-btn size="small" variant="text" @click="loadTags">{{ t('registryImages.retry') }}</v-btn></template>
            </v-alert>
        </v-card-text>
        <v-card-text v-else-if="!loadingTags">
            <div class="d-flex flex-wrap align-center ga-2 mb-3">
                <strong>{{ repository }}</strong>
                <span class="text-medium-emphasis">{{ t('registryImages.tagCount', {count: tags.length}) }}</span>
                <v-spacer/>
                <v-text-field v-if="tags.length" v-model="tagSearch" :label="t('registryImages.searchTags')" density="compact" hide-details prepend-inner-icon="mdi-magnify" style="max-width: 280px"/>
            </div>
            <v-alert v-if="!tags.length" density="compact" type="info" variant="tonal">{{ t('registryImages.noTags') }}</v-alert>
            <div v-else class="tag-list mb-4">
                <v-chip
                    v-for="tag in filteredTags"
                    :key="tag"
                    :color="tag === selectedTag ? 'primary' : undefined"
                    class="ma-1"
                    label
                    size="small"
                    :variant="tag === selectedTag ? 'flat' : 'outlined'"
                    @click="selectTag(tag)"
                >{{ tag }}</v-chip>
            </div>
            <v-progress-linear v-if="loadingDetails" indeterminate/>
            <v-alert v-else-if="detailsError" density="compact" type="error" variant="tonal">{{ detailsError }}</v-alert>
            <div v-else-if="details" class="d-flex flex-column ga-2">
                <div><strong>{{ t('registryImages.selectedTag') }}:</strong> {{ details.reference }}</div>
                <div><strong>{{ t('registryImages.digest') }}:</strong> <code class="text-break">{{ details.digest ?? '—' }}</code></div>
                <div><strong>{{ t('registryImages.mediaType') }}:</strong> {{ details.mediaType ?? '—' }}</div>
                <div><strong>{{ t('registryImages.layers') }}:</strong> {{ details.layerCount }}</div>
                <div v-if="details.compressedSize !== null"><strong>{{ t('registryImages.compressedSize') }}:</strong> {{ formatBytes(details.compressedSize) }}</div>
                <div v-if="details.platforms.length">
                    <strong>{{ t('registryImages.platforms') }}:</strong>
                    <v-chip v-for="platform in details.platforms" :key="platform.digest" class="ml-2 mt-1" size="small" variant="outlined">{{ [platform.os, platform.architecture, platform.variant].filter(Boolean).join('/') }}</v-chip>
                </div>
            </div>
            <v-divider v-if="usage" class="my-4"/>
            <div v-if="usage" class="d-flex flex-wrap align-center ga-2">
                <strong>{{ t('registryImages.deployedServices', {count: usage.services.length}) }}</strong>
                <v-chip v-for="service in selectedServices" :key="service.id" size="small" variant="outlined">{{ service.name }}</v-chip>
                <v-spacer/>
                <v-btn v-if="serviceReference" :to="{name: 'services', query: {image: serviceReference}}" prepend-icon="mdi-docker" size="small" variant="text">{{ t('registryImages.viewServices') }}</v-btn>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'
import type {RepositoryUsage} from '@/images/serviceImageUsage'

type RegistryImageDetails = {
    repository: string
    reference: string
    digest: string | null
    mediaType: string | null
    schemaVersion: number | null
    kind: 'image' | 'index' | 'unknown'
    layerCount: number
    compressedSize: number | null
    platforms: Array<{os?: string; architecture?: string; variant?: string; digest?: string}>
}

const props = defineProps<{repository: string; initialTag?: string; usage?: RepositoryUsage}>()
const emit = defineEmits<{selected: [tag: string]}>()
const {t} = useI18n()
const tags = ref<string[]>([])
const tagSearch = ref('')
const selectedTag = ref(props.initialTag ?? '')
const details = ref<RegistryImageDetails | null>(null)
const loadingTags = ref(false)
const loadingDetails = ref(false)
const tagsError = ref('')
const detailsError = ref('')
let detailsRequest = 0

const orderedTags = computed(() => [...tags.value].sort((leftTag, rightTag) => {
    if (leftTag === selectedTag.value) return -1
    if (rightTag === selectedTag.value) return 1
    if (leftTag === 'latest') return -1
    if (rightTag === 'latest') return 1
    return rightTag.localeCompare(leftTag, undefined, {numeric: true})
}))
const filteredTags = computed(() => orderedTags.value.filter((tag) => tag.toLowerCase().includes(tagSearch.value.toLowerCase())))
const selectedServices = computed(() => selectedTag.value ? props.usage?.tags.get(selectedTag.value) ?? [] : props.usage?.services ?? [])
const serviceReference = computed(() => selectedServices.value[0]?.image.fullname ?? (selectedTag.value ? `${props.repository}:${selectedTag.value}` : ''))

onMounted(loadTags)
watch(() => props.initialTag, (tag) => {
    if (tag && tag !== selectedTag.value && tags.value.includes(tag)) void selectTag(tag)
})

async function loadTags(): Promise<void> {
    loadingTags.value = true
    tagsError.value = ''
    try {
        const response = await restGet<{tags?: string[] | null}>('/api/registry/image/tags', {name: props.repository})
        tags.value = response.tags ?? []
        const initialTag = props.initialTag && tags.value.includes(props.initialTag) ? props.initialTag : tags.value.includes('latest') ? 'latest' : tags.value[0]
        if (initialTag) await selectTag(initialTag)
    } catch (error) {
        tagsError.value = error instanceof Error ? error.message : t('registryImages.loadFailed')
    } finally {
        loadingTags.value = false
    }
}

async function selectTag(tag: string): Promise<void> {
    selectedTag.value = tag
    emit('selected', tag)
    const request = ++detailsRequest
    loadingDetails.value = true
    detailsError.value = ''
    try {
        const response = await restGet<RegistryImageDetails>('/api/registry/image/details', {name: props.repository, reference: tag})
        if (request === detailsRequest) details.value = response
    } catch (error) {
        if (request === detailsRequest) detailsError.value = error instanceof Error ? error.message : t('registryImages.detailsFailed')
    } finally {
        if (request === detailsRequest) loadingDetails.value = false
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
    return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
}
</script>

<style scoped>
.tag-list {max-height: 180px; overflow: auto;}
</style>
