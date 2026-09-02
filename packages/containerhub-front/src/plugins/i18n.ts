import type {App} from 'vue'
import {buildI18n} from '@/locales'

const i18n = buildI18n()

export function installI18n(app: App): void {
    app.use(i18n)
}
