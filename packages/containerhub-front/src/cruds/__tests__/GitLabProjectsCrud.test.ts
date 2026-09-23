import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('GitLab projects forward Drax search to the backend', async () => {
    const source = await readFile(new URL('../GitLabProjectsCrud.ts', import.meta.url), 'utf8')
    assert.match(source, /if \(options\.search\) params\.search = options\.search/)
    assert.match(source, /searchEnable[^\n]*true/)
})
