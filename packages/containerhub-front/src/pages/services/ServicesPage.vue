<template>
    <v-card variant="flat">
        <v-toolbar density="comfortable">
            <v-toolbar-title>{{ t('services.title') }}</v-toolbar-title>
            <v-spacer/>
            <crud-refresh-button @click="doPaginate"/>
        </v-toolbar>
        <v-card-text>
            <crud-search v-if="ServiceCrud.instance.searchEnable" v-model="search"/>
            <crud-filters v-if="ServiceCrud.instance.filtersEnable" v-model="filters" :auto-filter="!ServiceCrud.instance.filterButtons" :entity="ServiceCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
            <crud-filters-action v-if="ServiceCrud.instance.filterButtons" :entity="ServiceCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
        </v-card-text>
        <v-divider/>
        <v-data-table-server
            v-model:items-per-page="itemsPerPage"
            v-model:page="page"
            v-model:sort-by="sortBy"
            :headers="headers"
            :items="items"
            :items-length="totalItems"
            :loading="loading"
            :search="search"
            :items-per-page-options="[5, 10, 20, 50]"
            item-value="id"
            show-expand
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

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const {prepareFilters, filters, applyFilters, clearFilters, doPaginate, items, itemsPerPage, loading, page, search, sortBy, totalItems} = useCrud(ServiceCrud.instance)
const tasks = ref<Record<string, ServiceTask[]>>({})
const taskLoading = ref<Record<string, boolean>>({})
const nodeNames = ref<Record<string, string>>({})
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

function canOpenTerminal(task: ServiceTask): boolean {
    return task.state === 'running' && Boolean(task.containerId) && authStore.hasPermission('DOCKER_TERMINAL')
}

async function openTerminal(task: ServiceTask, shell: 'sh' | 'bash'): Promise<void> {
    const session = await restPost<{ticket: string}>(`/api/docker/task/${task.id}/terminal-sessions`, {shell})
    rememberTerminalTicket(task.id, session.ticket)
    await router.push({name: 'task-terminal', params: {taskId: task.id}})
}
</script>
