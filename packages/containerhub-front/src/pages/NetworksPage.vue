<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('networks.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="networks" :loading="loading">
                <template #item.Attachable="{value}"><v-icon :icon="value ? 'mdi-check' : 'mdi-minus'"/></template>
                <template #item.subnet="{item}">{{ item.IPAM?.Config?.[0]?.Subnet ?? '—' }}</template>
                <template #item.gateway="{item}">{{ item.IPAM?.Config?.[0]?.Gateway ?? '—' }}</template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type Network = {Name?: string; Created?: string; Driver?: string; Attachable?: boolean; IPAM?: {Driver?: string; Config?: Array<{Subnet?: string; Gateway?: string}>}}
const {t} = useI18n()
const loading = ref(false)
const networks = ref<Network[]>([])
const headers = computed(() => [
    {title: t('networks.name'), key: 'Name'}, {title: t('networks.created'), key: 'Created'}, {title: t('networks.driver'), key: 'Driver'},
    {title: t('networks.attachable'), key: 'Attachable'}, {title: t('networks.ipamDriver'), key: 'IPAM.Driver'}, {title: t('networks.subnet'), key: 'subnet'}, {title: t('networks.gateway'), key: 'gateway'}
])
onMounted(async () => {
    loading.value = true
    try { networks.value = await restGet<Network[]>('/api/docker/network') } finally { loading.value = false }
})
</script>
