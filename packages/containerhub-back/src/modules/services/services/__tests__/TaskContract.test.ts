import assert from 'node:assert/strict'
import test from 'node:test'
import {toServiceTaskModel} from '../ServiceService.js'

test('maps a Docker task to the terminal-safe selected task model', () => {
    assert.deepEqual(toServiceTaskModel({
        ID: 'task-1',
        ServiceID: 'service-1',
        NodeID: 'node-1',
        CreatedAt: '2026-09-02T10:00:00Z',
        UpdatedAt: '2026-09-02T10:01:00Z',
        Status: {State: 'running', Message: 'running', ContainerStatus: {ContainerID: 'container-1'}}
    }), {
        id: 'task-1',
        serviceId: 'service-1',
        nodeId: 'node-1',
        containerId: 'container-1',
        state: 'running',
        message: 'running',
        createdAt: '2026-09-02T10:00:00Z',
        updatedAt: '2026-09-02T10:01:00Z'
    })
})

test('keeps a task without a container visible but not terminal-capable', () => {
    const task = toServiceTaskModel({ID: 'task-pending', Status: {State: 'pending'}})

    assert.equal(task.id, 'task-pending')
    assert.equal(task.containerId, undefined)
})
