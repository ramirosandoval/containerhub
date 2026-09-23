<template>
    <v-card class="ma-3" variant="outlined">
        <v-progress-linear v-if="loading" indeterminate/>
        <v-card-text v-else-if="tasks?.length" class="position-relative">
            <v-btn :aria-label="t('services.tasks.refresh')" class="position-absolute" icon="mdi-refresh" location="top end" size="small" variant="text" @click="emit('reload')"/>
            <v-table density="compact">
                <thead><tr><th>{{ t('services.tasks.state') }}</th><th>{{ t('services.tasks.created') }}</th><th>{{ t('services.tasks.updated') }}</th><th>{{ t('services.tasks.node') }}</th><th>{{ t('services.tasks.task') }}</th><th class="text-center">{{ t('services.tasks.actions') }}</th></tr></thead>
                <tbody>
                    <tr v-for="task in tasks" :key="task.id">
                        <td><v-chip :color="taskStateColor(task.state)" label size="small" variant="outlined">{{ task.state ?? '—' }}</v-chip></td>
                        <td>{{ format(task.createdAt) }}</td>
                        <td>{{ format(task.updatedAt) }}</td>
                        <td>{{ nodeName(task.nodeId) }}</td>
                        <td>{{ task.id }}</td>
                        <td class="text-center">
                            <v-btn :aria-label="t('services.tasks.logs')" color="primary" icon="mdi-file-document-outline" size="small" variant="text" @click="emit('logs', task)"/>
                            <v-btn :aria-label="t('taskInspect.title')" color="primary" icon="mdi-information-outline" size="small" variant="text" @click="emit('inspect', task)"/>
                            <v-btn v-if="task.state === 'running' && task.containerId" :aria-label="t('taskStatistics.title')" color="primary" icon="mdi-chart-line" size="small" variant="text" @click="emit('statistics', task)"/>
                            <v-menu v-if="canOpenTerminal(task)">
                                <template #activator="{props}"><v-btn v-bind="props" :aria-label="t('services.tasks.terminal')" color="primary" icon="mdi-console" size="small" variant="text"/></template>
                                <v-list density="compact"><v-list-item :title="t('services.tasks.shell', {shell: 'sh'})" @click="emit('terminal', task, 'sh')"/><v-list-item :title="t('services.tasks.shell', {shell: 'bash'})" @click="emit('terminal', task, 'bash')"/></v-list>
                            </v-menu>
                        </td>
                    </tr>
                </tbody>
            </v-table>
        </v-card-text>
        <v-card-text v-else><v-alert density="compact" type="info">{{ t('services.tasks.empty') }}</v-alert></v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import {formatDateTime} from '@drax/common-front'
import {useI18n} from 'vue-i18n'
import type {ServiceTask} from './taskContract'

const {tasks, nodeNames, allowTerminal} = defineProps<{
    tasks?: ServiceTask[]
    loading: boolean
    nodeNames: Record<string, string>
    allowTerminal: boolean
}>()
const emit = defineEmits<{
    reload: []
    logs: [task: ServiceTask]
    inspect: [task: ServiceTask]
    statistics: [task: ServiceTask]
    terminal: [task: ServiceTask, shell: 'sh' | 'bash']
}>()
const {t} = useI18n()

function format(value: unknown): string {
    return typeof value === 'string' ? formatDateTime(value) : '—'
}

function nodeName(nodeId: string | undefined): string {
    return nodeId ? nodeNames[nodeId] ?? nodeId : '—'
}

function taskStateColor(state: string | undefined): string {
    return ({running: 'success', rejected: 'error', shutdown: 'error', failed: 'error', starting: 'teal', complete: 'primary', restarting: 'warning', paused: 'cyan', exited: 'purple', dead: 'black', created: 'indigo'} as Record<string, string>)[state ?? ''] ?? 'grey'
}

function canOpenTerminal(task: ServiceTask): boolean {
    return task.state === 'running' && Boolean(task.containerId) && allowTerminal
}
</script>
