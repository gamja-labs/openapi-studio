<script setup lang="ts">
import { ref, computed } from 'vue';
import { useConfigStore } from '@/stores/config';
import ServiceHostPicker from '@/components/ServiceHostPicker.vue';
import type { ServiceHost } from '@/utils/types';

const config = useConfigStore();

const serviceHostInput = ref<string>('');
const openApiPathInput = ref<string>('');
const serviceHosts = computed(() => config.serviceHosts);
const hasServiceHost = computed(() => config.hasServiceHost);

const handleDirectConnect = async () => {
    if (!serviceHostInput.value.trim()) return;

    const newHost: ServiceHost = {
        id: crypto.randomUUID(),
        baseUrl: serviceHostInput.value.trim(),
        openApiPath: openApiPathInput.value.trim() || undefined,
    };

    await config.addHost(newHost);
    await config.selectHost(newHost.id);

    serviceHostInput.value = '';
    openApiPathInput.value = '';
};
</script>

<template>
    <div v-if="config.isServiceHostPickerEnabled && !hasServiceHost" class="connect-section">
        <p v-if="serviceHosts.length > 0" class="connect-hint">
            Select or add a service host.
        </p>
        <p v-else class="connect-hint">
            Enter your service host URL to begin.
        </p>

        <ServiceHostPicker v-if="serviceHosts.length > 0" />

        <div v-else class="connect-form">
            <label class="connect-field">
                <span class="connect-label">Base URL</span>
                <input
                    v-model="serviceHostInput"
                    type="text"
                    placeholder="https://api.example.com"
                    class="connect-input"
                    @keyup.enter="handleDirectConnect"
                />
            </label>
            <label class="connect-field">
                <span class="connect-label">OpenAPI Path <span class="connect-label-aux">(optional)</span></span>
                <input
                    v-model="openApiPathInput"
                    type="text"
                    placeholder="/openapi.json"
                    class="connect-input"
                    @keyup.enter="handleDirectConnect"
                />
            </label>
            <button
                @click="handleDirectConnect"
                class="connect-btn"
                :disabled="!serviceHostInput.trim()"
            >Connect →</button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use '@/styles/shared' as *;

.connect-section {
    margin: $space-xl 0;
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.connect-hint {
    @include type-body-sm;
    color: var(--text-secondary);
    margin: 0;
}

.connect-form {
    display: flex;
    flex-direction: column;
    gap: $space-lg;
    max-width: 480px;
}

.connect-field {
    display: flex;
    flex-direction: column;
    gap: $space-xs;
}

.connect-label {
    @include type-label;
    color: var(--text-secondary);
}

.connect-label-aux {
    color: var(--text-disabled);
}

.connect-input {
    font-family: $font-data;
    font-size: $body;
    color: var(--text-primary);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-visible);
    padding: $space-sm 0;
    outline: none;
    @include transition-micro(border-color);

    &::placeholder {
        color: var(--text-disabled);
    }

    &:focus {
        border-color: var(--text-display);
    }
}

.connect-btn {
    @include type-label;
    align-self: flex-start;
    height: 48px;
    padding: 0 $space-xl;
    background: var(--text-display);
    color: var(--black);
    border: none;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;
    margin-top: $space-sm;

    &:hover:not(:disabled) {
        background: var(--text-primary);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}
</style>
