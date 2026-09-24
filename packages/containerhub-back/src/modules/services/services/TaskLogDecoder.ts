function toLogLines(logOutput: string): string[] {
    const lines = logOutput.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return lines
}

function hasDockerMultiplexedLogHeader(output: Buffer, offset: number): boolean {
    const streamType = output[offset]
    return (streamType === 1 || streamType === 2) && output[offset + 1] === 0 && output[offset + 2] === 0 && output[offset + 3] === 0
}

export function decodeDockerLogOutput(output: Buffer): string[] {
    if (!output.length || !hasDockerMultiplexedLogHeader(output, 0)) return toLogLines(output.toString('utf8'))

    const payloads: Buffer[] = []
    let offset = 0
    while (offset < output.length) {
        if (offset + 8 > output.length || !hasDockerMultiplexedLogHeader(output, offset)) return toLogLines(output.toString('utf8'))
        const payloadLength = output.readUInt32BE(offset + 4)
        const payloadStart = offset + 8
        const payloadEnd = payloadStart + payloadLength
        if (payloadEnd > output.length) return toLogLines(output.toString('utf8'))
        payloads.push(output.subarray(payloadStart, payloadEnd))
        offset = payloadEnd
    }

    return toLogLines(Buffer.concat(payloads).toString('utf8'))
}

export function createDockerLogLineDecoder(onLogLine: (logLine: string) => void) {
    let bufferedOutput = Buffer.alloc(0)
    let pendingLine = ''

    function emitText(text: string): void {
        const completeLines = `${pendingLine}${text}`.split(/\r?\n/)
        pendingLine = completeLines.pop() ?? ''
        for (const logLine of completeLines) if (logLine) onLogLine(logLine)
    }

    return {
        push(chunk: Buffer): void {
            bufferedOutput = Buffer.concat([bufferedOutput, chunk])
            while (bufferedOutput.length) {
                if (!hasDockerMultiplexedLogHeader(bufferedOutput, 0)) {
                    emitText(bufferedOutput.toString('utf8'))
                    bufferedOutput = Buffer.alloc(0)
                    return
                }
                if (bufferedOutput.length < 8) return
                const payloadLength = bufferedOutput.readUInt32BE(4)
                const payloadEnd = 8 + payloadLength
                if (bufferedOutput.length < payloadEnd) return
                emitText(bufferedOutput.subarray(8, payloadEnd).toString('utf8'))
                bufferedOutput = bufferedOutput.subarray(payloadEnd)
            }
        },
        end(): void {
            if (bufferedOutput.length) emitText(bufferedOutput.toString('utf8'))
            if (pendingLine) onLogLine(pendingLine)
            bufferedOutput = Buffer.alloc(0)
            pendingLine = ''
        }
    }
}
