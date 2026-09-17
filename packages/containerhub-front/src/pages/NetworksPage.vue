<template>
    <Crud :entity="NetworksCrud.instance">
        <template #filters="{filters}">
            <v-card v-if="isDynamicFiltersEnable" id="crud-list-table-default-filters" class="crud-list-table__default-filters" variant="flat">
                <crud-filters v-model="filtersRef" :auto-filter="false" :entity="NetworksCrud.instance"/>
                <crud-filters-action :entity="NetworksCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
            </v-card>
        </template>
        <template #item.Created="{value}">{{ formatCreated(value) }}</template>
        <template #item.Attachable="{value}"><v-icon :icon="value ? 'mdi-check' : 'mdi-minus'"/></template>
        <template #item.subnet="{item}">{{ (item as any).IPAM?.Config?.[0]?.Subnet ?? '—' }}</template>
        <template #item.gateway="{item}">{{ (item as any).IPAM?.Config?.[0]?.Gateway ?? '—' }}</template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud, useCrud, CrudFilters, CrudFiltersAction} from '@drax/crud-vue'
import {formatDateTime} from '@drax/common-front'
import {NetworksCrud} from '@/cruds/NetworksCrud'
const {isDynamicFiltersEnable, filters: filtersRef, applyFilters, clearFilters} = useCrud(NetworksCrud.instance)

function formatCreated(value: unknown): string {
    return typeof value === 'string' ? formatDateTime(value) || '—' : '—'
}
</script>
