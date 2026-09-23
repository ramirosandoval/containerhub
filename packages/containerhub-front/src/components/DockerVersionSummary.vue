<template>
    <v-sheet class="docker-version mx-3 mb-3 pa-3" rounded="lg" color="surface" border aria-live="polite">
        <div class="d-flex align-center ga-2 mb-2 text-body-2 font-weight-medium">
            <v-icon icon="mdi-docker" size="small"/>
            {{ t('dockerVersion.title') }}
        </div>
        <v-progress-linear v-if="loading" indeterminate rounded/>
        <div v-else class="docker-version__values">
            <div>
                <div class="text-caption text-medium-emphasis">{{ t('dockerVersion.engine') }}</div>
                <div class="text-body-2 text-truncate" :title="version?.Version">{{ version?.Version ?? '—' }}</div>
            </div>
            <div>
                <div class="text-caption text-medium-emphasis">{{ t('dockerVersion.api') }}</div>
                <div class="text-body-2 text-truncate" :title="version?.ApiVersion">{{ version?.ApiVersion ?? '—' }}</div>
            </div>
        </div>
    </v-sheet>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type DockerVersion = {Version?: string; ApiVersion?: string}

const {t} = useI18n()
const loading = ref(true)
const version = ref<DockerVersion>()

onMounted(async () => {
    try {
        version.value = await restGet<DockerVersion>('/api/docker/version')
    } finally {
        loading.value = false
    }
})
</script>

<style scoped>
.docker-version__values {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
}
</style>
