<template>
    <v-container class="pa-4">
        <v-card :loading="loading">
            <v-card-title>{{ t('dockerVersion.title') }}</v-card-title>
            <v-list v-if="version">
                <v-list-item :title="t('dockerVersion.engine')" :subtitle="version.Version ?? '—'"/>
                <v-list-item :title="t('dockerVersion.api')" :subtitle="version.ApiVersion ?? '—'"/>
            </v-list>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type DockerVersion = {Version?: string; ApiVersion?: string}

const {t} = useI18n()
const loading = ref(false)
const version = ref<DockerVersion>()

onMounted(async () => {
    loading.value = true
    try { version.value = await restGet<DockerVersion>('/api/docker/version') } finally { loading.value = false }
})
</script>
