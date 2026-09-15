import assert from 'node:assert/strict'
import test, {mock} from 'node:test'
import {PassThrough} from 'node:stream'

let taskNodeId = 'worker-1'
let taskState = 'running'
let localExecs = 0
let remoteTargets: unknown[][] = []
const stream = new PassThrough()
const dockerMock = mock.module('dockerode', {defaultExport: class {
    getTask(taskId: string) {
        assert.equal(taskId, 'requested-task')
        return {inspect: async () => ({ID: 'canonical-task', NodeID: taskNodeId, Status: {State: taskState, ContainerStatus: {ContainerID: 'server-container'}}})}
    }
    info() { return Promise.resolve({Swarm: {NodeID: 'manager-1'}}) }
    getContainer(containerId: string) {
        assert.equal(containerId, 'server-container')
        localExecs++
        return {exec: async () => ({start: async () => stream, resize: async () => {}})}
    }
}})
const agentMock = mock.module('../AgentTerminalClient.js', {namedExports: {
    connectTaskAgentTerminal: async (...target: unknown[]) => {
        remoteTargets.push(target)
        return {stream, resize: async () => {}, close: () => stream.destroy()}
    }
}})
const {openTaskTerminalConnection} = await import('../ServiceService.js')
test.after(() => { dockerMock.restore(); agentMock.restore(); stream.destroy() })

test('task terminal routes remote tasks by node and container; keeps local exec and rejects stopped tasks/shells', async () => {
    await openTaskTerminalConnection('requested-task', 'sh')
    assert.deepEqual(remoteTargets, [['worker-1', 'server-container', 'canonical-task', 'sh']])
    assert.equal(localExecs, 0)
    taskNodeId = 'manager-1'
    await openTaskTerminalConnection('requested-task', 'bash')
    assert.equal(localExecs, 1)
    assert.equal(remoteTargets.length, 1)
    taskState = 'shutdown'
    await assert.rejects(openTaskTerminalConnection('requested-task', 'sh'), /no running container/)
    await assert.rejects(openTaskTerminalConnection('requested-task', 'zsh' as 'sh'), /invalid terminal shell/)
    assert.equal(localExecs, 1)
})
