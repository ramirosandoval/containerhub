import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {constants} from 'node:fs'
import {link, mkdtemp, open, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test, {mock} from 'node:test'
import {createHostFile} from '../HostVolumeProvisioning.js'

let useLocalNode = false
class DockerStub {
    info() { return Promise.resolve({Swarm: {NodeID: 'manager'}}) }
    listNodes() {
        return Promise.resolve([useLocalNode
            ? {ID: 'manager', Description: {Hostname: 'manager'}, Status: {State: 'ready'}, Spec: {Role: 'manager', Availability: 'active'}}
            : {ID: 'worker-1', Description: {Hostname: 'worker', Engine: {EngineVersion: '27'}}, Status: {State: 'ready', Addr: '10.0.0.2'}, Spec: {Role: 'worker', Availability: 'active'}}
        ])
    }
}

const dockerMock = mock.module('dockerode', {defaultExport: DockerStub})
const agentMock = mock.module('../AgentHealthClient.js', {namedExports: {
    createAgentHealthClient: () => ({
        isHealthy: async () => true,
        createFolders: async () => { throw new Error('worker unavailable') },
        createFiles: async () => { throw new Error('worker unavailable') }
    })
}})
const {createFiles, createFolders} = await import('../ServiceService.js')

test.after(() => {
    dockerMock.restore()
    agentMock.restore()
})
test.beforeEach(() => { useLocalNode = false })

test('distributed provisioning does not report success when a worker fails', async () => {
    await assert.rejects(createFolders([{hostPath: 'data'}]), /worker unavailable/)
    await assert.rejects(createFiles([{hostPath: 'data', fileName: 'app.txt', fileContent: 'content'}]), /worker unavailable/)
})

test('local provisioning stays inside Docker data and cannot overwrite its SQLite database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'containerhub-data-'))
    const outside = await mkdtemp(join(tmpdir(), 'containerhub-outside-'))
    const previousRoot = process.env.DOCKER_DATA_PATH
    process.env.DOCKER_DATA_PATH = root
    useLocalNode = true
    try {
        await symlink(outside, join(root, 'escape'))
        await symlink(join(outside, 'missing'), join(root, 'dangling-escape'))
        await writeFile(join(root, 'containerhub.sqlite'), 'database')
        await symlink(join(root, 'containerhub.sqlite'), join(root, 'database-alias'))
        await link(join(root, 'containerhub.sqlite'), join(root, 'database-hardlink'))
        await assert.rejects(createFiles([{hostPath: 'escape', fileName: 'outside.txt', fileContent: 'content'}]), /Invalid host path/)
        await assert.rejects(createFiles([{hostPath: 'dangling-escape', fileName: 'outside.txt', fileContent: 'content'}]), /Invalid host path/)
        await assert.rejects(createFiles([{hostPath: '.', fileName: 'containerhub.sqlite', fileContent: 'content'}]), /database file/)
        await assert.rejects(createFiles([{hostPath: '.', fileName: 'database-alias', fileContent: 'content'}]), /database file/)
        await assert.rejects(createFiles([{hostPath: '.', fileName: 'database-hardlink', fileContent: 'content'}]), /database file/)
        assert.equal(await readFile(join(root, 'containerhub.sqlite'), 'utf8'), 'database')
    } finally {
        if (previousRoot === undefined) delete process.env.DOCKER_DATA_PATH
        else process.env.DOCKER_DATA_PATH = previousRoot
        await Promise.all([rm(root, {recursive: true, force: true}), rm(outside, {recursive: true, force: true})])
    }
})

test('legacy docker-devops host paths are provisioned at their configured host-volume root', async () => {
    const dockerDataRoot = await mkdtemp(join(tmpdir(), 'containerhub-data-'))
    const hostVolumeRoot = await mkdtemp(join(tmpdir(), 'containerhub-host-volume-'))
    const previousDockerDataRoot = process.env.DOCKER_DATA_PATH
    const previousHostVolumeRoots = process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
    const hostPath = join(hostVolumeRoot, 'multichannel', 'mc-web-vue3')
    process.env.DOCKER_DATA_PATH = dockerDataRoot
    process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = hostVolumeRoot
    useLocalNode = true
    try {
        await createFolders([hostPath])
        await createFiles([{
            hostPath,
            containerPath: '/usr/share/nginx/html',
            fileName: 'config.json',
            fileContent: '{"source":"docker-devops"}'
        }])

        assert.equal(await readFile(join(hostPath, 'config.json'), 'utf8'), '{"source":"docker-devops"}')
    } finally {
        if (previousDockerDataRoot === undefined) delete process.env.DOCKER_DATA_PATH
        else process.env.DOCKER_DATA_PATH = previousDockerDataRoot
        if (previousHostVolumeRoots === undefined) delete process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
        else process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = previousHostVolumeRoots
        await Promise.all([
            rm(dockerDataRoot, {recursive: true, force: true}),
            rm(hostVolumeRoot, {recursive: true, force: true})
        ])
    }
})

test('local provisioning rejects an existing FIFO without waiting for a reader', async () => {
    const root = await mkdtemp(join(tmpdir(), 'containerhub-local-fifo-'))
    const fifo = join(root, 'blocked.fifo')
    execFileSync('mkfifo', [fifo])
    const previousDockerDataPath = process.env.DOCKER_DATA_PATH
    const previousHostVolumeRoots = process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
    process.env.DOCKER_DATA_PATH = root
    process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = root
    const pending = createHostFile(root, 'blocked.fifo', 'content')
    let timer: NodeJS.Timeout | undefined
    try {
        const response = await Promise.race([pending.then(() => true), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_000) })])
        assert.notEqual(response, null, 'FIFO request must not wait for a reader')
        assert.fail('writing to a FIFO must be rejected')
    } catch (error) {
        if (error instanceof assert.AssertionError) throw error
        assert.match(String(error), /ENXIO|regular file/)
    } finally {
        if (timer) clearTimeout(timer)
        const reader = await open(fifo, constants.O_RDONLY | constants.O_NONBLOCK)
        try {
            await pending.catch(() => undefined)
            await assert.rejects(createHostFile(root, 'blocked.fifo', 'content'), /regular file/)
        } finally {
            await reader.close()
            if (previousDockerDataPath === undefined) delete process.env.DOCKER_DATA_PATH
            else process.env.DOCKER_DATA_PATH = previousDockerDataPath
            if (previousHostVolumeRoots === undefined) delete process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
            else process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = previousHostVolumeRoots
            await rm(root, {recursive: true, force: true})
        }
    }
})

test('local provisioning creates nested folders and replaces an existing file', async () => {
    const hostRoot = await mkdtemp(join(tmpdir(), 'containerhub-local-provisioning-'))
    const previousDockerDataPath = process.env.DOCKER_DATA_PATH
    const previousHostVolumeRoots = process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
    process.env.DOCKER_DATA_PATH = hostRoot
    process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = hostRoot
    useLocalNode = true
    try {
        await createFolders(['nested/config'])
        await writeFile(join(hostRoot, 'nested', 'config', 'app.txt'), 'previous content')
        assert.deepEqual(await createFiles([{
            hostPath: 'nested/config', fileName: 'app.txt', fileContent: 'new content'
        }]), {message: 'File successfully created!'})
        assert.equal(await readFile(join(hostRoot, 'nested', 'config', 'app.txt'), 'utf8'), 'new content')
    } finally {
        if (previousDockerDataPath === undefined) delete process.env.DOCKER_DATA_PATH
        else process.env.DOCKER_DATA_PATH = previousDockerDataPath
        if (previousHostVolumeRoots === undefined) delete process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
        else process.env.CONTAINERHUB_HOST_VOLUME_ROOTS = previousHostVolumeRoots
        await rm(hostRoot, {recursive: true, force: true})
    }
})
