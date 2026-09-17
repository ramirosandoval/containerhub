import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const [navigation, router, serviceCrud, monitoringCrud, servicesPage, monitoringPage, automaticFilters, app, stacksPage, stacksCrud] = await Promise.all([
    readFile(new URL('../../navigation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cruds/ServiceCrud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cruds/MonitoringCrud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/services/ServicesPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/MonitoringPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../components/AutoCrudFilters.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/StacksPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../../cruds/StacksCrud.ts', import.meta.url), 'utf8')
])

test('hides Services and redirects access without DOCKER_VIEW', () => {
    assert.match(navigation, /text: 'app\.services',[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /name: 'services',[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /to\.meta\.permission && !authStore\.hasPermission\(to\.meta\.permission as string\)/)
    assert.match(router, /return \{name: 'home'\}/)
    assert.match(navigation, /name: 'nodes'[\s\S]*permission: 'DOCKER_NODES_FETCH'/)
    assert.match(navigation, /name: 'networks'[\s\S]*permission: 'DOCKER_NETWORK_VIEW'/)
    assert.match(router, /path: '\/registry-images'[\s\S]*permission: 'DOCKER_VIEW'/)
    assert.match(router, /path: '\/gitlab-projects'[\s\S]*permission: 'DOCKER_VIEW'/)
})

test('custom operational tables wire native Drax filters and selectable columns', () => {
    for (const crud of [serviceCrud, monitoringCrud]) {
        assert.match(crud, /isColumnSelectable[^\n]*true/)
        assert.match(crud, /dynamicFiltersEnable[^\n]*true/)
        assert.match(crud, /filtersEnable[^\n]*true/)
        assert.match(crud, /filterButtons[^\n]*false/)
    }
    for (const page of [servicesPage, monitoringPage]) {
        assert.match(page, /crud-filter-button/)
        assert.match(page, /crud-columns-button/)
        assert.match(page, /auto-crud-filters/)
        assert.doesNotMatch(page, /crud-filters-action/)
        assert.match(page, /useCrudColumns/)
        assert.match(page, /isDynamicFiltersEnable/)
        assert.match(page, /:headers="filteredHeaders"/)
        assert.match(page, /:header-props="\w+Crud\.instance\.headerProps"/)
        assert.match(page, /:striped="\w+Crud\.instance\.tableStriped"/)
    }
    assert.match(automaticFilters, /:auto-filter="true"/)
    assert.match(automaticFilters, /crud-filters-actions__clear-button/)
    assert.doesNotMatch(automaticFilters, /crud-filters-actions__apply-button/)
})

test('top-level application sections share one 16px content gutter', () => {
    assert.match(app, /--app-section-gutter: 16px/)
    assert.match(app, /\.v-main > \.v-container[\s\S]*width: 100%[\s\S]*max-width: 100% !important[\s\S]*margin: 0[\s\S]*padding: var\(--app-section-gutter\)/)
    assert.match(app, /\.v-main > \.v-container\.crud[\s\S]*margin-top: 0 !important/)
    assert.match(servicesPage, /<v-container fluid>/)
})

test('stacks link to the existing Services stack filter', () => {
    assert.match(stacksCrud, /key: 'actions'/)
    assert.match(stacksPage, /name: 'services', query: \{stack: stackName\(item\)\}/)
    assert.match(stacksPage, /stacks\.openServices/)
})
