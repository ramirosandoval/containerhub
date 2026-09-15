<template>
    <v-container class="pa-4">
        <v-card :loading="loading">
            <v-card-title>{{ t('cluster.title') }}</v-card-title>
            <v-card-text>
                <v-alert v-if="failed" type="error" role="alert" class="mb-4">
                    {{ t('cluster.error') }}
                    <v-btn variant="text" :disabled="loading" @click="loadSummary">{{ t('cluster.retry') }}</v-btn>
                </v-alert>
                <v-list v-if="summary">
                    <v-list-item :title="t('cluster.nodes')" :subtitle="String(summary.nodesQuantity)"/>
                    <v-list-item :title="t('cluster.services')" :subtitle="String(summary.servicesQuantity)"/>
                    <v-list-item :title="t('cluster.tasks')" :subtitle="String(summary.tasksQuantity)"/>
                </v-list>
                <p class="text-body-2 mt-2">{{ t('cluster.taskHint') }}</p>
            </v-card-text>
        </v-card>
        
        <RefreshOptions v-model="displayOptions" />
        
        <ClusterVisualizer 
            :nodes="nodes" 
            :loading="fetchNodesLoading" 
            :onlyDisplayRunningTasks="displayOptions.onlyDisplayRunningTasks"
            :displayNodeLabels="displayOptions.displayNodeLabels"
        />
    </v-container>
</template>

<script setup lang="ts">
import {onMounted, ref, watch, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'
import RefreshOptions, {type ClusterDisplayOptions} from './cluster/RefreshOptions.vue'
import ClusterVisualizer from './cluster/ClusterVisualizer.vue'

type ClusterSummary = {nodesQuantity: number; servicesQuantity: number; tasksQuantity: number}
const {t} = useI18n()
const loading = ref(false)
const failed = ref(false)
const summary = ref<ClusterSummary>()

const fetchNodesLoading = ref(false)
const nodes = ref<any[]>([])
const displayOptions = ref<ClusterDisplayOptions>({
    onlyDisplayRunningTasks: false,
    displayNodeLabels: false,
    autoRefresh: false,
    refreshRate: '5s'
})

let timerId: ReturnType<typeof setTimeout> | null = null

async function loadSummary() {
    loading.value = true
    failed.value = false
    try {
        summary.value = await restGet<ClusterSummary>('/api/docker/cluster')
    } catch {
        failed.value = true
    } finally {
        loading.value = false
    }
}

async function loadNodesAndTasks() {
    fetchNodesLoading.value = true
    try {
        nodes.value = await restGet<any[]>('/api/docker/nodes-and-tasks')
    } catch (e) {
        console.error('Error fetching nodes and tasks', e)
    } finally {
        fetchNodesLoading.value = false
        if (displayOptions.value.autoRefresh) {
            scheduleRefresh()
        }
    }
}

function clearTimer() {
    if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
    }
}

function scheduleRefresh() {
    clearTimer()
    if (!displayOptions.value.autoRefresh) return
    const ms = parseInt(displayOptions.value.refreshRate.replace('s', '')) * 1000
    timerId = setTimeout(() => {
        loadNodesAndTasks()
    }, ms || 5000)
}

watch(() => displayOptions.value.autoRefresh, (autoRefresh) => {
    if (autoRefresh) {
        loadNodesAndTasks()
    } else {
        clearTimer()
    }
})

watch(() => displayOptions.value.refreshRate, () => {
    if (displayOptions.value.autoRefresh) {
        scheduleRefresh()
    }
})

onMounted(() => {
    loadSummary()
    loadNodesAndTasks()
})

onUnmounted(() => {
    clearTimer()
})
</script>
