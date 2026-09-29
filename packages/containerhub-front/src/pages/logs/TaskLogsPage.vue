<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('taskLogs.title') }}</v-card-title>
            <v-card-subtitle>{{ serviceName }} · {{ taskId }}</v-card-subtitle>
            <v-card-text>
                <div role="group" :aria-label="t('taskLogs.filters')" class="logs-controls mb-4">
                    <div class="logs-primary-filters">
                        <v-select v-model="since" density="compact" hide-details="auto" :items="sinceOptions" :label="t('taskLogs.since')" @update:model-value="reconnect"/>
                        <v-combobox v-model="include" chips clearable multiple density="compact" hide-details="auto" :label="t('taskLogs.include')" @update:model-value="reconnect"/>
                        <v-combobox v-model="exclude" chips clearable multiple density="compact" hide-details="auto" :label="t('taskLogs.exclude')" @update:model-value="reconnect"/>
                    </div>
                    <v-text-field v-model.number="tail" class="logs-tail" density="compact" hide-details="auto" min="1" :max="maxLogsLines" type="number" :label="t('taskLogs.lines')" @change="reconnect"/>
                    <div role="group" :aria-label="t('taskLogs.viewerActions')" class="logs-actions d-flex align-center ga-4">
                        <v-switch v-model="timestamps" color="primary" density="compact" hide-details :label="t('taskLogs.timestamps')" @update:model-value="reconnect"/>
                        <v-switch v-model="paused" color="primary" density="compact" hide-details :label="t('taskLogs.pause')" @update:model-value="togglePause"/>
                    </div>
                </div>
                <v-alert v-if="configurationError" type="error">{{ t('taskLogs.configurationUnavailable') }}</v-alert>
                <v-progress-linear v-if="connecting" indeterminate/>
                <log-terminal ref="logTerminal" :scrollback="tail"/>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useAuthStore} from '@drax/identity-vue'
import LogTerminal from '@/components/logs/LogTerminal.vue'
import {restGet} from '@/rest'

const route = useRoute()
const {t} = useI18n()
const authStore = useAuthStore()
const logTerminal = ref<InstanceType<typeof LogTerminal> | null>(null)
const tail = ref(1_000)
const since = ref(0)
const timestamps = ref(false)
const include = ref<string[]>([])
const exclude = ref<string[]>([])
const paused = ref(false)
const connecting = ref(false)
const maxLogsLines = ref(10000)
const configurationError = ref(false)
const configurationReady = ref(false)
let socket: WebSocket | undefined

const taskId = computed(() => String(route.params.taskId))
const serviceName = computed(() => typeof route.query.service === 'string' ? route.query.service : t('taskLogs.unknownService'))
const sinceOptions = computed(() => [
    {title: t('taskLogs.all'), value: 0},
    {title: t('taskLogs.day'), value: unixSecondsAgo(1_440)},
    {title: t('taskLogs.hours'), value: unixSecondsAgo(240)},
    {title: t('taskLogs.hour'), value: unixSecondsAgo(60)},
    {title: t('taskLogs.minutes'), value: unixSecondsAgo(30)}
])

function unixSecondsAgo(minutes: number): number {
    return Math.floor(Date.now() / 1_000) - minutes * 60
}

function logSocketUrl(): string {
    const httpBaseUrl = new URL((import.meta.env.VITE_BACK_URL as string | undefined) ?? window.location.origin, window.location.origin)
    httpBaseUrl.protocol = httpBaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    httpBaseUrl.pathname = `${httpBaseUrl.pathname.replace(/\/$/, '')}/api/docker/task/${taskId.value}/logs/stream`
    return httpBaseUrl.toString()
}

function closeSocket(): void {
    socket?.close()
    socket = undefined
}

function reconnect(): void {
    if (paused.value || !configurationReady.value) return
    const validTail = Math.min(maxLogsLines.value, Math.max(1, Math.trunc(Number(tail.value) || 1)))
    tail.value = validTail
    closeSocket()
    logTerminal.value?.clear()
    const accessToken = authStore.accessToken
    if (!accessToken) return
    connecting.value = true
    const currentSocket = new WebSocket(logSocketUrl(), [`bearer.${accessToken}`])
    socket = currentSocket
    currentSocket.addEventListener('open', () => {
        connecting.value = false
        currentSocket.send(JSON.stringify({tail: validTail, since: since.value, timestamps: timestamps.value, include: include.value, exclude: exclude.value}))
    })
    currentSocket.addEventListener('message', (event) => logTerminal.value?.write(String(event.data)))
    currentSocket.addEventListener('close', () => {
        if (socket === currentSocket) {
            connecting.value = false
            socket = undefined
        }
    })
    currentSocket.addEventListener('error', () => currentSocket.close())
}

function togglePause(): void {
    if (paused.value) closeSocket()
    else reconnect()
}

onMounted(async () => {
    try {
        const configuration = await restGet<{maxLogsLines: number}>('/api/docker/logs/config')
        if (!Number.isInteger(configuration.maxLogsLines) || configuration.maxLogsLines < 1) throw new Error('Invalid log limit')
        maxLogsLines.value = configuration.maxLogsLines
        tail.value = Math.min(tail.value, maxLogsLines.value)
        configurationError.value = false
        configurationReady.value = true
        reconnect()
    } catch {
        configurationError.value = true
    }
})
onBeforeUnmount(closeSocket)
</script>

<style scoped>
.logs-controls {
    display: grid;
    grid-template-columns: minmax(170px, 1fr) auto;
    gap: 16px 12px;
    align-items: end;
}

.logs-primary-filters {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 3fr 4fr 5fr;
    gap: 12px;
}

.logs-tail {
    max-width: 170px;
}

.logs-actions {
    justify-self: end;
}

@media (max-width: 800px) {
    .logs-primary-filters {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 500px) {
    .logs-controls {
        grid-template-columns: 1fr;
    }

    .logs-primary-filters {
        grid-template-columns: 1fr;
    }

    .logs-actions {
        justify-self: start;
    }
}
</style>
