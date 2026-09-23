import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('GitLab projects render actionable expandable rows', async () => {
    const [page, crud] = await Promise.all([
        readFile(new URL('../GitLabProjectsPage.vue', import.meta.url), 'utf8'),
        readFile(new URL('../../cruds/GitLabProjectsCrud.ts', import.meta.url), 'utf8'),
    ])
    assert.match(page, /v-data-table-server/)
    assert.match(page, /#expanded-row=/)
    assert.match(page, /#item\.name=/)
    assert.match(page, /project\(item\)\.name/)
    assert.match(page, /path_with_namespace/)
    assert.match(page, /container_registry_image_prefix/)
    assert.match(page, /projectServiceUsage/)
    assert.match(page, /selectedTags/)
    assert.match(page, /selectTag/)
    assert.match(page, /tag-pipeline/)
    assert.match(page, /selectedPipeline[\s\S]*\?\.jobs/)
    assert.match(page, /pipelineStatusColor/)
    assert.match(page, /gitLabProjects\.selectTag/)
    assert.match(page, /rel="noopener"/)
    assert.doesNotMatch(page, /v-for="tag in projectTags/)
    assert.doesNotMatch(page, /ContainerScan/)
    assert.doesNotMatch(page, /fetchContainerScan/)
    assert.doesNotMatch(page, /container-scan/)
    assert.doesNotMatch(page, /scanSeverities/)
    assert.doesNotMatch(page, /finding-list/)
    assert.match(crud, /title: 'project', key: 'name'/)
})
