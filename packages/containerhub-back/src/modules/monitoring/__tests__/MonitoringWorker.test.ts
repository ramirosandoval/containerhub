import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {runMonitoringWorker} from '../services/MonitoringWorker.js'

test('monitoring worker starts the collector and stops it after SIGTERM', async () => {
    const signals = new EventEmitter()
    const lifecycle: string[] = []
    const worker = runMonitoringWorker({
        start: () => lifecycle.push('start'),
        stop: () => { lifecycle.push('stop') }
    }, signals)

    assert.deepEqual(lifecycle, ['start'])
    signals.emit('SIGTERM')
    await worker
    assert.deepEqual(lifecycle, ['start', 'stop'])
})

test('monitoring worker waits for an active collector shutdown', async () => {
    const signals = new EventEmitter()
    let finishStop: (() => void) | undefined
    const worker = runMonitoringWorker({
        start: () => undefined,
        stop: () => new Promise<void>((resolve) => { finishStop = resolve })
    }, signals)

    signals.emit('SIGTERM')
    let finished = false
    void worker.then(() => { finished = true })
    await Promise.resolve()
    assert.equal(finished, false)

    finishStop?.()
    await worker
    assert.equal(finished, true)
})

test('monitoring entrypoint remains alive after collector startup', async (context) => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'containerhub-monitoring-worker-'))
    const backendDirectory = fileURLToPath(new URL('../../../../', import.meta.url))
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        DRAX_DB_ENGINE: 'sqlite',
        DRAX_SQLITE_FILE: join(dataDirectory, 'containerhub.sqlite'),
        DRAX_JWT_SECRET: 'test-only-jwt-secret',
        DRAX_APIKEY_SECRET: 'test-only-api-key-secret',
        CONTAINERHUB_BOOTSTRAP_ENABLED: 'false',
        TERMINAL_ALLOWED_ORIGIN: 'http://127.0.0.1:9998',
        NODE_ENV: 'test'
    }
    delete environment.NODE_TEST_CONTEXT
    const worker = spawn(process.execPath, ['--import', 'tsx', 'src/monitoring.ts'], {
        cwd: backendDirectory,
        env: environment,
        stdio: ['ignore', 'pipe', 'ignore']
    })
    context.after(async () => {
        worker.kill('SIGKILL')
        await rm(dataDirectory, {force: true, recursive: true})
    })

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('monitoring entrypoint did not start')), 5_000)
        worker.stdout?.on('data', (output: Buffer) => {
            if (!output.toString().includes('MonitoringSample')) return
            clearTimeout(timeout)
            resolve()
        })
        worker.once('exit', (code, signal) => {
            clearTimeout(timeout)
            reject(new Error(`monitoring entrypoint exited before startup: ${code ?? signal}`))
        })
    })
    assert.equal(worker.exitCode, null)
})
