import assert from 'node:assert/strict'
import test from 'node:test'

test('development proxies API and GraphQL to the ContainerHub backend by default', async () => {
    const configuredTarget = process.env.VITE_BACKEND_PROXY
    delete process.env.VITE_BACKEND_PROXY
    try {
        const {default: viteConfig} = await import(`../../vite.config.js?default=${Date.now()}`)
        const proxy = viteConfig.server?.proxy as Record<string, {target?: string}>
        assert.equal(proxy['/api']?.target, 'http://localhost:9998')
        assert.equal(proxy['/graphql']?.target, 'http://localhost:9998')
    } finally {
        if (configuredTarget === undefined) delete process.env.VITE_BACKEND_PROXY
        else process.env.VITE_BACKEND_PROXY = configuredTarget
    }
})
