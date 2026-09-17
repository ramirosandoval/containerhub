<template>
    <Crud :entity="RegistryImagesCrud.instance">
        <template #item.tags="{item}">
            <v-btn :loading="loadingTags[(item as any).name]" :text="t('registryImages.loadTags')" size="small" variant="text" @click="loadTags((item as any).name)"/>
            <v-chip v-for="tag in imageTags[(item as any).name] ?? []" :key="tag" class="ma-1" size="small">{{ tag }}</v-chip>
        </template>
    </Crud>
</template>

<script setup lang="ts">
import {Crud} from '@drax/crud-vue'
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {restGet} from '@/rest'
import {RegistryImagesCrud} from '@/cruds/RegistryImagesCrud'

type RegistryImageTags = {tags?: string[] | null}
const {t} = useI18n()
const imageTags = ref<Record<string, string[] | undefined>>({})
const loadingTags = ref<Record<string, boolean | undefined>>({})

async function loadTags(name: string) {
    if (name in imageTags.value) return
    loadingTags.value[name] = true
    try {
        const result = await restGet<RegistryImageTags>('/api/registry/image/tags', {name})
        imageTags.value[name] = result.tags ?? []
    } finally {
        loadingTags.value[name] = false
    }
}
</script>
