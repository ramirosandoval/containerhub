<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('taskTerminal.title') }}</v-card-title>
            <v-card-subtitle>{{ taskId }}</v-card-subtitle>
            <v-card-text>
                <v-alert v-if="error" type="error">{{ error }}</v-alert>
                <v-progress-linear v-else-if="connecting" indeterminate/>
                <div ref="terminalElement" class="task-terminal"/>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {consumeTerminalTicket} from '@/pages/services/terminalTickets'

const route = useRoute()
const {t} = useI18n()
const taskId = String(route.params.taskId)
const terminalElement = ref<HTMLElement | null>(null)
const connecting = ref(false)
const error = ref('')
const terminal = new Terminal({convertEol: true, cursorBlink: true, scrollback: 2_000})
const fitAddon = new FitAddon()
let socket: WebSocket | undefined
let resizeObserver: ResizeObserver | undefined
let disposeInput: (() => void) | undefined
let selectionAnchor: number | undefined
let selectionCursor: number | undefined

terminal.loadAddon(fitAddon)
terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    const key = event.key.toLowerCase()
    if (event.ctrlKey && event.altKey && !event.shiftKey && key === 'c') {
        const selection = terminal.getSelection()
        if (selection) void navigator.clipboard?.writeText(selection).catch(() => undefined)
        return false
    }
    if (event.ctrlKey && event.altKey && !event.shiftKey && key === 'v') {
        void navigator.clipboard?.readText().then((text) => {
            if (text) terminal.input(text)
        }).catch(() => undefined)
        return false
    }
    if (event.ctrlKey && event.shiftKey && !event.altKey) {
        const movement = key === 'b' ? -1 : key === 'f' ? 1 : key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0
        if (movement) {
            const buffer = terminal.buffer.active
            selectionAnchor ??= (buffer.baseY + buffer.cursorY) * terminal.cols + buffer.cursorX
            selectionCursor = Math.max(0, Math.min(buffer.length * terminal.cols - 1, (selectionCursor ?? selectionAnchor) + movement))
            const first = Math.min(selectionAnchor, selectionCursor)
            terminal.select(first % terminal.cols, Math.floor(first / terminal.cols), Math.abs(selectionCursor - selectionAnchor) + 1)
            return false
        }
    }
    return true
})

function terminalSocketUrl(): string {
    const httpBaseUrl = new URL((import.meta.env.VITE_BACK_URL as string | undefined) ?? window.location.origin, window.location.origin)
    httpBaseUrl.protocol = httpBaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    httpBaseUrl.pathname = `${httpBaseUrl.pathname.replace(/\/$/, '')}/api/docker/terminal`
    return httpBaseUrl.toString()
}

function sendResize(): void {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({type: 'resize', columns: terminal.cols, rows: terminal.rows}))
}

function closeTerminal(): void {
    disposeInput?.()
    resizeObserver?.disconnect()
    socket?.close()
    terminal.dispose()
}

function connect(): void {
    const ticket = consumeTerminalTicket(taskId)
    if (!ticket) {
        error.value = t('taskTerminal.unavailable')
        return
    }
    connecting.value = true
    const currentSocket = new WebSocket(terminalSocketUrl(), [`terminal.${ticket}`])
    currentSocket.binaryType = 'arraybuffer'
    socket = currentSocket
    currentSocket.addEventListener('open', () => {
        connecting.value = false
        terminal.open(terminalElement.value!)
        terminal.focus()
        fitAddon.fit()
        disposeInput = terminal.onData((input) => {
            selectionAnchor = undefined
            selectionCursor = undefined
            if (currentSocket.readyState === WebSocket.OPEN) currentSocket.send(new TextEncoder().encode(input))
        }).dispose
        resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
            sendResize()
        })
        resizeObserver.observe(terminalElement.value!)
        sendResize()
    })
    currentSocket.addEventListener('message', (event) => terminal.write(new Uint8Array(event.data as ArrayBuffer)))
    currentSocket.addEventListener('close', () => { if (socket === currentSocket) socket = undefined })
    currentSocket.addEventListener('error', () => {
        error.value = t('taskTerminal.disconnected')
        currentSocket.close()
    })
}

onMounted(connect)
onBeforeUnmount(closeTerminal)
</script>

<style scoped>
.task-terminal {background: #000; min-height: 70vh; padding: 8px}
</style>
