<template>
  <div class="titlebar" v-if="isElectron">
    <div class="titlebar-drag-region">
      <div class="titlebar-title">OpenAPI Studio</div>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-button" @click="minimize" title="Minimize">
        <Minus :size="12" />
      </button>
      <button class="titlebar-button" @click="maximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <Maximize2 v-if="!isMaximized" :size="12" />
        <Minimize2 v-else :size="12" />
      </button>
      <button class="titlebar-button titlebar-button-close" @click="close" title="Close">
        <X :size="12" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Minus, Maximize2, Minimize2, X } from 'lucide-vue-next';

const isElectron = ref(typeof window !== 'undefined' && window.electronAPI !== undefined);
const isMaximized = ref(false);

const checkMaximized = async () => {
  if (isElectron.value && window.electronAPI) {
    isMaximized.value = await window.electronAPI.windowIsMaximized();
  }
};

onMounted(async () => {
  if (isElectron.value && window.electronAPI) {
    await checkMaximized();
    window.electronAPI.onWindowMaximized((maximized: boolean) => {
      isMaximized.value = maximized;
    });
  }
});

const minimize = async () => {
  if (isElectron.value && window.electronAPI) {
    await window.electronAPI.windowMinimize();
  }
};

const maximize = async () => {
  if (isElectron.value && window.electronAPI) {
    await window.electronAPI.windowMaximize();
    await checkMaximized();
  }
};

const close = async () => {
  if (isElectron.value && window.electronAPI) {
    await window.electronAPI.windowClose();
  }
};
</script>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background-color: hsl(var(--background));
  border-bottom: 1px solid hsl(var(--border));
  -webkit-app-region: drag;
  user-select: none;
  z-index: 10000;
  position: relative;
}

.titlebar-drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  padding-left: 12px;
  -webkit-app-region: drag;
}

.titlebar-title {
  font-size: 12px;
  color: hsl(var(--foreground));
  font-weight: 500;
  opacity: 0.9;
}

.titlebar-controls {
  display: flex;
  -webkit-app-region: no-drag;
  height: 100%;
}

.titlebar-button {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
  padding: 0;
}

.titlebar-button:hover {
  background-color: hsl(var(--muted));
}

.titlebar-button-close:hover {
  background-color: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}

.titlebar-button :deep(svg) {
  pointer-events: none;
}

.titlebar-button:active {
  opacity: 0.7;
}
</style>
