<template>
    <v-app>
        <v-navigation-drawer v-model="drawer" temporary width="292">
            <template v-if="authStore.authUser">
                <identity-profile-view/>
                <v-divider></v-divider>
                <v-list density="compact" class="py-0">
                    <v-list-item
                        v-if="authStore.hasPermission('userApiKey:manage')"
                        @click="router.push({name: 'CrudUserApiKey'})"
                        prepend-icon="mdi-table-key"
                        :title="t('userapikey.menu')"
                    ></v-list-item>
                </v-list>
            </template>
            <v-list-item v-else class="py-3" prepend-icon="mdi-docker" title="ContainerHub"/>
            <sidebar-menu :menu="menu"/>

            <template #append>
                <v-divider/>
                <v-list density="comfortable">
                    <v-list-item :title="t('app.logout')" prepend-icon="mdi-logout" @click="logout"/>
                </v-list>
            </template>
        </v-navigation-drawer>

        <v-app-bar v-if="authStore.authUser" color="primary" elevation="1" position="fixed">
            <v-app-bar-nav-icon v-if="authStore.authUser" :aria-label="t('app.openMenu')" @click="drawer = !drawer"/>
            <v-app-bar-title style="cursor: pointer" @click="router.push({name: 'home'})">ContainerHub</v-app-bar-title>
            <v-spacer/>
            <v-btn
                :aria-label="t('app.switchTheme')"
                :icon="theme.global.name.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'"
                @click="theme.toggle(['light', 'dark'])"
            />
        </v-app-bar>


        <animated-background v-if="route.name && route.name !== 'home' && route.name !== 'Login'" :icon="currentIcon" />
        <v-main><router-view/></v-main>
    </v-app>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTheme} from 'vuetify'
import {SidebarMenu} from '@drax/common-vue'
import {IdentityProfileView, useAuth, useAuthStore} from '@drax/identity-vue'
import {menu, getIconForRouteName} from '@/navigation'
import {useRoute, useRouter} from 'vue-router'
import AnimatedBackground from '@/components/AnimatedBackground.vue'
import {computed} from 'vue'

const {t} = useI18n()
const authStore = useAuthStore()
const {logout} = useAuth()
const drawer = ref(false)
const theme = useTheme()
const router = useRouter()
const route = useRoute()

const currentIcon = computed(() => {
    return getIconForRouteName(route.name as string) || undefined
})
</script>

<style>
:root {
    --app-section-gutter: 16px;
}
.v-main > .v-container {
    width: 100%;
    max-width: 100% !important;
    margin: 0;
    padding: var(--app-section-gutter) !important;
}
.v-main > .v-container.crud {
    margin-top: 0 !important;
}
.v-main .v-card {
    background-color: rgba(var(--v-theme-surface), 0.85) !important;
    backdrop-filter: blur(8px);
}
</style>
