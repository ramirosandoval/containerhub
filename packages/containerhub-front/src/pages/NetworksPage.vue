<template>
    <Crud :entity="NetworksCrud.instance">
        <template #filters="{filters}">
            <v-card v-if="isDynamicFiltersEnable" id="crud-list-table-default-filters" class="crud-list-table__default-filters" variant="flat">
                <auto-crud-filters v-model="filtersRef" :entity="NetworksCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters">
                    <template #filter.attachable="{filterIndex}">
                        <v-select
                            :model-value="filtersRef[filterIndex]?.value ?? null"
                            :items="attachableOptions"
                            :label="t('network.field.attachable')"
                            clearable
                            density="compact"
                            hide-details
                            variant="outlined"
                            @update:model-value="value => setAttachableFilter(filterIndex, value)"
                        />
                    </template>
                </auto-crud-filters>
            </v-card>
        </template>
        <template #item.Created="{value}">{{ formatCreated(value) }}</template>
        <template #item.Attachable="{value}"><v-icon :icon="value ? 'mdi-check' : 'mdi-minus'"/></template>
        <template #item.subnet="{item}">{{ (item as any).IPAM?.Config?.[0]?.Subnet ?? '—' }}</template>
        <template #item.gateway="{item}">{{ (item as any).IPAM?.Config?.[0]?.Gateway ?? '—' }}</template>
    </Crud>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {Crud, useCrud} from '@drax/crud-vue'
import {formatDateTime} from '@drax/common-front'
import AutoCrudFilters from '@/components/AutoCrudFilters.vue'
import {NetworksCrud} from '@/cruds/NetworksCrud'

const {t} = useI18n()
const {isDynamicFiltersEnable, filters: filtersRef, applyFilters, clearFilters} = useCrud(NetworksCrud.instance)
const attachableOptions = computed(() => [
    {title: t('networks.yes'), value: true},
    {title: t('networks.no'), value: false}
])

function setAttachableFilter(filterIndex: number, value: unknown): void {
    const filter = filtersRef.value[filterIndex]
    if (!filter) return
    filter.value = value === true || value === false ? value : null
    applyFilters()
}

function formatCreated(value: unknown): string {
    return typeof value === 'string' ? formatDateTime(value) || '—' : '—'
}
</script>
