<template>
    <gallery-menu :menu="menu.filter((item) => !item.text.includes('home'))"/>
</template>

<script setup lang="ts">
import {GalleryMenu} from '@drax/common-vue'
import {menu} from '@/navigation'
</script>
