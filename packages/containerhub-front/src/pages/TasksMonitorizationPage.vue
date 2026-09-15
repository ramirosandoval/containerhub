<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-toolbar>
                <v-toolbar-title>Task Lifecycle Monitoring</v-toolbar-title>
                <v-spacer/>
                <v-btn icon="mdi-refresh" aria-label="Refresh" :loading="loading" @click="load(1)"/>
            </v-toolbar>
            <v-card-text>
                <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

                <v-data-table-server
                    v-model:items-per-page="options.itemsPerPage"
                    :headers="headers"
                    :items="items"
                    :items-length="totalItems"
                    :loading="loading"
                    class="elevation-1 mt-4"
                    @update:options="loadFromOptions"
                >
                    <template #item.date="{item}">{{ formatDateTime(item.date) }}</template>
                    <template #item.status="{item}">
                        <v-chip :color="item.status === 'running' ? 'success' : 'error'" size="small" class="text-uppercase font-weight-bold">
                            {{ item.status }}
                        </v-chip>
                    </template>
                    <template #item.modifiedBy="{item}">
                        {{ item.modifiedBy ?? 'Unknown' }}
                    </template>
                </v-data-table-server>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {formatDateTime} from '@drax/common-front'
import {fetchTaskMonitorizations, type ITaskMonitorization} from '../providers/TaskMonitorizationApi'

const items = ref<ITaskMonitorization[]>([])
const loading = ref(false)
const error = ref('')
const totalItems = ref(0)
const options = ref({page: 1, itemsPerPage: 20})

const headers = [
    {title: 'Date', key: 'date', sortable: false},
    {title: 'Event', key: 'status', sortable: false},
    {title: 'Task ID', key: 'taskId', sortable: false},
    {title: 'Node', key: 'nodeName', sortable: false},
    {title: 'Service', key: 'serviceName', sortable: false},
    {title: 'Modified By', key: 'modifiedBy', sortable: false},
]

async function load(page = options.value.page, limit = options.value.itemsPerPage) {
    loading.value = true
    error.value = ''
    try {
        const response = await fetchTaskMonitorizations(page, limit)
        items.value = response.items
        totalItems.value = response.total
        options.value.page = response.page
        options.value.itemsPerPage = response.limit
    } catch (err: any) {
        error.value = err.message || 'Failed to fetch task monitorizations'
    } finally {
        loading.value = false
    }
}

function loadFromOptions(newOptions: any) {
    load(newOptions.page, newOptions.itemsPerPage)
}

onMounted(() => {
    load()
})
</script>
