<script setup lang="ts">
import {IdentityLogin} from '@drax/identity-vue'
import {useRoute, useRouter} from 'vue-router'
import AnimatedBackground from '@/components/AnimatedBackground.vue'

const route = useRoute()
const router = useRouter()

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
                    <h2 class="pb-10 text-center">ContainerHub</h2>
                    <identity-login @login-success="onLoginSuccess"/>
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
</style>
