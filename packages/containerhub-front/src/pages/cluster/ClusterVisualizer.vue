<template>
    <v-card variant="outlined" class="mt-4">
        <v-card-title class="d-flex justify-space-between align-center">
            <div>
                {{ t('cluster.visualizer.title') }}
                <div class="text-subtitle-2 text-medium-emphasis">{{ t('cluster.visualizer.subtitle') }}</div>
            </div>
            <v-progress-circular v-if="loading" indeterminate color="primary" class="mr-2"></v-progress-circular>
        </v-card-title>
        
        <v-data-table
            :headers="headers"
            :items="nodes"
            item-value="id"
            v-model:expanded="expanded"
            show-expand
        >
            <template v-slot:item.state="{ item }">
                <v-chip :color="getNodeStatusColor(item.state)" size="small" class="text-white">{{ item.state }}</v-chip>
            </template>
            <template v-slot:item.resources="{ item }">
                {{ item.resources ? (Number(item.resources.NanoCPUs) / 1000000000) : 0 }} CPU / {{ item.resources ? (Number(item.resources.MemoryBytes) / 1024 / 1024 / 1024).toFixed(2) : 0 }} GB
            </template>
            <template v-slot:item.labels="{ item }">
                <v-chip
                    v-for="(value, key) in (item.labels || {})"
                    :key="key"
                    color="blue-darken-3"
                    size="small"
                    class="text-white ma-1"
                >
                    <v-tooltip activator="parent" location="bottom">{{ value }}</v-tooltip>
                    {{ key }}
                </v-chip>
            </template>
            
            <template v-slot:expanded-row="{ columns, item }">
                <tr>
                    <td :colspan="columns.length" class="pa-4 bg-grey-lighten-4">
                        <v-card variant="flat">
                            <v-data-table
                                :headers="taskHeaders"
                                :items="filterTasks(item.tasks || [])"
                                item-value="id"
                                density="compact"
                                :items-per-page="-1"
                                hide-default-footer
                            >
                                <template v-slot:item.state="{ item: task }">
                                    <v-chip :color="getTaskStateColor(task.state)" size="small" class="text-white">{{ task.state }}</v-chip>
                                </template>
                                <template v-slot:item.image.name="{ item: task }">
                                    {{ task.image?.name }}
                                </template>
                                <template v-slot:item.image.fullname="{ item: task }">
                                    {{ task.image?.fullname }}
                                </template>
                                <template v-slot:item.updatedAt="{ item: task }">
                                    {{ new Date(task.updatedAt).toLocaleString() }}
                                </template>
                            </v-data-table>
                        </v-card>
                    </td>
                </tr>
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'

const props = defineProps<{
    nodes: any[]
    loading: boolean
    onlyDisplayRunningTasks: boolean
    displayNodeLabels: boolean
}>()

const {t} = useI18n()
const expanded = ref<string[]>([])

const headers = computed(() => {
    const cols = [
        {title: t('cluster.visualizer.nodeHeaders.status'), key: 'state'},
        {title: t('cluster.visualizer.nodeHeaders.hostname'), key: 'hostname'},
        {title: t('cluster.visualizer.nodeHeaders.role'), key: 'role'},
        {title: t('cluster.visualizer.nodeHeaders.cpuMemory'), key: 'resources'}
    ]
    if (props.displayNodeLabels) {
        cols.push({title: t('cluster.visualizer.nodeHeaders.labels'), key: 'labels'})
    }
    return cols
})

const taskHeaders = computed(() => [
    {title: t('cluster.visualizer.taskHeaders.state'), key: 'state'},
    {title: t('cluster.visualizer.taskHeaders.updatedAt'), key: 'updatedAt'},
    {title: t('cluster.visualizer.taskHeaders.name'), key: 'image.name'},
    {title: t('cluster.visualizer.taskHeaders.image'), key: 'image.fullname'}
])

function filterTasks(tasks: any[]) {
    if (props.onlyDisplayRunningTasks) {
        return tasks.filter(task => task.state === 'running')
    }
    return tasks
}

function getNodeStatusColor(state: string) {
    switch (state) {
        case 'ready': return 'green-darken-3'
        case 'active': return 'blue-darken-3'
        case 'down': return 'red-darken-3'
        default: return 'grey-darken-3'
    }
}

function getTaskStateColor(state: string) {
    switch (state) {
        case 'running': return 'green-darken-3'
        case 'rejected':
        case 'shutdown':
        case 'failed': return 'red-darken-3'
        case 'starting': return 'teal-darken-3'
        case 'complete': return 'blue-darken-3'
        case 'restarting': return 'yellow-darken-3'
        case 'paused': return 'cyan-darken-3'
        case 'exited': return 'purple-darken-3'
        case 'dead': return 'black-darken-3'
        case 'created': return 'indigo-darken-3'
        default: return 'grey-darken-3'
    }
}
</script>
