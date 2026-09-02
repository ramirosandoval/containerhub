import assert from 'node:assert/strict'
import test from 'node:test'
import {authorizationHeader} from '../restHeaders.js'

test('builds an authorization header only for an access token', () => {
    assert.deepEqual(authorizationHeader('jwt-value'), {Authorization: 'Bearer jwt-value'})
    assert.deepEqual(authorizationHeader(null), {})
})
