import assert from 'node:assert/strict'
import test from 'node:test'
import {redactTaskInspect} from '../ServiceService.js'

test('task inspect redaction hides every environment and label value without mutating Docker data', () => {
    const inspect = {
        Spec: {ContainerSpec: {
            Env: ['MODE=production', 'PASSWORD=value-to-hide'],
            Labels: {team: 'platform', 'auth.users': 'hashed-value'},
            Authorization: 'bearer-value',
            AuthConfig: {username: 'operator'},
            Command: ['/bin/tool'],
            Args: ['--password', 'value-to-hide']
        }}
    }

    assert.deepEqual(redactTaskInspect(inspect), {
        Spec: {ContainerSpec: {
            Env: ['MODE=[REDACTED]', 'PASSWORD=[REDACTED]'],
            Labels: {team: '[REDACTED]', 'auth.users': '[REDACTED]'},
            Authorization: '[REDACTED]',
            AuthConfig: '[REDACTED]',
            Command: '[REDACTED]',
            Args: '[REDACTED]'
        }}
    })
    assert.equal(inspect.Spec.ContainerSpec.Labels.team, 'platform')
})
