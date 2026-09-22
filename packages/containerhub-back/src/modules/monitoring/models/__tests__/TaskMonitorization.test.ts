import assert from 'node:assert/strict'
import test from 'node:test'
import {TaskMonitorizationModel} from '../TaskMonitorization.js'

test('task lifecycle model supports repository pagination', () => {
    assert.equal(typeof (TaskMonitorizationModel as any).paginate, 'function')
})
