<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>
                {{ t('networks.title') }}
                <v-spacer/>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" :aria-label="t('networks.refresh')" @click="fetchNetworks"/>
            </v-card-title>
            <v-card-text>
                <v-row dense>
                    <v-col cols="12" md="4"><v-text-field v-model="filters.name" :label="t('networks.name')" clearable/></v-col>
                    <v-col cols="12" md="4"><v-select v-model="filters.attachable" :items="attachableOptions" :label="t('networks.attachable')" clearable/></v-col>
                    <v-col cols="12" md="4"><v-select v-model="filters.driver" :items="drivers" :label="t('networks.driver')" clearable/></v-col>
                    <v-col cols="12" md="4"><v-text-field v-model="filters.since" type="date" :label="t('networks.createdFrom')" clearable/></v-col>
                    <v-col cols="12" md="4"><v-text-field v-model="filters.until" type="date" :label="t('networks.createdTo')" clearable/></v-col>
                    <v-col cols="12" md="4"><v-text-field v-model="filters.subnet" :label="t('networks.subnet')" clearable/></v-col>
                </v-row>
                <div class="d-flex justify-end ga-2">
                    <v-btn variant="text" @click="resetFilters">{{ t('networks.reset') }}</v-btn>
                    <v-btn color="primary" @click="applyFilters">{{ t('networks.apply') }}</v-btn>
                </div>
            </v-card-text>
            <v-divider/>
            <v-data-table :headers="headers" :items="filteredNetworks" :loading="loading" :items-per-page="25" :items-per-page-options="[5, 10, 25, 50, 100]">
                <template #item.Created="{value}">{{ formatCreated(value) }}</template>
                <template #item.Attachable="{value}"><v-icon :icon="value ? 'mdi-check' : 'mdi-minus'"/></template>
                <template #item.subnet="{item}">{{ item.IPAM?.Config?.[0]?.Subnet ?? '—' }}</template>
                <template #item.gateway="{item}">{{ item.IPAM?.Config?.[0]?.Gateway ?? '—' }}</template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {formatDateTime} from '@drax/common-front'
import {computed, onMounted, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'
import {filterNetworks, type Network, type NetworkFilters} from './networkFilters'

const {t} = useI18n()
const loading = ref(false)
const networks = ref<Network[]>([])
const filters = reactive<NetworkFilters>({})
const appliedFilters = ref<NetworkFilters>({})
const filteredNetworks = computed(() => filterNetworks(networks.value, appliedFilters.value))
const drivers = computed(() => [...new Set(networks.value.map((network) => network.Driver).filter((driver): driver is string => Boolean(driver)))].sort())
const attachableOptions = computed(() => [
    {title: t('networks.yes'), value: true},
    {title: t('networks.no'), value: false}
])
const headers = computed(() => [
    {title: t('networks.name'), key: 'Name'}, {title: t('networks.created'), key: 'Created'}, {title: t('networks.driver'), key: 'Driver'},
    {title: t('networks.attachable'), key: 'Attachable'}, {title: t('networks.ipamDriver'), key: 'IPAM.Driver'}, {title: t('networks.subnet'), key: 'subnet'}, {title: t('networks.gateway'), key: 'gateway'}
])
function formatCreated(value: unknown): string {
    return typeof value === 'string' ? formatDateTime(value) || '—' : '—'
}
function applyFilters() {
    appliedFilters.value = {...filters}
}
function resetFilters() {
    Object.assign(filters, {name: undefined, attachable: undefined, driver: undefined, since: undefined, until: undefined, subnet: undefined})
    applyFilters()
}
async function fetchNetworks() {
    loading.value = true
    try { networks.value = await restGet<Network[]>('/api/docker/network') } finally { loading.value = false }
}
onMounted(fetchNetworks)
</script>
