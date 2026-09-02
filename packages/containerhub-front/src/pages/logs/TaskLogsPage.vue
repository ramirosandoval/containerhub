<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('taskLogs.title') }}</v-card-title>
            <v-card-subtitle>{{ serviceName }} · {{ taskId }}</v-card-subtitle>
            <v-card-text>
                <v-row dense>
                    <v-col cols="12" md="3"><v-select v-model="since" :items="sinceOptions" :label="t('taskLogs.since')" @update:model-value="reconnect"/></v-col>
                    <v-col cols="12" md="3"><v-combobox v-model="include" chips clearable multiple :label="t('taskLogs.include')" @update:model-value="reconnect"/></v-col>
                    <v-col cols="12" md="3"><v-combobox v-model="exclude" chips clearable multiple :label="t('taskLogs.exclude')" @update:model-value="reconnect"/></v-col>
                    <v-col cols="12" md="1"><v-text-field v-model.number="tail" min="1" :max="2000" type="number" :label="t('taskLogs.lines')" @change="reconnect"/></v-col>
                    <v-col class="d-flex align-center" cols="12" md="2"><v-switch v-model="timestamps" :label="t('taskLogs.timestamps')" @update:model-value="reconnect"/><v-switch v-model="paused" :label="t('taskLogs.pause')" @update:model-value="togglePause"/></v-col>
                </v-row>
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

const MAX_TASK_LOG_LINES = 2_000
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
    if (paused.value) return
    const validTail = Math.min(MAX_TASK_LOG_LINES, Math.max(1, Math.trunc(Number(tail.value) || 1)))
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

onMounted(reconnect)
onBeforeUnmount(closeSocket)
</script>
