<template>
    <home-gallery :menu="menu.filter((item) => !item.text.includes('home'))"/>
</template>

<script setup lang="ts">
import HomeGallery from '@/components/HomeGallery.vue'
import {menu} from '@/navigation'
</script>
