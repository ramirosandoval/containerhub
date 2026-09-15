<template>
    <v-container fluid class="pa-4 statistics-page">
        <v-card>
            <v-toolbar>
                <v-toolbar-title>{{ t('taskStatistics.title') }}</v-toolbar-title>
                <v-spacer/>
                <v-switch v-model="autoRefresh" hide-details density="compact" :label="t('taskStatistics.autoRefresh')" @update:model-value="restartPolling"/>
                <v-select v-model="pollingInterval" class="polling-rate mx-3" density="compact" hide-details :items="pollingIntervals" :label="t('taskStatistics.interval')" @update:model-value="restartPolling"/>
                <v-btn icon="mdi-refresh" :aria-label="t('taskStatistics.refresh')" :loading="loading" @click="loadStatistics"/>
            </v-toolbar>
            <v-card-subtitle class="pt-3">{{ taskId }}<span v-if="statistics?.task.nodeId"> · {{ statistics.task.nodeId }}</span></v-card-subtitle>
            <v-card-text>
                <v-alert v-if="failed" :type="samples.length ? 'warning' : 'error'" variant="tonal" class="mb-4">
                    {{ t(samples.length ? 'taskStatistics.stale' : 'taskStatistics.error') }}
                </v-alert>
                <v-alert v-if="statistics && !statistics.metrics" type="info" variant="tonal">{{ t('taskStatistics.unavailable') }}</v-alert>
                <v-row v-if="latest">
                    <v-col cols="12" md="4">
                        <statistics-card :title="t('taskStatistics.cpu')" :value="format(latest.cpuUsage.cpuPercentage, '%')" :threshold="thresholds.cpu" :series="samples.map(sample => sample.cpuUsage.cpuPercentage)"/>
                    </v-col>
                    <v-col cols="12" md="4">
                        <statistics-card :title="t('taskStatistics.memory')" :value="format(bytesToGiB(latest.memoryUsage.memoryTotalUsage), ' GB')" :threshold="thresholds.memory" :series="samples.map(sample => bytesToGiB(sample.memoryUsage.memoryTotalUsage))"/>
                    </v-col>
                    <v-col cols="12" md="4">
                        <statistics-card :title="t('taskStatistics.io')" :value="`${format(bytesToMiB(latest.ioUsage.readIoBytes), ' MB')} / ${format(bytesToMiB(latest.ioUsage.writeIoBytes), ' MB')}`" :threshold="thresholds.io" :series="samples.map(sample => bytesToMiB(sample.ioUsage.readIoBytes))"/>
                    </v-col>
                    <v-col v-for="network in latest.networksUsage" :key="network.network" cols="12" md="4">
                        <statistics-card :title="`${t('taskStatistics.network')} · ${network.network}`" :value="`${format(bytesToMiB(network.rxBytes), ' MB')} / ${format(bytesToMiB(network.txBytes), ' MB')}`" :threshold="thresholds.network" :series="networkSeries(network.network)"/>
                    </v-col>
                </v-row>
                <v-divider v-if="latest" class="my-4"/>
                <v-row v-if="latest" dense>
                    <v-col cols="12" sm="6" md="3"><v-text-field v-model.number="thresholds.cpu" type="number" min="0" :label="t('taskStatistics.cpuThreshold')"/></v-col>
                    <v-col cols="12" sm="6" md="3"><v-text-field v-model.number="thresholds.memory" type="number" min="0" :label="t('taskStatistics.memoryThreshold')"/></v-col>
                    <v-col cols="12" sm="6" md="3"><v-text-field v-model.number="thresholds.io" type="number" min="0" :label="t('taskStatistics.ioThreshold')"/></v-col>
                    <v-col cols="12" sm="6" md="3"><v-text-field v-model.number="thresholds.network" type="number" min="0" :label="t('taskStatistics.networkThreshold')"/></v-col>
                </v-row>
                <p v-if="latest" class="text-caption text-medium-emphasis">{{ t('taskStatistics.sampledAt') }}: {{ latest.sampledAt ? formatDateTime(latest.sampledAt) : '—' }}</p>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import {formatDateTime} from '@drax/common-front'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {restGet} from '@/rest'
import {appendStatisticsSample, pollIntervalMilliseconds, sparklinePoints, type PollingInterval, type TaskStatisticsEnvelope, type TaskStatisticsMetrics} from './taskStatistics'

const {t} = useI18n()
const route = useRoute()
const taskId = computed(() => String(route.params.taskId))
const statistics = ref<TaskStatisticsEnvelope>()
const samples = ref<TaskStatisticsMetrics[]>([])
const latest = computed(() => samples.value.at(-1))
const loading = ref(false)
const failed = ref(false)
const autoRefresh = ref(true)
const pollingInterval = ref<PollingInterval>('5s')
const pollingIntervals: PollingInterval[] = ['5s', '10s', '15s', '30s', '45s', '60s']
const thresholds = reactive({cpu: 0, memory: 0, io: 0, network: 0})
let pollTimer: ReturnType<typeof setTimeout> | undefined
let requestSequence = 0

const StatisticsCard = defineComponent({
    props: {title: {type: String, required: true}, value: {type: String, required: true}, threshold: {type: Number, required: true}, series: {type: Array<number | null>, required: true}},
    setup(props) {
        const lastValue = computed(() => [...props.series].reverse().find(value => value !== null) ?? null)
        const color = computed(() => props.threshold > 0 && lastValue.value !== null && lastValue.value >= props.threshold ? 'error' : 'primary')
        return () => h('div', {class: 'statistics-card pa-4 rounded border'}, [
            h('div', {class: 'text-subtitle-2'}, props.title), h('div', {class: `text-h5 text-${color.value}`}, props.value),
            h('svg', {viewBox: '0 0 100 40', role: 'img', 'aria-label': props.title, class: 'statistics-chart mt-3'}, [
                h('polyline', {points: sparklinePoints(props.series), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke'})
            ])
        ])
    }
})

function stopPolling(): void {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = undefined
}
function schedulePolling(): void {
    stopPolling()
    if (autoRefresh.value) pollTimer = setTimeout(loadStatistics, pollIntervalMilliseconds(pollingInterval.value))
}
function restartPolling(): void {
    stopPolling()
    if (autoRefresh.value) void loadStatistics()
}
async function loadStatistics(): Promise<void> {
    const request = ++requestSequence
    stopPolling()
    loading.value = true
    failed.value = false
    try {
        const response = await restGet<TaskStatisticsEnvelope>(`/api/docker/task/${encodeURIComponent(taskId.value)}/stats`)
        if (request !== requestSequence) return
        statistics.value = response
        if (response.metrics) samples.value = appendStatisticsSample(samples.value, response.metrics)
    } catch {
        if (request === requestSequence) failed.value = true
    } finally {
        if (request === requestSequence) {
            loading.value = false
            schedulePolling()
        }
    }
}
function bytesToMiB(value: number | null): number | null { return value === null ? null : value / 1024 ** 2 }
function bytesToGiB(value: number | null): number | null { return value === null ? null : value / 1024 ** 3 }
function format(value: number | null, suffix: string): string { return value === null ? '—' : `${value.toFixed(2)}${suffix}` }
function networkSeries(networkName: string): Array<number | null> {
    return samples.value.map(sample => {
        const network = sample.networksUsage.find(entry => entry.network === networkName)
        return network ? bytesToMiB(network.rxBytes) : null
    })
}
watch(taskId, () => { samples.value = []; statistics.value = undefined; void loadStatistics() })
onMounted(loadStatistics)
onBeforeUnmount(() => { requestSequence++; stopPolling() })
</script>

<style scoped>
.statistics-page { max-width: 1600px; }
.polling-rate { max-width: 140px; }
.statistics-card { min-height: 150px; }
.statistics-chart { display: block; width: 100%; height: 64px; color: rgb(var(--v-theme-primary)); }
</style>
