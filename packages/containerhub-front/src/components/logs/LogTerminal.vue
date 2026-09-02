<template>
    <div ref="terminalElement" class="log-terminal"/>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

const {scrollback} = defineProps<{scrollback: number}>()
const terminalElement = ref<HTMLElement | null>(null)
const terminal = new Terminal({convertEol: true, disableStdin: true, scrollback})
const fitAddon = new FitAddon()
const searchAddon = new SearchAddon()
let resizeObserver: ResizeObserver | undefined

terminal.loadAddon(fitAddon)
terminal.loadAddon(searchAddon)

onMounted(() => {
    if (!terminalElement.value) return
    terminal.open(terminalElement.value)
    fitAddon.fit()
    resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(terminalElement.value)
})

watch(() => scrollback, (value) => { terminal.options.scrollback = value })
onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    searchAddon.dispose()
    fitAddon.dispose()
    terminal.dispose()
})

defineExpose({
    clear: () => terminal.clear(),
    write: (logLine: string) => terminal.write(logLine)
})
</script>

<style scoped>
.log-terminal {background: #000; min-height: 60vh; padding: 8px}
</style>
