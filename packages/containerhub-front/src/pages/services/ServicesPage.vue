<template>
    <v-card variant="flat">
        <v-toolbar density="comfortable">
            <v-toolbar-title>{{ t('services.title') }}</v-toolbar-title>
            <v-spacer/>
            <v-btn
                v-if="authStore.hasPermission('DOCKER_RESTART')"
                :disabled="selected.length === 0"
                :loading="restarting"
                color="primary"
                prepend-icon="mdi-restart"
                variant="tonal"
                @click="restartDialog = true"
            >{{ t('services.restartSelected') }} ({{ selected.length }})</v-btn>
            <v-btn
                v-if="authStore.hasPermission('DOCKER_REMOVE')"
                :disabled="selected.length === 0"
                :loading="removing"
                color="error"
                prepend-icon="mdi-delete"
                variant="tonal"
                @click="removeDialog = true"
            >{{ t('services.removeSelected') }} ({{ selected.length }})</v-btn>
            <crud-refresh-button @click="doPaginate"/>
        </v-toolbar>
        <v-card-text>
            <v-alert v-if="restartResults.length" class="mb-4" closable type="info" variant="tonal" @click:close="restartResults = []">
                <div class="font-weight-bold mb-2">{{ t('services.restartResults') }}</div>
                <div v-for="result in restartResults" :key="result.serviceId" class="d-flex align-center ga-2 mb-1">
                    <v-icon :color="result.success ? (result.warnings.length ? 'warning' : 'success') : 'error'" :icon="result.success ? 'mdi-check-circle' : 'mdi-alert-circle'"/>
                    <strong>{{ result.serviceName }}</strong>
                    <span>{{ restartResultText(result) }}</span>
                </div>
            </v-alert>
            <v-alert v-if="removeResults.length" class="mb-4" closable type="info" variant="tonal" @click:close="removeResults = []">
                <div class="font-weight-bold mb-2">{{ t('services.removeResults') }}</div>
                <div v-for="result in removeResults" :key="result.serviceId" class="d-flex align-center ga-2 mb-1">
                    <v-icon :color="result.success ? 'success' : 'error'" :icon="result.success ? 'mdi-check-circle' : 'mdi-alert-circle'"/>
                    <strong>{{ result.serviceName }}</strong>
                    <span>{{ result.success ? t('services.removeSucceeded') : result.error ?? t('services.removeFailed') }}</span>
                </div>
            </v-alert>
            <crud-search v-if="ServiceCrud.instance.searchEnable" v-model="search"/>
            <crud-filters v-if="ServiceCrud.instance.filtersEnable" v-model="filters" :auto-filter="!ServiceCrud.instance.filterButtons" :entity="ServiceCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
            <crud-filters-action v-if="ServiceCrud.instance.filterButtons" :entity="ServiceCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
        </v-card-text>
        <v-divider/>
        <v-data-table-server
            v-model:items-per-page="itemsPerPage"
            v-model:page="page"
            v-model="selected"
            v-model:sort-by="sortBy"
            :headers="headers"
            :items="items"
            :items-length="totalItems"
            :loading="loading"
            :search="search"
            :items-per-page-options="[5, 10, 20, 50]"
            item-value="id"
            return-object
            show-expand
            :show-select="authStore.hasPermission('DOCKER_RESTART') || authStore.hasPermission('DOCKER_REMOVE')"
            @update:options="doPaginate"
        >
            <template #item.data-table-expand="{item, internalItem, isExpanded, toggleExpand}">
                <v-btn :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small" variant="text" @click.stop="toggleTasks(item, internalItem, isExpanded, toggleExpand)"/>
            </template>
            <template #item.name="{item}"><strong v-if="service(item)">{{ service(item)?.name }}</strong></template>
            <template #item.image.nameWithTag="{item}">
                <v-tooltip v-if="service(item)?.image?.fullname" location="bottom">
                    <template #activator="{props}"><v-chip v-bind="props" class="text-truncate" label size="small" style="max-width: 360px" variant="outlined">{{ service(item)?.image.nameWithTag }}</v-chip></template>
                    {{ service(item)?.image.fullname }}
                </v-tooltip>
            </template>
            <template #item.ports="{item}"><span v-if="service(item)?.ports.length">{{ service(item)?.ports.map(port => `${port.hostPort}:${port.containerPort}`).join(', ') }}</span><span v-else class="text-medium-emphasis">—</span></template>
            <template #item.createdAt="{value}">{{ format(value) }}</template>
            <template #item.updatedAt="{value}">{{ format(value) }}</template>
            <template #expanded-row="{columns, item}">
                <tr>
                    <td :colspan="columns.length" class="pa-0">
                        <v-card class="ma-3" variant="outlined">
                            <v-progress-linear v-if="taskLoading[service(item)?.id ?? '']" indeterminate/>
                            <v-card-text v-else-if="tasks[service(item)?.id ?? '']?.length" class="position-relative">
                                <v-btn :aria-label="t('services.tasks.refresh')" class="position-absolute" icon="mdi-refresh" location="top end" size="small" variant="text" @click="service(item) && reloadTasks(service(item)!)"/>
                                <v-table density="compact">
                                    <thead><tr><th>{{ t('services.tasks.state') }}</th><th>{{ t('services.tasks.created') }}</th><th>{{ t('services.tasks.updated') }}</th><th>{{ t('services.tasks.node') }}</th><th>{{ t('services.tasks.task') }}</th><th class="text-center">{{ t('services.tasks.actions') }}</th></tr></thead>
                                    <tbody>
                                        <tr v-for="task in tasks[service(item)?.id ?? '']" :key="task.id">
                                            <td><v-chip :color="taskStateColor(task.state)" label size="small" variant="outlined">{{ task.state ?? '—' }}</v-chip></td>
                                            <td>{{ format(task.createdAt) }}</td>
                                            <td>{{ format(task.updatedAt) }}</td>
                                            <td>{{ nodeName(task.nodeId) }}</td>
                                            <td>{{ task.id }}</td>
                                            <td class="text-center">
                                                <v-btn :aria-label="t('services.tasks.logs')" color="primary" icon="mdi-file-document-outline" size="small" variant="text" @click="openLogs(task, service(item)!)"/>
                                                <v-btn :aria-label="t('taskInspect.title')" color="primary" icon="mdi-information-outline" size="small" variant="text" @click="openInspect(task)"/>
                                                <v-btn v-if="task.state === 'running' && task.containerId" :aria-label="t('taskStatistics.title')" color="primary" icon="mdi-chart-line" size="small" variant="text" @click="openStatistics(task)"/>
                                                <v-menu v-if="canOpenTerminal(task)">
                                                    <template #activator="{props}"><v-btn v-bind="props" :aria-label="t('services.tasks.terminal')" color="primary" icon="mdi-console" size="small" variant="text"/></template>
                                                    <v-list density="compact"><v-list-item :title="t('services.tasks.shell', {shell: 'sh'})" @click="openTerminal(task, 'sh')"/><v-list-item :title="t('services.tasks.shell', {shell: 'bash'})" @click="openTerminal(task, 'bash')"/></v-list>
                                                </v-menu>
                                            </td>
                                        </tr>
                                    </tbody>
                                </v-table>
                            </v-card-text>
                            <v-card-text v-else><v-alert density="compact" type="info">{{ t('services.tasks.empty') }}</v-alert></v-card-text>
                        </v-card>
                    </td>
                </tr>
            </template>
        </v-data-table-server>
        <v-dialog v-model="restartDialog" max-width="520" persistent>
            <v-card>
                <v-card-title>{{ t('services.restartSelected') }}</v-card-title>
                <v-card-text>
                    <p>{{ t('services.restartSelectedConfirmation', {count: selected.length}) }}</p>
                    <v-chip v-for="selectedService in selected" :key="selectedService.id" class="mr-2 mt-2" label>{{ selectedService.name }}</v-chip>
                </v-card-text>
                <v-card-actions>
                    <v-spacer/>
                    <v-btn :disabled="restarting" @click="restartDialog = false">{{ t('services.cancel') }}</v-btn>
                    <v-btn :loading="restarting" color="primary" @click="restartSelected">{{ t('services.restart') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <v-dialog v-model="removeDialog" max-width="520" persistent>
            <v-card>
                <v-card-title>{{ t('services.removeSelected') }}</v-card-title>
                <v-card-text>
                    <p>{{ t('services.removeSelectedConfirmation', {count: selected.length}) }}</p>
                    <p class="font-weight-bold text-error">{{ t('services.removeIrreversible') }}</p>
                    <v-chip v-for="selectedService in selected" :key="selectedService.id" class="mr-2 mt-2" label>{{ selectedService.name }}</v-chip>
                </v-card-text>
                <v-card-actions>
                    <v-spacer/>
                    <v-btn :disabled="removing" @click="removeDialog = false">{{ t('services.cancel') }}</v-btn>
                    <v-btn :loading="removing" color="error" @click="removeSelected">{{ t('services.remove') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-card>
</template>

<script setup lang="ts">
import {CrudFilters, CrudFiltersAction, CrudRefreshButton, CrudSearch, useCrud} from '@drax/crud-vue'
import {formatDateTime} from '@drax/common-front'
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useAuthStore} from '@drax/identity-vue'
import type {IDraxFieldFilter} from '@drax/crud-share'
import {ServiceCrud, type Service} from '@/cruds/ServiceCrud'
import {restGet, restPost} from '@/rest'
import {rememberTerminalTicket} from './terminalTickets'
import {toServiceTask, type ServiceTask} from './taskContract'

type Node = {id?: string; hostname?: string}
type ServiceRestartResult = {serviceId: string; success: boolean; warnings: string[]; error?: string}
type ServiceRestartViewResult = ServiceRestartResult & {serviceName: string}
type ServiceRemoveResult = {serviceId: string; success: boolean; error?: string}
type ServiceRemoveViewResult = ServiceRemoveResult & {serviceName: string}

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const {prepareFilters, filters, applyFilters, clearFilters, doPaginate, items, itemsPerPage, loading, page, search, sortBy, totalItems} = useCrud(ServiceCrud.instance)
const tasks = ref<Record<string, ServiceTask[]>>({})
const taskLoading = ref<Record<string, boolean>>({})
const nodeNames = ref<Record<string, string>>({})
const selected = ref<Service[]>([])
const restartDialog = ref(false)
const restarting = ref(false)
const restartResults = ref<ServiceRestartViewResult[]>([])
const removeDialog = ref(false)
const removing = ref(false)
const removeResults = ref<ServiceRemoveViewResult[]>([])
const headers = computed(() => ServiceCrud.instance.headers.map((header) => ({...header, title: t(`service.field.${header.title}`)})))
prepareFilters()
const stack = route.query.stack
if (typeof stack === 'string') {
    const stackFilter = filters.value.find((filter: IDraxFieldFilter) => filter.field === 'stack')
    if (stackFilter) stackFilter.value = stack
}
onMounted(async () => {
    await ServiceCrud.instance.loadFilterOptions()
    if (typeof stack === 'string') await applyFilters()
})

async function toggleTasks(item: unknown, internalItem: unknown, isExpanded: (item: any) => boolean, toggleExpand: (item: any) => void): Promise<void> {
    const expandedService = service(item)
    const willExpand = !isExpanded(internalItem)
    toggleExpand(internalItem)
    if (willExpand && expandedService && !tasks.value[expandedService.id]) await reloadTasks(expandedService)
}

async function reloadTasks(currentService: Service): Promise<void> {
    taskLoading.value[currentService.id] = true
    try {
        const responseTasks = await restGet<unknown[]>(`/api/docker/tasks/${currentService.id}`)
        tasks.value[currentService.id] = responseTasks.map(toServiceTask).filter((task): task is ServiceTask => Boolean(task))
        await loadNodeNames()
    } finally {
        taskLoading.value[currentService.id] = false
    }
}

async function loadNodeNames(): Promise<void> {
    if (Object.keys(nodeNames.value).length) return
    try {
        const nodes = await restGet<Node[]>('/api/docker/nodes')
        nodeNames.value = Object.fromEntries(nodes.flatMap((node) => node.id && node.hostname ? [[node.id, node.hostname]] : []))
    } catch {
        // Users with service access can still inspect task data without the separate node-read permission.
    }
}

function service(item: unknown): Service | null {
    if (item && typeof item === 'object' && 'raw' in item) return service(item.raw)
    if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item)) return null
    return item as Service
}

function format(value: unknown): string {
    return typeof value === 'string' ? formatDateTime(value) : '—'
}

function nodeName(nodeId: string | undefined): string {
    return nodeId ? nodeNames.value[nodeId] ?? nodeId : '—'
}

function taskStateColor(state: string | undefined): string {
    return ({running: 'success', rejected: 'error', shutdown: 'error', failed: 'error', starting: 'teal', complete: 'primary', restarting: 'warning', paused: 'cyan', exited: 'purple', dead: 'black', created: 'indigo'} as Record<string, string>)[state ?? ''] ?? 'grey'
}

function openLogs(task: ServiceTask, currentService: Service): void {
    const logsUrl = router.resolve({name: 'task-logs', params: {taskId: task.id}, query: {service: currentService.name}}).href
    window.open(logsUrl, '_blank', 'noopener')
}

function openInspect(task: ServiceTask): void {
    const inspectUrl = router.resolve({name: 'task-inspect', params: {taskId: task.id}}).href
    window.open(inspectUrl, '_blank', 'noopener')
}

function openStatistics(task: ServiceTask): void {
    const statisticsUrl = router.resolve({name: 'task-statistics', params: {taskId: task.id}}).href
    window.open(statisticsUrl, '_blank', 'noopener')
}

function canOpenTerminal(task: ServiceTask): boolean {
    return task.state === 'running' && Boolean(task.containerId) && authStore.hasPermission('DOCKER_TERMINAL')
}

async function openTerminal(task: ServiceTask, shell: 'sh' | 'bash'): Promise<void> {
    const session = await restPost<{ticket: string}>(`/api/docker/task/${task.id}/terminal-sessions`, {shell})
    rememberTerminalTicket(task.id, session.ticket, shell)
    await router.push({name: 'task-terminal', params: {taskId: task.id}})
}

async function restartSelected(): Promise<void> {
    if (!selected.value.length) return
    restarting.value = true
    const selectedServices = [...selected.value]
    try {
        const results = await restPost<ServiceRestartResult[]>('/api/docker/service/restart', {serviceIds: selected.value.map(({id}) => id)})
        restartResults.value = results.map((result) => ({...result, serviceName: selectedServices.find(({id}) => id === result.serviceId)?.name ?? result.serviceId}))
    } catch (error) {
        const message = error instanceof Error ? error.message : t('services.restartFailed')
        restartResults.value = selectedServices.map(({id, name}) => ({serviceId: id, serviceName: name, success: false, warnings: [], error: message}))
    } finally {
        restarting.value = false
        restartDialog.value = false
        selected.value = []
        await doPaginate()
    }
}

function restartResultText(result: ServiceRestartViewResult): string {
    if (!result.success) return result.error ?? t('services.restartFailed')
    return result.warnings.length ? result.warnings.join(', ') : t('services.restartSucceeded')
}

async function removeSelected(): Promise<void> {
    if (!selected.value.length) return
    removing.value = true
    const selectedServices = [...selected.value]
    try {
        const results = await restPost<ServiceRemoveResult[]>('/api/docker/service/remove', {serviceIds: selected.value.map(({id}) => id)})
        removeResults.value = results.map((result) => ({...result, serviceName: selectedServices.find(({id}) => id === result.serviceId)?.name ?? result.serviceId}))
    } catch (error) {
        const message = error instanceof Error ? error.message : t('services.removeFailed')
        removeResults.value = selectedServices.map(({id, name}) => ({serviceId: id, serviceName: name, success: false, error: message}))
    } finally {
        removing.value = false
        removeDialog.value = false
        selected.value = []
        await doPaginate()
    }
}
</script>
