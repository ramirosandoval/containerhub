<template>
    <Crud :entity="GhostContainersCrud.instance">
        <template #item.Created="{value}">{{ formatCreated(value) }}</template>
        <template #item.NodeID="{value}">
            <router-link v-if="typeof value === 'string' && value && hasPermission('DOCKER_NODES_FETCH')" :to="{name: 'nodes', query: {node: value}}" class="text-primary text-decoration-underline">{{ value }}</router-link>
            <span v-else>{{ value || '—' }}</span>
        </template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {useAuth} from '@drax/identity-vue'
import {GhostContainersCrud} from '@/cruds/GhostContainersCrud'

const {hasPermission} = useAuth()

function formatCreated(created: unknown): string {
    return typeof created === 'number' ? new Date(created * 1000).toLocaleString() : '—'
}
</script>
