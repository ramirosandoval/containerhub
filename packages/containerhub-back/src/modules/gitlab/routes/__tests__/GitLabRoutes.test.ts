import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('exposes the selected tag pipeline through the protected project route', async () => {
    const routes = await readFile(new URL('../GitLabRoutes.ts', import.meta.url), 'utf8')
    assert.match(routes, /fetchTagPipeline/)
    assert.match(routes, /\/api\/gitlab\/project\/:id\/tag-pipeline/)
    assert.match(routes, /request\.query\.tag/)
    assert.match(routes, /required: \['tag'\]/)
    assert.equal(routes.includes("pattern: '.*\\\\S.*'"), true)
    assert.match(routes, /protectedRoute/)
    assert.doesNotMatch(routes, /container-scan/)
    assert.doesNotMatch(routes, /fetchContainerScanFindings/)
})