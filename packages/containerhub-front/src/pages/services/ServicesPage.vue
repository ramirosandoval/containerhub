<template>
    <v-container fluid>
        <v-card :class="ServiceCrud.instance.cardClass" :density="ServiceCrud.instance.cardDensity">
        <v-toolbar :class="ServiceCrud.instance.toolbarClass" :density="ServiceCrud.instance.toolbarDensity">
            <v-toolbar-title>{{ t('services.title') }}</v-toolbar-title>
            <v-spacer/>
            <crud-filter-button v-if="ServiceCrud.instance.dynamicFiltersEnable" :entity="ServiceCrud.instance"/>
            <crud-columns-button v-if="ServiceCrud.instance.isColumnSelectable" :entity="ServiceCrud.instance"/>
            <crud-saved-queries-button v-if="ServiceCrud.instance.isSavedQueriesEnabled" :entity="ServiceCrud.instance" />
            <crud-refresh-button v-if="ServiceCrud.instance.isRefreshable !== false" @click="doPaginate"/>
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
            <v-card v-if="isDynamicFiltersEnable" id="crud-list-table-default-filters" class="crud-list-table__default-filters mt-4" variant="flat">
                <auto-crud-filters v-if="ServiceCrud.instance.filtersEnable" v-model="filters" :entity="ServiceCrud.instance" @apply-filter="applyFilters" @clear-filter="clearFilters"/>
            </v-card>
        </v-card-text>
        <v-card-actions v-if="selected.length" class="flex-wrap ga-2 px-4 pb-4 pt-0">
            <v-spacer/>
            <v-btn
                v-if="authStore.hasPermission('DOCKER_RESTART')"
                :loading="restarting"
                prepend-icon="mdi-restart"
                size="small"
                variant="text"
                @click="restartDialog = true"
            >{{ t('services.restartSelected') }} ({{ selected.length }})</v-btn>
            <v-btn
                v-if="authStore.hasPermission('DOCKER_REMOVE')"
                :loading="removing"
                color="error"
                prepend-icon="mdi-delete"
                size="small"
                variant="flat"
                @click="removeDialog = true"
            >{{ t('services.removeSelected') }} ({{ selected.length }})</v-btn>
        </v-card-actions>
        <v-divider/>
        <v-data-table-server
            v-model:items-per-page="itemsPerPage"
            v-model:page="page"
            v-model="selected"
            v-model:sort-by="sortBy"
            :headers="filteredHeaders"
            :header-props="ServiceCrud.instance.headerProps"
            :items="items"
            :items-length="totalItems"
            :loading="loading"
            :density="ServiceCrud.instance.tableDensity"
            :striped="ServiceCrud.instance.tableStriped"
            :search="search"
            :items-per-page-options="[5, 10, 20, 50]"
            item-value="id"
            return-object
            show-expand
            :show-select="authStore.hasPermission('DOCKER_RESTART') || authStore.hasPermission('DOCKER_REMOVE')"
            @update:options="doPaginate"
        >
            <template #bottom>
                <v-data-table-footer :class="ServiceCrud.instance.footerClass" :items-per-page-options="[5, 10, 20, 50]"/>
            </template>
            <template #item.data-table-expand="{item, internalItem, isExpanded, toggleExpand}">
                <v-btn :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small" variant="text" @click.stop="toggleTasks(item, internalItem, isExpanded, toggleExpand)"/>
            </template>
            <template #item.name="{item}"><strong v-if="service(item)">{{ service(item)?.name }}</strong></template>
            <template #item.image.nameWithTag="{item}">
                <v-tooltip v-if="service(item)?.image?.fullname" location="bottom">
                    <template #activator="{props}"><v-chip v-bind="props" class="text-truncate" label link size="small" style="max-width: 360px" variant="outlined" @click.stop="service(item) && openRegistry(service(item)!)">{{ service(item)?.image.nameWithTag }}</v-chip></template>
                    {{ service(item)?.image.fullname }}
                </v-tooltip>
            </template>
            <template #item.ports="{item}"><span v-if="service(item)?.ports.length">{{ service(item)?.ports.map(port => `${port.hostPort}:${port.containerPort}`).join(', ') }}</span><span v-else class="text-medium-emphasis">—</span></template>
            <template #item.createdAt="{value}">{{ format(value) }}</template>
            <template #item.updatedAt="{value}">{{ format(value) }}</template>
            <template #expanded-row="{columns, item}">
                <tr>
                    <td :colspan="columns.length" class="pa-0">
                        <ServiceTasksPanel
                            :tasks="tasks[service(item)?.id ?? '']"
                            :loading="Boolean(taskLoading[service(item)?.id ?? ''])"
                            :node-names="nodeNames"
                            :allow-terminal="authStore.hasPermission('DOCKER_TERMINAL')"
                            @reload="service(item) && reloadTasks(service(item)!)"
                            @logs="task => openLogs(task, service(item)!)"
                            @inspect="openInspect"
                            @statistics="openStatistics"
                            @terminal="(task, shell) => openTerminal(task, shell)"
                        />
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
    </v-container>
</template>

<script setup lang="ts">
import {CrudRefreshButton, CrudSearch, useCrud, CrudSavedQueriesButton} from '@drax/crud-vue'
import CrudFilterButton from '@drax/crud-vue/src/components/buttons/CrudFilterButton.vue'
import CrudColumnsButton from '@drax/crud-vue/src/components/buttons/CrudColumnsButton.vue'
import {useCrudColumns} from '@drax/crud-vue/src/composables/UseCrudColumns'
import {formatDateTime} from '@drax/common-front'
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useAuthStore} from '@drax/identity-vue'
import type {IDraxFieldFilter} from '@drax/crud-share'
import AutoCrudFilters from '@/components/AutoCrudFilters.vue'
import {ServiceCrud, type Service} from '@/cruds/ServiceCrud'
import {restGet, restPost} from '@/rest'
import {serviceRegistryTarget} from '@/images/registryImageReference'
import {rememberTerminalTicket} from './terminalTickets'
import {toServiceTask, type ServiceTask} from './taskContract'
import ServiceTasksPanel from './ServiceTasksPanel.vue'

type Node = {id?: string; hostname?: string}
type ServiceRestartResult = {serviceId: string; success: boolean; warnings: string[]; error?: string}
type ServiceRestartViewResult = ServiceRestartResult & {serviceName: string}
type ServiceRemoveResult = {serviceId: string; success: boolean; error?: string}
type ServiceRemoveViewResult = ServiceRemoveResult & {serviceName: string}

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const {prepareFilters, filters, applyFilters, clearFilters, doPaginate, items, itemsPerPage, loading, page, search, sortBy, totalItems, isDynamicFiltersEnable} = useCrud(ServiceCrud.instance)
const {filteredHeaders} = useCrudColumns(ServiceCrud.instance)
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
prepareFilters()
const hasInitialFilters = applyInitialFilter('stack', route.query.stack) || applyInitialFilter('image', route.query.image)
onMounted(async () => {
    await ServiceCrud.instance.loadFilterOptions()
    if (hasInitialFilters) await applyFilters()
})

function applyInitialFilter(field: string, value: unknown): boolean {
    if (typeof value !== 'string') return false
    const filter = filters.value.find((candidate: IDraxFieldFilter) => candidate.field === field)
    if (!filter) return false
    filter.value = value
    return true
}

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

async function openRegistry(currentService: Service): Promise<void> {
    const target = serviceRegistryTarget(currentService.image)
    await router.push({name: 'registry-images', query: {repository: target.repository, tag: target.tag ?? undefined}})
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
