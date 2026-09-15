<template>
    <v-container fluid class="pa-4 history-page">
        <v-card>
            <v-toolbar>
                <v-toolbar-title>{{ configuration?.serviceName ?? t('monitoring.history') }}</v-toolbar-title>
                <v-spacer/>
                <v-btn icon="mdi-refresh" :aria-label="t('monitoring.refresh')" :loading="loading" @click="load"/>
            </v-toolbar>
            <v-card-subtitle v-if="configuration">{{ configuration.serviceStack || '—' }} · {{ configuration.collectionInterval }} · {{ t(`monitoring.${configuration.collectionType}`) }}</v-card-subtitle>
            <v-card-text>
                <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
                <v-row dense>
                    <v-col cols="12" md="3"><v-text-field v-model="since" type="datetime-local" :label="t('monitoring.since')"/></v-col>
                    <v-col cols="12" md="3"><v-text-field v-model="until" type="datetime-local" :label="t('monitoring.until')"/></v-col>
                    <v-col cols="12" md="3"><v-select v-model="selectedTask" :items="taskOptions" :label="t('monitoring.task')" clearable/></v-col>
                    <v-col cols="12" md="2"><v-select v-model="limit" :items="[100, 250, 500, 1000]" :label="t('monitoring.sampleLimit')"/></v-col>
                    <v-col class="d-flex align-center" cols="12" md="1"><v-btn block color="primary" @click="load">{{ t('monitoring.apply') }}</v-btn></v-col>
                </v-row>
                <v-alert v-if="!loading && !samples.length" type="info" variant="tonal">{{ t('monitoring.noSamples') }}</v-alert>
                <template v-else>
                    <v-row>
                        <v-col v-for="metric in charts" :key="metric.title" cols="12" md="4">
                            <div class="metric-card pa-4 rounded border">
                                <div class="text-subtitle-2">{{ metric.title }}</div>
                                <div class="text-h5">{{ metric.current }}</div>
                                <svg viewBox="0 0 100 40" role="img" :aria-label="metric.title" class="history-chart mt-3">
                                    <polyline :points="sparklinePoints(metric.values)" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </div>
                        </v-col>
                    </v-row>
                    <v-data-table :headers="headers" :items="filteredSamples" :items-per-page="25" :items-per-page-options="[10, 25, 50, 100]" class="mt-4">
                        <template #item.sampledAt="{value}">{{ formatDateTime(String(value)) }}</template>
                        <template #item.cpu="{item}">{{ format(item.metrics.cpuUsage.cpuPercentage, '%') }}</template>
                        <template #item.memory="{item}">{{ format(bytesToGiB(item.metrics.memoryUsage.memoryTotalUsage), ' GB') }}</template>
                    </v-data-table>
                </template>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {formatDateTime} from '@drax/common-front'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {restGet} from '@/rest'
import type {MonitoringConfiguration} from '@/cruds/MonitoringCrud'
import {sparklinePoints, type TaskStatisticsMetrics} from './services/taskStatistics'

type MonitoringSample = {
    _id: string; taskId: string; nodeId: string | null; sampledAt: string; metrics: TaskStatisticsMetrics
}
type Chart = {title: string; current: string; values: Array<number | null>}

const {t} = useI18n()
const route = useRoute()
const configurationId = computed(() => String(route.params.id))
const configuration = ref<MonitoringConfiguration>()
const samples = ref<MonitoringSample[]>([])
const loading = ref(false)
const error = ref('')
const since = ref('')
const until = ref('')
const limit = ref(500)
const selectedTask = ref<string | null>(null)
const taskOptions = computed(() => [...new Set(samples.value.map(sample => sample.taskId))])
const filteredSamples = computed(() => selectedTask.value ? samples.value.filter(sample => sample.taskId === selectedTask.value) : samples.value)
const latest = computed(() => filteredSamples.value.at(-1))
const headers = computed(() => [
    {title: t('monitoring.sampledAt'), key: 'sampledAt'}, {title: t('monitoring.task'), key: 'taskId'},
    {title: t('monitoring.node'), key: 'nodeId'}, {title: t('monitoring.cpu'), key: 'cpu'}, {title: t('monitoring.memory'), key: 'memory'}
])
const charts = computed<Chart[]>(() => {
    const current = latest.value
    if (!current) return []
    const result: Chart[] = [
        {title: t('monitoring.cpu'), current: format(current.metrics.cpuUsage.cpuPercentage, '%'), values: filteredSamples.value.map(sample => sample.metrics.cpuUsage.cpuPercentage)},
        {title: t('monitoring.memory'), current: format(bytesToGiB(current.metrics.memoryUsage.memoryTotalUsage), ' GB'), values: filteredSamples.value.map(sample => bytesToGiB(sample.metrics.memoryUsage.memoryTotalUsage))},
        {title: t('monitoring.io'), current: format(bytesToMiB(current.metrics.ioUsage.readIoBytes), ' MB'), values: filteredSamples.value.map(sample => bytesToMiB(sample.metrics.ioUsage.readIoBytes))}
    ]
    for (const network of current.metrics.networksUsage) result.push({
        title: `${t('monitoring.network')} · ${network.network}`, current: format(bytesToMiB(network.rxBytes), ' MB'),
        values: filteredSamples.value.map(sample => bytesToMiB(sample.metrics.networksUsage.find(entry => entry.network === network.network)?.rxBytes ?? null))
    })
    return result
})

async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
        configuration.value = await restGet<MonitoringConfiguration>(`/api/monitoring-configurations/${encodeURIComponent(configurationId.value)}`)
        const params: Record<string, string | number> = {limit: limit.value}
        if (since.value) params.since = new Date(since.value).toISOString()
        if (until.value) params.until = new Date(until.value).toISOString()
        samples.value = (await restGet<{items: MonitoringSample[]}>(`/api/monitoring-configurations/${encodeURIComponent(configurationId.value)}/samples`, params)).items
        if (selectedTask.value && !taskOptions.value.includes(selectedTask.value)) selectedTask.value = null
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : t('monitoring.historyFailed')
    } finally { loading.value = false }
}
function bytesToMiB(value: number | null): number | null { return value === null ? null : value / 1024 ** 2 }
function bytesToGiB(value: number | null): number | null { return value === null ? null : value / 1024 ** 3 }
function format(value: number | null, suffix: string): string { return value === null ? '—' : `${value.toFixed(2)}${suffix}` }
onMounted(load)
</script>

<style scoped>
.history-page { max-width: 1600px; }
.metric-card { min-height: 150px; }
.history-chart { display: block; width: 100%; height: 64px; color: rgb(var(--v-theme-primary)); }
</style>
