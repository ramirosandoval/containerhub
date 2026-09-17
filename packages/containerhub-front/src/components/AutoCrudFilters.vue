<script setup lang="ts">
import {CrudFilters} from '@drax/crud-vue'
import type {IDraxFieldFilter, IEntityCrud} from '@drax/crud-share'
import {useI18n} from 'vue-i18n'

const filters = defineModel<IDraxFieldFilter[]>({required: true})
const {entity} = defineProps<{entity: IEntityCrud}>()
const emit = defineEmits<{applyFilter: []; clearFilter: []}>()
const {t} = useI18n()
</script>

<template>
    <crud-filters v-model="filters" :auto-filter="true" :entity="entity" @apply-filter="emit('applyFilter')">
        <template v-for="filter in entity.filters" :key="filter.name" #[`filter.${filter.name}`]="slotProps">
            <slot v-if="$slots[`filter.${filter.name}`]" :name="`filter.${filter.name}`" v-bind="slotProps"/>
        </template>
    </crud-filters>
    <v-card-actions id="crud-filters-actions" class="crud-filters-actions pb-0">
        <v-spacer/>
        <v-btn
            id="crud-filters-clear-button"
            class="crud-filters-actions__clear-button"
            :class="entity.cleanFilterClass"
            density="compact"
            variant="text"
            @click="emit('clearFilter')"
        >{{ t('action.clear') }}</v-btn>
    </v-card-actions>
</template>
