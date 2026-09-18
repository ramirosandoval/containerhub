import assert from 'node:assert/strict'
import {link, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {buildAgentServer, readAgentServerConfig} from '../server.js'
import type Docker from 'dockerode'

test('agent stats validates the container identifier and reads its local daemon', async () => {
    const containerId = 'a'.repeat(64)
    let statsRequests = 0
    const docker = {
        ping: async () => 'OK', listContainers: async () => [],
        getContainer(requestedId: string) {
            assert.equal(requestedId, containerId)
            return {stats: async (options: unknown) => {
                statsRequests++
                assert.deepEqual(options, {stream: false})
                return {id: containerId, read: '2026-09-05T00:00:00Z', cpu_stats: {}, memory_stats: {}}
            }}
        }
    } as unknown as Docker
    const server = buildAgentServer({docker, nodeId: 'worker-1'})
    try {
        const response = await server.inject(`/containers/${containerId}/stats`)
        assert.equal(response.statusCode, 200)
        assert.equal(response.json().nodeId, 'worker-1')
        assert.equal(response.json().stats.id, containerId)
        assert.equal((await server.inject('/containers/not-an-id/stats')).statusCode, 400)
        assert.equal(statsRequests, 1)
    } finally { await server.close() }
})

test('agent health reports the Docker daemon assigned to this node', async () => {
    let pinged = false
    const server = buildAgentServer({
        docker: {ping: async () => { pinged = true; return 'OK' }, listContainers: async () => [], getContainer: () => { throw new Error('not used') }},
        nodeId: 'worker-1'
    })

    try {
        const response = await server.inject({method: 'GET', url: '/health'})

        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {ok: true, nodeId: 'worker-1'})
        assert.equal(pinged, true)
    } finally {
        await server.close()
    }
})

test('agent startup supports the deployed plaintext transport and rejects partial mTLS', () => {
    assert.deepEqual(readAgentServerConfig({
        CONTAINERHUB_AGENT_PORT: '9997',
        NODE_ID: 'worker-1'
    }), {
        port: 9997,
        nodeId: 'worker-1',
        dockerDataPath: '/var/lib/containerhub',
        hostVolumeRoots: ['/var/lib/containerhub']
    })
    assert.deepEqual(readAgentServerConfig({
        CONTAINERHUB_AGENT_PORT: '9997',
        NODE_ID: 'worker-1',
        CONTAINERHUB_HOST_VOLUME_ROOTS: '/storage,/logs,/storage'
    }).hostVolumeRoots, ['/storage', '/logs'])
    assert.throws(
        () => readAgentServerConfig({
            CONTAINERHUB_AGENT_PORT: '9997',
            NODE_ID: 'worker-1',
            CONTAINERHUB_HOST_VOLUME_ROOTS: 'storage'
        }),
        /CONTAINERHUB_HOST_VOLUME_ROOTS/
    )
    assert.throws(
        () => readAgentServerConfig({
            CONTAINERHUB_AGENT_PORT: '9997',
            NODE_ID: 'worker-1',
            CONTAINERHUB_AGENT_CA_FILE: '/ca.pem'
        }),
        /CONTAINERHUB_AGENT_SERVER_CERT_FILE/
    )
})

test('agent provisions docker-devops host paths only below configured host-volume roots', async () => {
    const hostVolumeRoot = await mkdtemp(join(tmpdir(), 'containerhub-agent-host-volume-'))
    const hostPath = join(hostVolumeRoot, 'multichannel', 'mc-web-vue3')
    const server = buildAgentServer({
        docker: {ping: async () => 'OK', listContainers: async () => [], getContainer: () => { throw new Error('not used') }},
        nodeId: 'worker-1',
        dockerDataPath: hostVolumeRoot,
        hostVolumeRoots: [hostVolumeRoot]
    })

    try {
        assert.equal((await server.inject({method: 'POST', url: '/folders', payload: [hostPath]})).statusCode, 200)
        assert.equal((await server.inject({
            method: 'POST', url: '/files',
            payload: [{
                hostPath,
                containerPath: '/usr/share/nginx/html',
                fileName: 'config.json',
                fileContent: '{"source":"docker-devops"}'
            }]
        })).statusCode, 200)
        assert.equal(await readFile(join(hostPath, 'config.json'), 'utf8'), '{"source":"docker-devops"}')
        await symlink(join(hostVolumeRoot, 'missing'), join(hostVolumeRoot, 'dangling-escape'))
        assert.notEqual((await server.inject({
            method: 'POST', url: '/files',
            payload: [{hostPath: join(hostVolumeRoot, 'dangling-escape'), fileName: 'outside.txt', fileContent: 'content'}]
        })).statusCode, 200)
        await writeFile(join(hostVolumeRoot, 'containerhub.sqlite'), 'database')
        await link(join(hostVolumeRoot, 'containerhub.sqlite'), join(hostPath, 'database-hardlink'))
        assert.notEqual((await server.inject({
            method: 'POST', url: '/files',
            payload: [{hostPath, fileName: 'database-hardlink', fileContent: 'overwritten'}]
        })).statusCode, 200)
        assert.equal(await readFile(join(hostVolumeRoot, 'containerhub.sqlite'), 'utf8'), 'database')
        assert.notEqual((await server.inject({method: 'POST', url: '/folders', payload: ['/etc/containerhub-test']})).statusCode, 200)
    } finally {
        await server.close()
        await rm(hostVolumeRoot, {recursive: true, force: true})
    }
})

test('agent lists only running containers from its own daemon', async () => {
    const runningContainers = [{
        Id: 'worker-container', Labels: {}, Names: ['/worker'], Image: 'alpine:3.20',
        ImageID: 'image-id', Command: 'sleep 300', Created: 1, Ports: [],
        State: 'running', Status: 'Up', HostConfig: {NetworkMode: 'default'},
        NetworkSettings: {Networks: {}}, Mounts: []
    }]
    const server = buildAgentServer({
        docker: {
            ping: async () => 'OK',
            getContainer: () => { throw new Error('not used') },
            listContainers: async (options: unknown) => {
                assert.deepEqual(options, {all: false})
                return runningContainers
            }
        },
        nodeId: 'worker-1'
    })
    try {
        const response = await server.inject({method: 'GET', url: '/containers/running'})
        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {nodeId: 'worker-1', containers: runningContainers})
    } finally {
        await server.close()
    }
})
