import assert from 'node:assert/strict'
import test from 'node:test'
import {openTaskTerminal} from '../ServiceService.js'

const taskId = process.env.DOCKER_TERMINAL_TASK_ID

test('executes the terminal proof inside the configured running task', {skip: process.env.DOCKER_TERMINAL_E2E !== '1' || !taskId}, async () => {
    const terminalStream = await openTaskTerminal(taskId!, 'sh')
    let output = ''
    terminalStream.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    terminalStream.write('printf containerhub-terminal-proof\nexit\n')
    await new Promise<void>((resolve, reject) => {
        terminalStream.once('end', resolve)
        terminalStream.once('error', reject)
    })

    assert.match(output, /containerhub-terminal-proof/)
})
