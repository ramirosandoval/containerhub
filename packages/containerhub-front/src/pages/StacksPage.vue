<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('stacks.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="stacks" :loading="loading">
                <template #item.services="{item}">
                    <v-btn :to="{name: 'services', query: {stack: item.name}}" icon="mdi-format-list-bulleted" size="small" :aria-label="t('stacks.openServices', {stack: item.name})" variant="text"/>
                </template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type ServiceStack = {stack: string | null}
type StackSummary = {name: string; services: number}

const {t} = useI18n()
const loading = ref(false)
const services = ref<ServiceStack[]>([])
const headers = computed(() => [
    {title: t('stacks.name'), key: 'name'},
    {title: t('stacks.services'), key: 'services'},
    {title: t('stacks.open'), key: 'services', sortable: false}
])
const stacks = computed<StackSummary[]>(() => {
    const serviceCounts = new Map<string, number>()
    for (const service of services.value) {
        if (service.stack) serviceCounts.set(service.stack, (serviceCounts.get(service.stack) ?? 0) + 1)
    }
    return [...serviceCounts].map(([name, serviceCount]) => ({name, services: serviceCount}))
        .sort((leftStack, rightStack) => leftStack.name.localeCompare(rightStack.name))
})

onMounted(async () => {
    loading.value = true
    try {
        services.value = await restGet<ServiceStack[]>('/api/services')
    } finally {
        loading.value = false
    }
})
</script>
