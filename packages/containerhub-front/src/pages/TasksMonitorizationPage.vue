<template>
    <Crud :entity="TaskMonitorizationCrud.instance">
        <template #item.date="{value}">{{ formatDateTime(value as string) }}</template>
        <template #item.status="{value}">
            <v-chip :color="value === 'running' ? 'success' : 'error'" size="small" class="text-uppercase font-weight-bold">
                {{ value }}
            </v-chip>
        </template>
        <template #item.modifiedBy="{value}">
            {{ value ?? 'Unknown' }}
        </template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {formatDateTime} from '@drax/common-front'
import {TaskMonitorizationCrud} from '@/cruds/TaskMonitorizationCrud'
</script>
