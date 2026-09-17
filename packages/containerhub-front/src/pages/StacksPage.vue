<template>
    <Crud :entity="StacksCrud.instance">
        <template #item.actions="{item}">
            <v-btn
                :to="{name: 'services', query: {stack: stackName(item)}}"
                icon="mdi-format-list-bulleted"
                size="small"
                :aria-label="t('stacks.openServices', {stack: stackName(item)})"
                variant="text"
            />
        </template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {useI18n} from 'vue-i18n'
import {StacksCrud} from '@/cruds/StacksCrud'

const {t} = useI18n()

function stackName(item: unknown): string {
    if (item && typeof item === 'object' && 'raw' in item) return stackName(item.raw)
    return item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' ? item.name : ''
}
</script>
