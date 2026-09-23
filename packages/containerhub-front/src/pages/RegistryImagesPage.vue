<template>
    <v-container fluid>
        <v-card :class="entity.cardClass" :density="entity.cardDensity">
            <v-toolbar :class="entity.toolbarClass" :density="entity.toolbarDensity">
                <v-toolbar-title>{{ t('registryImages.title') }}</v-toolbar-title>
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
                item-value="name"
                show-expand
                @update:options="doPaginate"
            >
                <template #bottom><v-data-table-footer :class="entity.footerClass" :items-per-page-options="[5, 10, 20, 50]"/></template>
                <template #item.data-table-expand="{item, internalItem, isExpanded, toggleExpand}">
                    <v-btn :aria-label="t('registryImages.details')" :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small" variant="text" @click.stop="toggleDetails(image(item), internalItem, isExpanded, toggleExpand)"/>
                </template>
                <template #item.name="{item}"><strong>{{ image(item).name }}</strong></template>
                <template #item.usage="{item}">
                    <span v-if="serviceUsageLoaded">{{ t('registryImages.deployedServices', {count: usage.get(image(item).name)?.services.length ?? 0}) }}</span>
                    <span v-else class="text-medium-emphasis">—</span>
                </template>
                <template #expanded-row="{columns, item}">
                    <tr><td :colspan="columns.length" class="pa-0">
                        <RegistryImageDetails
                            :initial-tag="selectedTag(image(item).name)"
                            :repository="image(item).name"
                            :usage="usage.get(image(item).name)"
                            @selected="updateSelectedTag(image(item).name, $event)"
                        />
                    </td></tr>
                </template>
            </v-data-table-server>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {CrudRefreshButton, CrudSearch, useCrud} from '@drax/crud-vue'
import CrudColumnsButton from '@drax/crud-vue/src/components/buttons/CrudColumnsButton.vue'
import {useCrudColumns} from '@drax/crud-vue/src/composables/UseCrudColumns'
import RegistryImageDetails from '@/components/RegistryImageDetails.vue'
import {RegistryImagesCrud, type RegistryImage} from '@/cruds/RegistryImagesCrud'
import {restGet} from '@/rest'
import {buildServiceImageUsage, type RepositoryUsage, type ServiceImageUsageInput} from '@/images/serviceImageUsage'

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const entity = RegistryImagesCrud.instance
const {doPaginate, items, itemsPerPage, loading, page, search, sortBy, totalItems} = useCrud(entity)
const {filteredHeaders} = useCrudColumns(entity)
const expanded = ref<string[]>([])
const usage = ref(new Map<string, RepositoryUsage>())
const serviceUsageLoaded = ref(false)
const tagsByRepository = ref<Record<string, string>>({})
const targetRepository = typeof route.query.repository === 'string' ? route.query.repository : ''
const targetTag = typeof route.query.tag === 'string' ? route.query.tag : ''
if (targetRepository) {
    search.value = targetRepository
    if (targetTag) tagsByRepository.value[targetRepository] = targetTag
}

watch(items, (currentItems) => {
    if (targetRepository && currentItems.some((item: unknown) => image(item).name === targetRepository)) expanded.value = [targetRepository]
}, {immediate: true})

onMounted(async () => {
    try {
        usage.value = buildServiceImageUsage(await restGet<ServiceImageUsageInput[]>('/api/services'))
        serviceUsageLoaded.value = true
    } catch {
        serviceUsageLoaded.value = false
    }
})

function image(item: unknown): RegistryImage {
    if (item && typeof item === 'object' && 'raw' in item) return image(item.raw)
    return item as RegistryImage
}

function toggleDetails(currentImage: RegistryImage, internalItem: unknown, isExpanded: (item: any) => boolean, toggleExpand: (item: any) => void): void {
    const willExpand = !isExpanded(internalItem)
    toggleExpand(internalItem)
    void router.replace({query: {...route.query, repository: willExpand ? currentImage.name : undefined, tag: willExpand ? selectedTag(currentImage.name) || undefined : undefined}})
}

function selectedTag(repository: string): string {
    return tagsByRepository.value[repository] ?? ''
}

function updateSelectedTag(repository: string, tag: string): void {
    tagsByRepository.value[repository] = tag
    void router.replace({query: {...route.query, repository, tag}})
}
</script>