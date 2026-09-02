<script setup lang="ts">
import {IdentityLogin} from '@drax/identity-vue'
import {useRoute, useRouter} from 'vue-router'

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
    <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
            <v-col cols="12" lg="5" md="6" sm="8">
                <h2 class="pb-10 text-center">ContainerHub</h2>
                <identity-login @login-success="onLoginSuccess"/>
            </v-col>
        </v-row>
    </v-container>
</template>
