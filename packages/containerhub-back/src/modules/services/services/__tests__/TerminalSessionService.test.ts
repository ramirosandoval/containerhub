import assert from 'node:assert/strict'
import test from 'node:test'
import {TerminalSessionRegistry} from '../TerminalSessionService.js'

test('consumes a terminal ticket once while preserving its owner binding', () => {
    let now = 1_000
    const registry = new TerminalSessionRegistry(() => now)
    const ticket = registry.create({userId: 'user-1', taskId: 'task-1', shell: 'sh'})

    assert.equal(ticket.length, 64)
    assert.deepEqual(registry.consume(ticket), {userId: 'user-1', taskId: 'task-1', shell: 'sh'})
    assert.equal(registry.consume(ticket), undefined)
})

test('rejects expired terminal tickets', () => {
    let now = 1_000
    const registry = new TerminalSessionRegistry(() => now)
    const ticket = registry.create({userId: 'user-1', taskId: 'task-1', shell: 'bash'})

    now += 60_001
    assert.equal(registry.consume(ticket), undefined)
})

test('only permits supported interactive shells', () => {
    const registry = new TerminalSessionRegistry(() => 1_000)

    assert.throws(() => registry.create({userId: 'user-1', taskId: 'task-1', shell: 'zsh'} as never), /shell/)
})
