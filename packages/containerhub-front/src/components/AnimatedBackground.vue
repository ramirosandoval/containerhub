<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from 'vuetify'

const props = defineProps({
  icon: {
    type: String,
    default: null
  }
})

const theme = useTheme()
const color = computed(() => theme.current.value.colors.primary)

</script>

<template>
  <ul class="circles" :class="{'with-icons': !!props.icon}">
    <li v-for="i in 10" :key="i">
      <v-icon v-if="props.icon" :icon="props.icon" :color="color" class="animated-icon"></v-icon>
    </li>
  </ul>
</template>

<style scoped>
.area {
  width: 100%;
  height:  100%;
}

.circles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
  margin: 0;
  padding: 0;
}

.circles li {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  list-style: none;
  width: 20px;
  height: 20px;
  background: v-bind(color);
  animation: animate 25s linear infinite;
  bottom: -150px;
}

.circles.with-icons li {
  background: transparent;
  border-radius: 0;
}

.circles li .animated-icon {
  width: 100%;
  height: 100%;
  font-size: inherit;
}

.circles li:nth-child(1) {
  left: 25%;
  width: 80px;
  height: 80px;
  font-size: 80px;
  animation-delay: 0s;
}

.circles li:nth-child(2) {
  left: 10%;
  width: 20px;
  height: 20px;
  font-size: 20px;
  animation-delay: 2s;
  animation-duration: 12s;
}

.circles li:nth-child(3) {
  left: 70%;
  width: 20px;
  height: 20px;
  font-size: 20px;
  animation-delay: 4s;
}

.circles li:nth-child(4) {
  left: 40%;
  width: 60px;
  height: 60px;
  font-size: 60px;
  animation-delay: 0s;
  animation-duration: 18s;
}

.circles li:nth-child(5) {
  left: 65%;
  width: 20px;
  height: 20px;
  font-size: 20px;
  animation-delay: 0s;
}

.circles li:nth-child(6) {
  left: 75%;
  width: 110px;
  height: 110px;
  font-size: 110px;
  animation-delay: 3s;
}

.circles li:nth-child(7) {
  left: 35%;
  width: 150px;
  height: 150px;
  font-size: 150px;
  animation-delay: 7s;
}

.circles li:nth-child(8) {
  left: 50%;
  width: 25px;
  height: 25px;
  font-size: 25px;
  animation-delay: 15s;
  animation-duration: 45s;
}

.circles li:nth-child(9) {
  left: 20%;
  width: 15px;
  height: 15px;
  font-size: 15px;
  animation-delay: 2s;
  animation-duration: 35s;
}

.circles li:nth-child(10) {
  left: 85%;
  width: 150px;
  height: 150px;
  font-size: 150px;
  animation-delay: 0s;
  animation-duration: 11s;
}

@keyframes animate {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.5;
    border-radius: 0;
  }
  100% {
    transform: translateY(-1000px) rotate(720deg);
    opacity: 0;
    border-radius: 50%;
  }
}
</style>
