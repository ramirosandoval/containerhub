import {createPinia} from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import type {App} from 'vue'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

export function installPinia(app: App): void {
    app.use(pinia)
}
