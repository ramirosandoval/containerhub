import assert from 'node:assert/strict'
import test from 'node:test'
import {promoteBearerApiKey} from '../AuthenticationHeaders.js'

const apiKey = '11111111-2222-4333-8444-555555555555'

test('promotes a Bearer API key without rewriting JWT credentials', () => {
    const apiKeyHeaders: Record<string, string> = {authorization: `Bearer ${apiKey}`}
    promoteBearerApiKey(apiKeyHeaders)
    assert.deepEqual(apiKeyHeaders, {'x-api-key': apiKey})

    const jwtHeaders: Record<string, string> = {authorization: 'Bearer header.payload.signature'}
    promoteBearerApiKey(jwtHeaders)
    assert.deepEqual(jwtHeaders, {authorization: 'Bearer header.payload.signature'})
})

test('does not overwrite an explicit API key header', () => {
    const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        'x-api-key': 'explicit-key'
    }
    promoteBearerApiKey(headers)
    assert.equal(headers['x-api-key'], 'explicit-key')
})
