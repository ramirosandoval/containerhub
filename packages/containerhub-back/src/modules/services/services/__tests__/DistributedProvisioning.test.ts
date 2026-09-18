import assert from 'node:assert/strict'
import {link, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test, {mock} from 'node:test'

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
