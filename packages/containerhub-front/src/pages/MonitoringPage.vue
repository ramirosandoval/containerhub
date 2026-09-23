<template>
    <v-container fluid>
        <v-card :class="MonitoringCrud.instance.cardClass" :density="MonitoringCrud.instance.cardDensity">
            <v-toolbar :class="MonitoringCrud.instance.toolbarClass" :density="MonitoringCrud.instance.toolbarDensity">
                <v-toolbar-title>{{ t('monitoring.title') }}</v-toolbar-title>
                <v-spacer/>
                <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_CREATE')" prepend-icon="mdi-plus" @click="openCreate">{{ t('monitoring.create') }}</v-btn>
                <crud-filter-button v-if="MonitoringCrud.instance.dynamicFiltersEnable" :entity="MonitoringCrud.instance"/>
                <crud-columns-button v-if="MonitoringCrud.instance.isColumnSelectable" :entity="MonitoringCrud.instance"/>
                <crud-saved-queries-button v-if="MonitoringCrud.instance.isSavedQueriesEnabled" :entity="MonitoringCrud.instance" />
                <crud-refresh-button v-if="MonitoringCrud.instance.isRefreshable !== false" @click="doPaginate"/>
            </v-toolbar>
            <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4">{{ t('monitoring.notice') }}</v-alert>
                <v-alert v-if="error || paginationError" type="error" class="mb-4">{{ error || paginationError }}</v-alert>
                <v-alert v-if="feedback" type="success" class="mb-4" closable @click:close="feedback = ''">{{ feedback }}</v-alert>
                <crud-search v-if="MonitoringCrud.instance.searchEnable" v-model="search" />
                <v-card v-if="isDynamicFiltersEnable" id="crud-list-table-default-filters" class="crud-list-table__default-filters mt-4" variant="flat">
                    <auto-crud-filters v-if="MonitoringCrud.instance.filtersEnable" v-model="filters" :entity="MonitoringCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
                </v-card>
            </v-card-text>
            <v-data-table-server v-model:page="page" v-model:items-per-page="itemsPerPage" v-model:sort-by="sortBy"
                :headers="filteredHeaders" :header-props="MonitoringCrud.instance.headerProps" :items="configurations" :items-length="totalItems" :loading="loading"
                :density="MonitoringCrud.instance.tableDensity" :striped="MonitoringCrud.instance.tableStriped" :items-per-page-options="[5, 10, 25, 50, 100]" @update:options="doPaginate">
                <template #bottom><v-data-table-footer :class="MonitoringCrud.instance.footerClass" :items-per-page-options="[5, 10, 25, 50, 100]"/></template>
                <template #item.status="{item}"><v-chip :color="item.status === 'paused' ? 'warning' : 'primary'">{{ t(`monitoring.${item.status}`) }}</v-chip></template>
                <template #item.period="{item}">{{ item.type === 'calendar' ? `${item.since} — ${item.until}` : `${item.holdingTime} ${t('monitoring.days')}` }}</template>
                <template #item.actions="{item}">
                    <v-btn variant="text" icon="mdi-chart-line" :aria-label="`${t('monitoring.history')} ${item.serviceName}`" @click="openHistory(item)"/>
                    <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_PAUSE')" variant="text" :disabled="busy || expired(item)" :aria-label="`${t(item.status === 'paused' ? 'monitoring.resume' : 'monitoring.pause')} ${item.serviceName}`" :icon="item.status === 'paused' ? 'mdi-play' : 'mdi-pause'" @click="confirmation = {configuration: item, action: item.status === 'paused' ? 'resume' : 'pause'}"/>
                    <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_DELETE')" variant="text" color="error" :disabled="busy" icon="mdi-delete" :aria-label="`${t('monitoring.delete')} ${item.serviceName}`" @click="confirmation = {configuration: item, action: 'delete'}"/>
                </template>
            </v-data-table-server>
        </v-card>
        <MonitoringCreateDialog ref="creationDialog" v-model:busy="busy" :refresh="doPaginate" @created="onCreated"/>
        <v-dialog :model-value="Boolean(confirmation)" max-width="500" :persistent="busy" @update:model-value="value => { if (!value) confirmation = null }">
            <v-card v-if="confirmation" :title="confirmation.configuration.serviceName">
                <v-card-text>{{ t(`monitoring.confirm${confirmation.action[0].toUpperCase()}${confirmation.action.slice(1)}`) }}</v-card-text>
                <v-card-actions><v-spacer/><v-btn :disabled="busy" @click="confirmation = null">{{ t('monitoring.cancel') }}</v-btn><v-btn :loading="busy" @click="confirmAction">{{ t('monitoring.confirm') }}</v-btn></v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAuthStore} from '@drax/identity-vue'
import {useCrud, CrudSearch, CrudSavedQueriesButton, CrudRefreshButton} from '@drax/crud-vue'
import CrudFilterButton from '@drax/crud-vue/src/components/buttons/CrudFilterButton.vue'
import CrudColumnsButton from '@drax/crud-vue/src/components/buttons/CrudColumnsButton.vue'
import {useCrudColumns} from '@drax/crud-vue/src/composables/UseCrudColumns'
import {useRouter} from 'vue-router'
import MonitoringCrud, {monitoringProvider, type MonitoringConfiguration} from '@/cruds/MonitoringCrud'
import AutoCrudFilters from '@/components/AutoCrudFilters.vue'
import MonitoringCreateDialog from './MonitoringCreateDialog.vue'

const {t} = useI18n()
const auth = useAuthStore()
const router = useRouter()
const {items, totalItems, loading, page, itemsPerPage, sortBy, search, paginationError, doPaginate, prepareFilters, isDynamicFiltersEnable, filters, applyFilters, clearFilters} = useCrud(MonitoringCrud.instance)
const {filteredHeaders} = useCrudColumns(MonitoringCrud.instance)
const configurations = computed(() => items.value as MonitoringConfiguration[])
const error = ref('')
const feedback = ref('')
const busy = ref(false)
const creationDialog = ref<{open(): Promise<void>} | null>(null)
const confirmation = ref<{configuration: MonitoringConfiguration; action: 'pause' | 'resume' | 'delete'} | null>(null)
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
prepareFilters()
function expired(configuration: MonitoringConfiguration): boolean { return configuration.type === 'calendar' && Boolean(configuration.until && configuration.until < localDate(new Date())) }
function openHistory(configuration: MonitoringConfiguration) { void router.push({name: 'monitoring-history', params: {id: configuration._id}}) }
function openCreate() { void creationDialog.value?.open() }
function onCreated(outcome: {created: MonitoringConfiguration[]; skipped: string[]}) {
    feedback.value = t('monitoring.created', {created: outcome.created.length, skipped: outcome.skipped.length})
}
async function confirmAction() {
    if (!confirmation.value) return
    busy.value = true
    error.value = ''
    const {configuration, action} = confirmation.value
    try {
        if (action === 'delete') await monitoringProvider.delete(configuration._id)
        else await monitoringProvider.setStatus(configuration._id, action)
        confirmation.value = null
        await doPaginate()
    } catch (failure) { confirmation.value = null; error.value = failure instanceof Error ? failure.message : t('monitoring.failed') }
    finally { busy.value = false }
}
</script>
