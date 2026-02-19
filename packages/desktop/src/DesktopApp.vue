<template>
  <div class="desktop-app">
    <TitleBar />
    <div class="app-content">
      <App />
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBar from './TitleBar.vue';
import App from '@openapi-studio/core/src/App.vue';
</script>

<style scoped>
.desktop-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
