<template>
    <v-container fluid class="pa-4">
        <v-card>
            <v-card-title>{{ t('nodes.title') }}</v-card-title>
            <v-data-table :headers="headers" :items="nodes" :loading="loading">
                <template #item.leader="{value}"><v-icon :color="value ? 'success' : undefined" :icon="value ? 'mdi-check-circle' : 'mdi-minus-circle-outline'"/></template>
            </v-data-table>
        </v-card>
    </v-container>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'

type Node = {id?: string; hostname?: string; ip?: string; role?: string; availability?: string; state?: string; engine?: string; leader: boolean; reachability: string | null}
const {t} = useI18n()
const loading = ref(false)
const nodes = ref<Node[]>([])
const headers = computed(() => [
    {title: t('nodes.id'), key: 'id'}, {title: t('nodes.hostname'), key: 'hostname'}, {title: t('nodes.ip'), key: 'ip'},
    {title: t('nodes.role'), key: 'role'}, {title: t('nodes.availability'), key: 'availability'}, {title: t('nodes.state'), key: 'state'},
    {title: t('nodes.engine'), key: 'engine'}, {title: t('nodes.leader'), key: 'leader'}, {title: t('nodes.reachability'), key: 'reachability'}
])
onMounted(async () => {
    loading.value = true
    try { nodes.value = await restGet<Node[]>('/api/docker/nodes') } finally { loading.value = false }
})
</script>
