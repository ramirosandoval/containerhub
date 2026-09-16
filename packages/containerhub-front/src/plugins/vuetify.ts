import {createVuetify} from 'vuetify'
import {es} from 'vuetify/locale'

export const vuetify = createVuetify({
    theme: {
        defaultTheme: 'dark'
    },
    locale: {
        locale: 'es',
        messages: {es},
    },
})