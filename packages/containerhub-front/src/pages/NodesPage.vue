<template>
    <Crud :entity="NodesCrud.instance">
        <template #item.leader="{value}"><v-icon :color="value ? 'success' : undefined" :icon="value ? 'mdi-check-circle' : 'mdi-minus-circle-outline'"/></template>
        <template #item.agentHealthy="{value}"><v-icon :color="value === true ? 'success' : value === false ? 'error' : undefined" :icon="value === true ? 'mdi-check-circle' : value === false ? 'mdi-alert-circle' : 'mdi-minus-circle-outline'"/></template>
        <template #item.resources="{value}">{{ formatNodeResources(value) }}</template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {NodesCrud} from '@/cruds/NodesCrud'
import {formatNodeResources} from './nodeResources'
</script>
