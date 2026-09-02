import {createApp} from 'vue'
import App from './App.vue'
import {installPinia} from '@/plugins/pinia'
import {installI18n} from '@/plugins/i18n'
import {vuetify} from '@/plugins/vuetify'
import {router} from '@/router'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

const app = createApp(App)
installPinia(app)
installI18n(app)
app.use(vuetify)
app.use(router)
app.mount('#app')
