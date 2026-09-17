<template>
    <Crud :entity="GhostContainersCrud.instance">
        <template #item.Created="{value}">{{ formatCreated(value) }}</template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {GhostContainersCrud} from '@/cruds/GhostContainersCrud'

function formatCreated(created: unknown): string {
    return typeof created === 'number' ? new Date(created * 1000).toLocaleString() : '—'
}
</script>
