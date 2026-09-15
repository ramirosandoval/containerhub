<template>
    <v-container fluid>
        <v-card>
            <v-toolbar>
                <v-toolbar-title>{{ t('monitoring.title') }}</v-toolbar-title>
                <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_CREATE')" prepend-icon="mdi-plus" @click="openCreate">{{ t('monitoring.create') }}</v-btn>
                <v-btn icon="mdi-refresh" :aria-label="t('monitoring.refresh')" :loading="loading" @click="doPaginate"/>
            </v-toolbar>
            <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4">{{ t('monitoring.notice') }}</v-alert>
                <v-alert v-if="error || paginationError" type="error" class="mb-4">{{ error || paginationError }}</v-alert>
                <v-alert v-if="feedback" type="success" class="mb-4" closable @click:close="feedback = ''">{{ feedback }}</v-alert>
                <v-text-field v-model="search" :label="t('monitoring.search')" clearable @change="searchConfigurations"/>
            </v-card-text>
            <v-data-table-server v-model:page="page" v-model:items-per-page="itemsPerPage" v-model:sort-by="sortBy"
                :headers="headers" :items="configurations" :items-length="totalItems" :loading="loading" :items-per-page-options="[5, 10, 25, 50, 100]" @update:options="doPaginate">
                <template #item.status="{item}"><v-chip :color="item.status === 'paused' ? 'warning' : 'primary'">{{ t(`monitoring.${item.status}`) }}</v-chip></template>
                <template #item.period="{item}">{{ item.type === 'calendar' ? `${item.since} — ${item.until}` : `${item.holdingTime} ${t('monitoring.days')}` }}</template>
                <template #item.actions="{item}">
                    <v-btn variant="text" icon="mdi-chart-line" :aria-label="`${t('monitoring.history')} ${item.serviceName}`" @click="openHistory(item)"/>
                    <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_PAUSE')" variant="text" :disabled="busy || expired(item)" :aria-label="`${t(item.status === 'paused' ? 'monitoring.resume' : 'monitoring.pause')} ${item.serviceName}`" :icon="item.status === 'paused' ? 'mdi-play' : 'mdi-pause'" @click="confirmation = {configuration: item, action: item.status === 'paused' ? 'resume' : 'pause'}"/>
                    <v-btn v-if="auth.hasPermission('DOCKER_MONITORING_DELETE')" variant="text" color="error" :disabled="busy" icon="mdi-delete" :aria-label="`${t('monitoring.delete')} ${item.serviceName}`" @click="confirmation = {configuration: item, action: 'delete'}"/>
                </template>
            </v-data-table-server>
        </v-card>
        <v-dialog v-model="creating" max-width="1000" :persistent="busy">
            <v-card :title="t('monitoring.create')">
                <v-card-text>
                    <v-alert v-if="formError" type="error" class="mb-4">{{ formError }}</v-alert>
                    <v-form ref="formElement" @submit.prevent="save">
                        <v-row>
                            <v-col cols="12" md="6"><v-select v-model="stackFilter" :items="stacks" :label="t('monitoring.stack')" clearable/></v-col>
                            <v-col cols="12" md="6"><v-text-field v-model="serviceSearch" :label="t('monitoring.search')" clearable/></v-col>
                        </v-row>
                        <v-data-table v-model="selectedServices" :items="filteredServices" :headers="serviceHeaders" item-value="id" show-select :loading="servicesLoading" :items-per-page="5" :items-per-page-options="[5, 10, 25, 50, 100]" :item-selectable="service => !configuredServices[service.id]">
                            <template #item.status="{item}">{{ configuredServices[item.id] ? t(`monitoring.${configuredServices[item.id]}`) : '—' }}</template>
                        </v-data-table>
                        <v-row class="mt-3">
                            <v-col cols="12" md="6"><v-select v-model="form.collectionInterval" :items="['15s', '30s', '45s', '60s']" :label="t('monitoring.interval')"/></v-col>
                            <v-col cols="12" md="6"><v-select v-model="form.collectionType" :items="collectionTypes" :label="t('monitoring.collectionType')"/></v-col>
                            <v-col cols="12"><v-radio-group v-model="form.type" inline><v-radio value="calendar" :label="t('monitoring.calendar')"/><v-radio value="permanent" :label="t('monitoring.permanent')"/></v-radio-group></v-col>
                            <template v-if="form.type === 'calendar'">
                                <v-col cols="12" md="6"><v-text-field v-model="form.since" type="date" :min="today" :label="t('monitoring.since')" :rules="[required]"/></v-col>
                                <v-col cols="12" md="6"><v-text-field v-model="form.until" type="date" :min="form.since" :label="t('monitoring.until')" :rules="[required, value => value > form.since || t('monitoring.dateOrder')]"/></v-col>
                            </template>
                            <v-col v-else cols="12"><v-text-field v-model.number="form.holdingTime" type="number" min="1" step="1" :label="t('monitoring.holdingTime')" :rules="[value => Number.isInteger(Number(value)) && Number(value) > 0 || t('monitoring.positive')]"/></v-col>
                        </v-row>
                    </v-form>
                </v-card-text>
                <v-card-actions><v-spacer/><v-btn :disabled="busy" @click="creating = false">{{ t('monitoring.cancel') }}</v-btn><v-btn color="primary" :loading="busy" :disabled="servicesLoading || !selectedServices.length" @click="save">{{ t('monitoring.save') }}</v-btn></v-card-actions>
            </v-card>
        </v-dialog>
        <v-dialog :model-value="Boolean(confirmation)" max-width="500" :persistent="busy" @update:model-value="value => { if (!value) confirmation = null }">
            <v-card v-if="confirmation" :title="confirmation.configuration.serviceName">
                <v-card-text>{{ t(`monitoring.confirm${confirmation.action[0].toUpperCase()}${confirmation.action.slice(1)}`) }}</v-card-text>
                <v-card-actions><v-spacer/><v-btn :disabled="busy" @click="confirmation = null">{{ t('monitoring.cancel') }}</v-btn><v-btn :loading="busy" @click="confirmAction">{{ t('monitoring.confirm') }}</v-btn></v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script setup lang="ts">
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAuthStore} from '@drax/identity-vue'
import {useCrud} from '@drax/crud-vue'
import {useRouter} from 'vue-router'
import MonitoringCrud, {monitoringProvider, type MonitoringConfiguration} from '@/cruds/MonitoringCrud'
import type {Service} from '@/cruds/ServiceCrud'
import {restGet} from '@/rest'

const {t} = useI18n()
const auth = useAuthStore()
const router = useRouter()
const {items, totalItems, loading, page, itemsPerPage, sortBy, search, paginationError, doPaginate} = useCrud(MonitoringCrud.instance)
const configurations = computed(() => items.value as MonitoringConfiguration[])
const error = ref('')
const feedback = ref('')
const formError = ref('')
const busy = ref(false)
const creating = ref(false)
const servicesLoading = ref(false)
const services = ref<Service[]>([])
const configuredServices = ref<Record<string, string>>({})
const selectedServices = ref<string[]>([])
const stackFilter = ref<string | null>(null)
const serviceSearch = ref('')
const formElement = ref<{validate(): Promise<{valid: boolean}>} | null>(null)
const confirmation = ref<{configuration: MonitoringConfiguration; action: 'pause' | 'resume' | 'delete'} | null>(null)
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const today = localDate(new Date())
const defaultUntil = new Date()
defaultUntil.setDate(defaultUntil.getDate() + 30)
const form = reactive({type: 'calendar' as 'calendar' | 'permanent', collectionInterval: '15s', collectionType: 'replic' as 'replic' | 'global', since: today, until: localDate(defaultUntil), holdingTime: 30})
const headers = computed(() => [
    {title: t('monitoring.status'), key: 'status'}, {title: t('monitoring.service'), key: 'serviceName'},
    {title: t('monitoring.interval'), key: 'collectionInterval'}, {title: t('monitoring.period'), key: 'period', sortable: false}, {title: t('monitoring.actions'), key: 'actions', sortable: false}
])
const serviceHeaders = computed(() => [{title: t('monitoring.service'), key: 'name'}, {title: t('monitoring.stack'), key: 'stack'}, {title: t('monitoring.status'), key: 'status', sortable: false}])
const stacks = computed(() => [...new Set(services.value.flatMap(service => service.stack ? [service.stack] : []))].sort())
const filteredServices = computed(() => services.value.filter(service => (!stackFilter.value || service.stack === stackFilter.value) && service.name.toLowerCase().includes((serviceSearch.value || '').toLowerCase())))
const collectionTypes = computed(() => ['replic', 'global'].map(value => ({title: t(`monitoring.${value}`), value})))
function required(value: unknown) { return Boolean(value) || t('monitoring.required') }
function expired(configuration: MonitoringConfiguration): boolean { return configuration.type === 'calendar' && Boolean(configuration.until && configuration.until < localDate(new Date())) }
function searchConfigurations() { page.value = 1; void doPaginate() }
function openHistory(configuration: MonitoringConfiguration) { void router.push({name: 'monitoring-history', params: {id: configuration._id}}) }
async function openCreate() {
    creating.value = true
    formError.value = ''
    selectedServices.value = []
    services.value = []
    servicesLoading.value = true
    try {
        const availableServices = await restGet<Service[]>('/api/services')
        const statuses = await monitoringProvider.statuses(availableServices.map(service => service.id))
        configuredServices.value = Object.fromEntries(statuses.map(configuration => [configuration.serviceId, configuration.status]))
        services.value = availableServices
    } catch (failure) { formError.value = failure instanceof Error ? failure.message : t('monitoring.failed') }
    finally { servicesLoading.value = false }
}
async function save() {
    if (!(await formElement.value?.validate())?.valid) return
    if (!selectedServices.value.length) { formError.value = t('monitoring.selectionRequired'); return }
    busy.value = true
    formError.value = ''
    try {
        const outcome = await monitoringProvider.createForServices({...form, serviceIds: selectedServices.value})
        feedback.value = t('monitoring.created', {created: outcome.created.length, skipped: outcome.skipped.length})
        creating.value = false
        await doPaginate()
    } catch (failure) { formError.value = failure instanceof Error ? failure.message : t('monitoring.failed') }
    finally { busy.value = false }
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
