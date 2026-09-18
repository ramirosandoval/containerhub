import {createApp} from 'vue'
import App from './App.vue'
import {installPinia} from '@/plugins/pinia'
import {useAuthStore} from '@drax/identity-vue'
import {HttpGqlClientFactory, HttpRestClientFactory} from '@drax/common-front'
import {installI18n} from '@/plugins/i18n'
import {vuetify} from '@/plugins/vuetify'
import {router} from '@/router'
import {setupEntities} from '@/setup/SetupEntities'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

const app = createApp(App)
installPinia(app)
setupEntities()

const authStore = useAuthStore()
if (authStore.accessToken) {
    HttpGqlClientFactory.getInstance(import.meta.env.VITE_BACK_URL ? `${import.meta.env.VITE_BACK_URL}/graphql` : '/graphql').addHeader('Authorization', `Bearer ${authStore.accessToken}`)
    HttpRestClientFactory.getInstance(import.meta.env.VITE_BACK_URL ? import.meta.env.VITE_BACK_URL : '').addHeader('Authorization', `Bearer ${authStore.accessToken}`)
}

installI18n(app)
app.use(vuetify)
app.use(router)
app.mount('#app')
