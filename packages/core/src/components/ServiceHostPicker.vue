<template>
    <div class="host-picker">
        <button
            class="host-trigger"
            @click.stop="showDropdown = !showDropdown"
            :class="{ open: showDropdown }"
        >
            <span v-if="selectedServiceHost" class="host-trigger-label">
                {{ getServiceHostLabel(selectedServiceHost) }}
            </span>
            <span v-else class="host-trigger-placeholder">Select service host</span>
            <ChevronDown :size="14" :stroke-width="1.5" class="host-trigger-chev" />
        </button>
        <div v-if="showDropdown" class="host-menu" @click.stop>
            <div class="host-list">
                <div v-if="serviceHosts.length === 0" class="host-empty">
                    <p class="host-empty-title">No service hosts</p>
                    <p class="host-empty-sub">Add one below to begin</p>
                </div>
                <button
                    v-for="host in serviceHosts"
                    :key="host.id"
                    class="host-row"
                    :class="{ active: selectedServiceHostId === host.id }"
                    @click="handleSelectHost(host.id)"
                >
                    <div class="host-row-text">
                        <div class="host-row-label">{{ getServiceHostLabel(host) }}</div>
                        <div class="host-row-url">{{ host.baseUrl }}</div>
                    </div>
                    <button
                        class="host-row-remove"
                        @click.stop="handleRemoveHost(host.id)"
                        title="Remove"
                    >
                        <X :size="12" :stroke-width="1.5" />
                    </button>
                </button>
            </div>
            <div class="host-add">
                <button
                    v-if="!showAddForm"
                    class="host-add-btn"
                    @click="showAddForm = true"
                >+ Add Service Host</button>
                <div v-else class="host-add-form">
                    <input
                        v-model="newServiceHostBaseUrl"
                        type="text"
                        placeholder="Base URL (e.g. https://api.example.com)"
                        class="host-input"
                        @keyup.enter="handleAddHost"
                    />
                    <input
                        v-model="newServiceHostOpenApiPath"
                        type="text"
                        placeholder="OpenAPI Path (optional)"
                        class="host-input"
                        @keyup.enter="handleAddHost"
                    />
                    <div class="host-add-actions">
                        <button
                            @click="handleCancelAdd"
                            class="host-cancel"
                        >Cancel</button>
                        <button
                            @click="handleAddHost"
                            class="host-submit"
                            :disabled="!newServiceHostBaseUrl.trim()"
                        >Add</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { ChevronDown, X } from '@lucide/vue';
import { useConfigStore } from '@/stores/config';
import type { ServiceHost } from '@/utils/types';

const config = useConfigStore();

const showDropdown = ref(false);
const showAddForm = ref(false);
const newServiceHostBaseUrl = ref('');
const newServiceHostOpenApiPath = ref('');

const serviceHosts = computed(() => config.serviceHosts);
const selectedServiceHost = computed(() => config.selectedServiceHost);
const selectedServiceHostId = computed(() => selectedServiceHost.value?.id || null);

const getServiceHostLabel = (host: ServiceHost): string => {
    if (host.label) return host.label;
    return host.baseUrl + (host.openApiPath ? ` (${host.openApiPath})` : '');
};

const handleSelectHost = async (id: string) => {
    const host = serviceHosts.value.find(h => h.id === id);
    if (!host) return;
    await config.selectHost(id);
    showDropdown.value = false;
};

const handleAddHost = async () => {
    if (!newServiceHostBaseUrl.value.trim()) return;

    const newHost: ServiceHost = {
        id: crypto.randomUUID(),
        baseUrl: newServiceHostBaseUrl.value.trim(),
        openApiPath: newServiceHostOpenApiPath.value.trim() || undefined,
    };

    await config.addHost(newHost);
    await config.selectHost(newHost.id);

    newServiceHostBaseUrl.value = '';
    newServiceHostOpenApiPath.value = '';
    showAddForm.value = false;
    showDropdown.value = false;
};

const handleCancelAdd = () => {
    showAddForm.value = false;
    newServiceHostBaseUrl.value = '';
    newServiceHostOpenApiPath.value = '';
};

const handleRemoveHost = async (id: string) => {
    await config.removeHost(id);
};

const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const wrapper = target.closest('.host-picker');
    if (!wrapper) {
        showDropdown.value = false;
    }
};

watch(() => config.serviceHosts, () => {}, { deep: true });

onMounted(async () => {
    await config.loadConfigFromLocalStorage();
    const selectedHost = config.selectedServiceHost;
    if (selectedHost) {
        await config.loadOpenApiSpec();
    }
    document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped lang="scss">
@use '@/styles/shared' as *;

.host-picker {
    position: relative;
}

.host-trigger {
    display: flex;
    align-items: center;
    gap: $space-sm;
    height: 32px;
    padding: 0 $space-md;
    border: 1px solid var(--border-visible);
    border-radius: 999px;
    background: transparent;
    color: var(--text-primary);
    font-family: $font-data;
    font-size: $caption;
    min-width: 240px;
    max-width: 320px;
    cursor: pointer;
    @include transition-micro;

    &:hover,
    &.open {
        border-color: var(--text-primary);
    }
}

.host-trigger-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
}

.host-trigger-placeholder {
    @include type-label;
    flex: 1;
    color: var(--text-secondary);
    text-align: left;
}

.host-trigger-chev {
    color: var(--text-secondary);
    flex-shrink: 0;
}

.host-menu {
    position: absolute;
    top: calc(100% + $space-xs);
    right: 0;
    min-width: 320px;
    max-width: 420px;
    background: var(--surface-raised);
    border: 1px solid var(--border-visible);
    z-index: 1000;
    max-height: 420px;
    overflow-y: auto;
    overflow-x: hidden;
}

.host-list {
    padding: $space-sm 0;
    min-height: 2rem;
}

.host-empty {
    padding: $space-lg $space-md;
    text-align: left;
}

.host-empty-title {
    @include type-body-sm;
    color: var(--text-primary);
    margin: 0 0 $space-2xs 0;
}

.host-empty-sub {
    @include type-caption;
    color: var(--text-disabled);
    margin: 0;
}

.host-row {
    display: flex;
    align-items: center;
    gap: $space-sm;
    width: 100%;
    padding: $space-sm $space-md;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    @include transition-micro;

    &:hover {
        background: var(--surface);
    }

    &.active {
        background: var(--surface);
        border-left-color: var(--text-display);
    }
}

.host-row-text {
    flex: 1;
    min-width: 0;
}

.host-row-label {
    @include type-body-sm;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.host-row-url {
    @include type-caption;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.host-row-remove {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-disabled);
    cursor: pointer;
    @include transition-micro(color);

    &:hover {
        color: var(--accent);
    }
}

.host-add {
    border-top: 1px solid var(--border);
    padding: $space-md;
}

.host-add-btn {
    @include type-label;
    width: 100%;
    padding: $space-sm $space-md;
    border: 1px dashed var(--border-visible);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    @include transition-micro;

    &:hover {
        border-color: var(--text-primary);
        color: var(--text-primary);
    }
}

.host-add-form {
    display: flex;
    flex-direction: column;
    gap: $space-sm;
}

.host-input {
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-primary);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-visible);
    padding: $space-xs 0;
    outline: none;
    @include transition-micro(border-color);

    &::placeholder {
        color: var(--text-disabled);
    }

    &:focus {
        border-color: var(--text-display);
    }
}

.host-add-actions {
    display: flex;
    gap: $space-sm;
    justify-content: flex-end;
    margin-top: $space-xs;
}

.host-cancel,
.host-submit {
    @include type-label;
    height: 32px;
    padding: 0 $space-md;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;
}

.host-cancel {
    background: transparent;
    border: 1px solid var(--border-visible);
    color: var(--text-secondary);

    &:hover {
        color: var(--text-primary);
        border-color: var(--text-primary);
    }
}

.host-submit {
    background: var(--text-display);
    color: var(--black);
    border: none;

    &:hover:not(:disabled) {
        background: var(--text-primary);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}
</style>
