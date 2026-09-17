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
    <crud-filters v-model="filters" :auto-filter="true" :entity="entity" @apply-filter="emit('applyFilter')"/>
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
