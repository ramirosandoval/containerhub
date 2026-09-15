<template>
    <v-container fluid class="pa-4 inspect-page">
        <v-sheet border rounded="lg" class="pa-4 mb-4" :aria-busy="loading">
            <div class="d-flex flex-wrap align-start justify-space-between ga-3">
                <div class="inspect-heading">
                    <h1 class="text-h5 mb-1">{{ t('taskInspect.title') }}</h1>
                    <p class="text-body-2">{{ t('taskInspect.service') }}: {{ serviceName || '—' }}</p>
                    <p class="text-caption text-medium-emphasis inspect-value mt-1">ID: {{ route.params.taskId }}</p>
                </div>
                <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="loadInspect">{{ t('taskInspect.refresh') }}</v-btn>
            </div>
            <p class="text-caption text-medium-emphasis mt-3" role="status">{{ t('taskInspect.lastRead') }}: {{ lastRead ? formatDateTime(lastRead) : '—' }}</p>
            <dl v-if="inspection" class="inspect-summary mt-4 pt-4">
                <div v-for="field in summary" :key="field.label">
                    <dt class="text-caption text-medium-emphasis">{{ t(`taskInspect.${field.label}`) }}</dt>
                    <dd class="text-body-2 inspect-value">{{ field.value ?? '—' }}</dd>
                </div>
            </dl>
            <v-alert v-if="executionError" type="warning" variant="tonal" class="mt-4 inspect-value">{{ t('taskInspect.executionError') }}: {{ executionError }}</v-alert>
        </v-sheet>
        <v-alert v-if="failed" :type="inspection ? 'warning' : 'error'" variant="tonal" class="mb-4">
            {{ t(inspection ? 'taskInspect.stale' : 'taskInspect.error') }}
            <v-btn variant="text" :disabled="loading" @click="loadInspect">{{ t('taskInspect.retry') }}</v-btn>
        </v-alert>
        <v-sheet v-if="inspection" border rounded="lg" class="inspect-detail">
            <v-tabs v-model="view" :aria-label="t('taskInspect.detail')" class="px-2">
                <v-tab value="tree">{{ t('taskInspect.tree') }}</v-tab>
                <v-tab value="json">JSON</v-tab>
            </v-tabs>
            <v-divider />
            <div v-show="view === 'tree'">
                <div class="d-flex flex-wrap align-center ga-2 pa-4">
                    <v-text-field v-model="search" :label="t('taskInspect.search')" prepend-inner-icon="mdi-magnify" clearable hide-details density="compact" variant="outlined" class="inspect-search" />
                    <v-btn variant="text" size="small" :disabled="!!search" @click="opened = branchIds(tree)">{{ t('taskInspect.expand') }}</v-btn>
                    <v-btn variant="text" size="small" :disabled="!!search" @click="opened = []">{{ t('taskInspect.collapse') }}</v-btn>
                </div>
                <v-treeview v-model:opened="opened" :items="tree" :search="search || ''" :open-all="!!search" item-value="id" density="compact" :no-data-text="t('taskInspect.noMatches')" :aria-label="t('taskInspect.tree')">
                    <template #title="{item}">
                        <span class="inspect-key">{{ item.key }}</span><span v-if="item.value" class="inspect-value text-medium-emphasis">: {{ item.value }}</span>
                        <span class="inspect-type text-medium-emphasis">{{ item.type }}</span>
                    </template>
                </v-treeview>
            </div>
            <div v-if="view === 'json'" class="pa-4">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3">
                    <p class="text-body-2 text-medium-emphasis">{{ t('taskInspect.sensitive') }}</p>
                    <v-btn variant="tonal" prepend-icon="mdi-content-copy" @click="copyJson">{{ t('taskInspect.copy') }}</v-btn>
                </div>
                <p v-if="copyFeedback" role="status" class="text-body-2 mb-3">{{ t(`taskInspect.${copyFeedback}`) }}</p>
                <pre tabindex="0" :aria-label="t('taskInspect.fullJson')" class="inspect-json pa-3 rounded">{{ inspectionJson }}</pre>
            </div>
        </v-sheet>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {formatDateTime} from '@drax/common-front'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {restGet} from '@/rest'
import {taskInspectTree, type TaskInspectTreeItem} from './taskInspectTree'
import {toServiceTask} from './taskContract'

const {t} = useI18n()
const route = useRoute()
const loading = ref(false)
const failed = ref(false)
const inspection = ref<Record<string, unknown>>()
const serviceName = ref('')
const lastRead = ref('')
const view = ref('tree')
const search = ref('')
const opened = ref<string[]>([])
const copyFeedback = ref('')
let requestSequence = 0
const tree = computed(() => inspection.value ? taskInspectTree(inspection.value) : [])
const inspectionJson = computed(() => JSON.stringify(inspection.value, null, 2))
const task = computed(() => toServiceTask(inspection.value))
function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function text(value: unknown) { return typeof value === 'string' && value ? value : undefined }
const status = computed(() => record(inspection.value?.Status))
const executionError = computed(() => text(status.value?.Err))
const summary = computed(() => {
    const containerStatus = record(status.value?.ContainerStatus)
    return [
        {label: 'observed', value: task.value?.state},
        {label: 'desired', value: text(inspection.value?.DesiredState)},
        {label: 'node', value: task.value?.nodeId},
        {label: 'container', value: task.value?.containerId},
        {label: 'image', value: text(record(record(inspection.value?.Spec)?.ContainerSpec)?.Image)},
        {label: 'created', value: task.value?.createdAt ? formatDateTime(task.value.createdAt) : undefined},
        {label: 'updated', value: task.value?.updatedAt ? formatDateTime(task.value.updatedAt) : undefined},
        {label: 'message', value: text(status.value?.Message)},
        {label: 'exitCode', value: typeof containerStatus?.ExitCode === 'number' ? containerStatus.ExitCode : undefined}
    ]
})
function branchIds(items: TaskInspectTreeItem[]): string[] {
    return items.flatMap(item => item.children ? [item.id, ...branchIds(item.children)] : [])
}
async function copyJson() {
    try {
        await navigator.clipboard.writeText(inspectionJson.value || '')
        copyFeedback.value = 'copied'
    } catch {
        copyFeedback.value = 'copyError'
    }
}
async function loadInspect() {
    const request = ++requestSequence
    const taskId = String(route.params.taskId)
    loading.value = true
    failed.value = false
    copyFeedback.value = ''
    try {
        const payload = await restGet<unknown>(`/api/docker/task/${encodeURIComponent(taskId)}/inspect`)
        if (request !== requestSequence) return
        const inspectedTask = record(payload)
        if (!inspectedTask || inspectedTask.ID !== taskId) throw new Error('Invalid task inspection')
        const initialRead = !inspection.value
        inspection.value = inspectedTask
        lastRead.value = new Date().toISOString()
        if (initialRead) opened.value = tree.value.filter(item => item.children).map(item => item.id)
        const serviceId = text(inspectedTask.ServiceID)
        serviceName.value = serviceId || ''
        if (serviceId) {
            try {
                const service = await restGet<unknown>(`/api/docker/service/${encodeURIComponent(serviceId)}`)
                if (request === requestSequence) serviceName.value = text(record(service)?.name) || serviceId
            } catch {
                // A removed service must not hide the remaining task inspection.
            }
        }
    } catch {
        if (request === requestSequence) failed.value = true
    } finally {
        if (request === requestSequence) loading.value = false
    }
}
watch(() => route.params.taskId, () => {
    inspection.value = undefined
    serviceName.value = ''
    lastRead.value = ''
    search.value = ''
    opened.value = []
    view.value = 'tree'
    loadInspect()
}, {immediate: true})
onBeforeUnmount(() => { requestSequence++ })
</script>

<style scoped>
.inspect-page { max-width: 1600px; }
.inspect-heading { min-width: 0; }
.inspect-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 16px 24px; border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.inspect-value { overflow-wrap: anywhere; white-space: pre-wrap; user-select: text; }
.inspect-search { flex: 1 1 280px; }
.inspect-key { font-weight: 500; }
.inspect-type { font-size: 11px; margin-inline-start: 12px; }
.inspect-detail { overflow: hidden; }
.inspect-detail :deep(.v-list-item-title) { white-space: normal; overflow: visible; overflow-wrap: anywhere; line-height: 1.6; padding-block: 5px; }
.inspect-json { background: rgba(var(--v-theme-on-surface), 0.04); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
</style>
