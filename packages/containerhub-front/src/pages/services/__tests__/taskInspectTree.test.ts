import assert from 'node:assert/strict'
import test from 'node:test'
import {taskInspectTree} from '../taskInspectTree'

test('inspect tree preserves types, empty values, multiline strings and stable distinct paths', () => {
    const inspection = {Status: {ExitCode: 0, Ready: false, Error: null}, Args: ['sh\n-c'], 'Status/ExitCode': '', Empty: {}, List: []}
    const tree = taskInspectTree(inspection)
    assert.deepEqual(tree[0], {id: '["Status"]', key: 'Status', title: 'Status', value: '', type: 'object', children: [
        {id: '["Status","ExitCode"]', key: 'ExitCode', title: 'ExitCode: 0', value: '0', type: 'number'},
        {id: '["Status","Ready"]', key: 'Ready', title: 'Ready: false', value: 'false', type: 'boolean'},
        {id: '["Status","Error"]', key: 'Error', title: 'Error: null', value: 'null', type: 'null'}
    ]})
    assert.equal(tree[1]?.value, '[1]')
    assert.equal(tree[1]?.children?.[0]?.value, 'sh\n-c')
    assert.equal(tree[2]?.value, '""')
    assert.equal(tree[3]?.value, '{}')
    assert.equal(tree[4]?.value, '[]')
    assert.equal(tree[3]?.children, undefined)
    assert.notEqual(tree[0]?.children?.[0]?.id, tree[2]?.id)
    assert.deepEqual(taskInspectTree(inspection), tree)
})
