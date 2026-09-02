<template>
    <v-app>
        <v-navigation-drawer v-model="drawer" temporary width="292">
            <identity-profile-view v-if="authStore.authUser"/>
            <v-list-item v-else class="py-3" prepend-icon="mdi-docker" title="ContainerHub"/>
            <sidebar-menu :menu="menu"/>

            <template #append>
                <v-divider/>
                <v-list density="comfortable">
                    <v-list-item :title="t('app.logout')" prepend-icon="mdi-logout" @click="logout"/>
                </v-list>
            </template>
        </v-navigation-drawer>

        <v-app-bar color="primary" elevation="1" position="fixed">
            <v-app-bar-nav-icon v-if="authStore.authUser" :aria-label="t('app.openMenu')" @click="drawer = !drawer"/>
            <v-app-bar-title>ContainerHub</v-app-bar-title>
            <v-spacer/>
            <v-btn
                :aria-label="t('app.switchTheme')"
                :icon="theme.global.name.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'"
                @click="theme.toggle(['light', 'dark'])"
            />
        </v-app-bar>

        <v-main><router-view/></v-main>
    </v-app>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTheme} from 'vuetify'
import {SidebarMenu} from '@drax/common-vue'
import {IdentityProfileView, useAuth, useAuthStore} from '@drax/identity-vue'
import {menu} from '@/navigation'

const {t} = useI18n()
const authStore = useAuthStore()
const {logout} = useAuth()
const drawer = ref(false)
const theme = useTheme()
</script>
