import assert from 'node:assert/strict'
import test from 'node:test'
import {toServiceTask} from '../taskContract.js'

test('normalizes legacy Docker task payloads for task actions', () => {
    assert.deepEqual(toServiceTask({
        ID: 'task-1',
        NodeID: 'node-1',
        CreatedAt: '2026-09-02T10:00:00.000Z',
        UpdatedAt: '2026-09-02T10:01:00.000Z',
        Status: {State: 'running', ContainerStatus: {ContainerID: 'container-1'}}
    }), {
        id: 'task-1',
        nodeId: 'node-1',
        containerId: 'container-1',
        createdAt: '2026-09-02T10:00:00.000Z',
        updatedAt: '2026-09-02T10:01:00.000Z',
        state: 'running'
    })
})

test('preserves the normalized task contract', () => {
    assert.deepEqual(toServiceTask({id: 'task-1', state: 'running', containerId: 'container-1'}), {
        id: 'task-1', state: 'running', containerId: 'container-1'
    })
})

test('rejects task payloads without an identifier', () => {
    assert.equal(toServiceTask({Status: {State: 'running'}}), undefined)
})
