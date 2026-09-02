import assert from 'node:assert/strict'
import test from 'node:test'
import {createDockerLogLineDecoder, decodeDockerLogOutput, parseTaskLogTail} from '../ServiceService.js'

function dockerLogFrame(streamType: 1 | 2, payload: string): Buffer {
    const payloadBuffer = Buffer.from(payload, 'utf8')
    const header = Buffer.alloc(8)
    header[0] = streamType
    header.writeUInt32BE(payloadBuffer.length, 4)
    return Buffer.concat([header, payloadBuffer])
}

test('decodes complete Docker multiplexed task logs without header bytes', () => {
    const output = Buffer.concat([
        dockerLogFrame(1, 'first line\n'),
        dockerLogFrame(2, 'second line\n')
    ])

    assert.deepEqual(decodeDockerLogOutput(output), ['first line', 'second line'])
})

test('keeps raw task logs when Docker does not multiplex them', () => {
    assert.deepEqual(decodeDockerLogOutput(Buffer.from('plain output\n', 'utf8')), ['plain output'])
})

test('decodes multiplexed log frames split across stream chunks', () => {
    const logLines: string[] = []
    const decoder = createDockerLogLineDecoder((logLine: string) => logLines.push(logLine))
    const frame = dockerLogFrame(1, 'first line\nsecond line\n')

    decoder.push(frame.subarray(0, 5))
    decoder.push(frame.subarray(5, 14))
    decoder.push(frame.subarray(14))
    decoder.end()

    assert.deepEqual(logLines, ['first line', 'second line'])
})

test('accepts bounded positive task log tails', () => {
    assert.equal(parseTaskLogTail('30'), 30)
    assert.throws(() => parseTaskLogTail('0'), /positive integer/)
    assert.throws(() => parseTaskLogTail('2001'), /at most 2000/)
})
