import assert from 'node:assert/strict'
import test from 'node:test'
import {AgentHealthClient, readAgentClientConfig} from '../AgentHealthClient.js'

const agentConfig = {host: 'containerhub-agent', port: 9997, secure: true, serverName: 'containerhub-agent', ca: 'ca', cert: 'cert', key: 'key'}
const resolveAgentAddress = async () => ['10.0.0.8']

test('agent client resolves the requested node through Swarm DNSRR before using it', async () => {
    const requestedAddresses: string[] = []
    const runningContainer = {Id: 'worker-container', Created: 1, Image: 'alpine:3.20', Status: 'Up', State: 'running', Labels: {}}
    const client = new AgentHealthClient(
        agentConfig,
        async (address, requestPath) => {
            requestedAddresses.push(`${address}${requestPath}`)
            if (requestPath === '/health') return {statusCode: 200, body: {ok: true, nodeId: address === '10.0.0.8' ? 'worker-1' : 'worker-2'}}
            return {statusCode: 200, body: {nodeId: 'worker-1', containers: [runningContainer]}}
        },
        async () => ['10.0.0.7', '10.0.0.8']
    )

    assert.deepEqual(await client.fetchRunningContainers('worker-1'), [runningContainer])
    assert.deepEqual(requestedAddresses.sort(), [
        '10.0.0.7/health',
        '10.0.0.8/containers/running',
        '10.0.0.8/health'
    ])
})

test('agent stats client rejects mismatched nodes, containers, malformed stats and HTTP errors', async () => {
    const containerId = 'a'.repeat(64)
    const stats = {id: containerId, read: '2026-09-05T00:00:00Z', cpu_stats: {}, memory_stats: {}}
    let responseBody: unknown = {nodeId: 'worker-1', stats}
    let statusCode = 200
    const client = new AgentHealthClient(
        agentConfig,
        async (address, requestPath, timeoutMs) => {
            assert.equal(address, '10.0.0.8')
            if (requestPath === '/health') return {statusCode: 200, body: {ok: true, nodeId: 'worker-1'}}
            assert.equal(requestPath, `/containers/${containerId}/stats`)
            assert.equal(timeoutMs, 10_000)
            return {statusCode, body: responseBody}
        },
        resolveAgentAddress
    )
    assert.deepEqual(await client.fetchContainerStats('worker-1', containerId), stats)
    responseBody = {nodeId: 'worker-2', stats}
    await assert.rejects(client.fetchContainerStats('worker-1', containerId), /Invalid agent stats/)
    responseBody = {nodeId: 'worker-1', stats: {...stats, id: 'b'.repeat(64)}}
    await assert.rejects(client.fetchContainerStats('worker-1', containerId), /Invalid agent stats/)
    responseBody = {nodeId: 'worker-1', stats: {id: containerId}}
    await assert.rejects(client.fetchContainerStats('worker-1', containerId), /Invalid agent stats/)
    responseBody = {nodeId: 'worker-1', stats}
    statusCode = 503
    await assert.rejects(client.fetchContainerStats('worker-1', containerId), /Invalid agent stats/)
})

test('agent client reports a healthy node through its configured mTLS request', async () => {
    let requestedNodeAddress = ''
    const client = new AgentHealthClient(
        agentConfig,
        async (nodeAddress: string) => {
            requestedNodeAddress = nodeAddress
            return {statusCode: 200, body: {ok: true, nodeId: 'worker-1'}}
        },
        resolveAgentAddress
    )

    assert.equal(await client.isHealthy('worker-1'), true)
    assert.equal(requestedNodeAddress, '10.0.0.8')
})

test('agent client rejects a response belonging to another node', async () => {
    const client = new AgentHealthClient(
        agentConfig,
        async () => ({statusCode: 200, body: {ok: true, nodeId: 'worker-2'}}),
        resolveAgentAddress
    )

    assert.equal(await client.isHealthy('worker-1'), false)
})

test('agent client defaults to the deployed plaintext transport and rejects partial mTLS', () => {
    assert.deepEqual(readAgentClientConfig({
        CONTAINERHUB_AGENT_HOST: 'containerhub-agent',
        CONTAINERHUB_AGENT_PORT: '9997'
    }), {
        host: 'containerhub-agent',
        port: 9997,
        secure: false
    })
    assert.throws(
        () => readAgentClientConfig({CONTAINERHUB_AGENT_CA_FILE: '/ca.pem'}),
        /CONTAINERHUB_AGENT_CLIENT_CERT_FILE/
    )
})

test('agent container request validates the node and running-container payload', async () => {
    const runningContainer = {Id: 'orphan-worker', Created: 1, Image: 'alpine:3.20', Status: 'Up', State: 'running', Labels: {}}
    let responseBody: unknown = {nodeId: 'worker-1', containers: [runningContainer]}
    let statusCode = 200
    const client = new AgentHealthClient(
        agentConfig,
        async (nodeAddress: string, requestPath: string) => {
            assert.equal(nodeAddress, '10.0.0.8')
            if (requestPath === '/health') return {statusCode: 200, body: {ok: true, nodeId: 'worker-1'}}
            assert.equal(requestPath, '/containers/running')
            return {statusCode, body: responseBody}
        },
        resolveAgentAddress
    )
    assert.deepEqual(await client.fetchRunningContainers('worker-1'), [runningContainer])
    responseBody = {nodeId: 'another-worker', containers: [runningContainer]}
    await assert.rejects(client.fetchRunningContainers('worker-1'), /Invalid agent container response/)
    responseBody = {nodeId: 'worker-1', containers: [{Id: 42}]}
    await assert.rejects(client.fetchRunningContainers('worker-1'), /Invalid agent container response/)
    responseBody = {nodeId: 'worker-1', containers: [runningContainer]}
    statusCode = 503
    await assert.rejects(client.fetchRunningContainers('worker-1'), /Invalid agent container response/)
})
