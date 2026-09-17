<script setup lang="ts">
import {IdentityLogin} from '@drax/identity-vue'
import {computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useDisplay, useTheme} from 'vuetify'
import AnimatedBackground from '@/components/AnimatedBackground.vue'

const route = useRoute()
const router = useRouter()
const {mobile} = useDisplay()
const theme = useTheme()
const primaryColor = computed(() => theme.current.value.colors.primary)

function switchTheme(): void {
    theme.toggle(['light', 'dark'])
}

function onLoginSuccess(): void {
    const redirect = route.query.redirect
    const destination = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
        ? redirect
        : '/'
    void router.replace(destination)
}
</script>

<template>
    <div class="login-wrapper">
        <animated-background />
        <v-container class="fill-height position-relative z-1" fluid>
            <v-row align="center" justify="center">
                <v-col cols="12" lg="5" md="6" sm="8">
                    <div class="login-brand mb-6">
                        <v-icon class="login-brand__icon" color="primary" icon="mdi-docker" size="160"/>
                        <h2 class="login-brand__title text-center" :class="mobile ? 'text-h4' : 'text-h2'">
                            <span class="login-brand__main pa-3 font-weight-medium rounded">Container</span>
                            <span class="login-brand__secondary">Hub</span>
                        </h2>
                    </div>
                    <identity-login @login-success="onLoginSuccess"/>
                    <div class="d-flex justify-center mt-3">
                        <v-btn
                            :aria-label="$t('app.switchTheme')"
                            :icon="theme.global.name.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'"
                            variant="text"
                            @click="switchTheme"
                        />
                    </div>
                </v-col>
            </v-row>
        </v-container>
    </div>
</template>

<style scoped>
.login-wrapper {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: rgb(var(--v-theme-background));
}
.z-1 {
    z-index: 1;
}
.login-brand {
    align-items: center;
    display: flex;
    height: 192px;
    justify-content: center;
    position: relative;
}
.login-brand__icon {
    opacity: 0.38;
}
.login-brand__title {
    position: absolute;
    text-shadow: 1px 8px 8px rgb(0 0 0 / 72%);
}
.login-brand__main {
    background: rgb(var(--v-theme-surface) / 86%);
    color: v-bind(primaryColor);
}
.login-brand__secondary {
    color: rgb(var(--v-theme-on-background));
}
@media (max-height: 760px) {
    .login-brand {
        height: 128px;
        margin-bottom: 8px !important;
    }
    .login-brand__icon {
        font-size: 112px !important;
        height: 112px !important;
        width: 112px !important;
    }
}
</style>
