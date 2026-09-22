import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const [router, navigation, setupEntities, locales, homePage] = await Promise.all([
    readFile(new URL('../index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../navigation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../setup/SetupEntities.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../locales/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../pages/HomePage.vue', import.meta.url), 'utf8')
])

test('reuses the native Drax audit module in the protected Administration gallery', () => {
    assert.match(router, /import AuditCrudPage from '@drax\/audit-vue\/src\/pages\/crud\/AuditCrudPage\.vue'/)
    assert.match(router, /path: '\/crud\/audit',[\s\S]*name: 'AuditCrudPage',[\s\S]*component: AuditCrudPage,[\s\S]*requiresAuth: true,[\s\S]*permission: 'audit:manage'/)
    assert.match(navigation, /text: 'audit\.menu',[\s\S]*name: 'AuditCrudPage'[\s\S]*permission: 'audit:manage'/)
    assert.match(setupEntities, /import AuditCrud from '@drax\/audit-vue\/src\/cruds\/AuditCrud'/)
    assert.match(setupEntities, /AuditCrud\.instance/)
    assert.match(locales, /AuditI18nMessages/)
    assert.match(locales, /\.\.\.audit\.es/)
    assert.match(locales, /\.\.\.audit\.en/)
    assert.match(homePage, /<home-gallery :menu="menu\.filter/)
})
