<template>
    <div class="service-host-dropdown-wrapper">
        <div class="service-host-dropdown" @click.stop="showDropdown = !showDropdown">
            <span v-if="selectedServiceHost" class="service-host-selected">
                {{ getServiceHostLabel(selectedServiceHost) }}
            </span>
            <span v-else class="service-host-placeholder">Select service host</span>
            <ChevronDown :size="16" class="service-host-chevron" />
        </div>
        <div v-if="showDropdown" class="service-host-dropdown-menu" @click.stop>
            <div class="service-host-list">
                <div v-if="serviceHosts.length === 0" class="service-host-empty-state">
                    <p class="service-host-empty-text">No service hosts yet</p>
                    <p class="service-host-empty-hint">Add one below to get started</p>
                </div>
                <div 
                    v-for="host in serviceHosts" 
                    :key="host.id"
                    class="service-host-item"
                    :class="{ 'selected': selectedServiceHostId === host.id }"
                    @click="handleSelectHost(host.id)"
                >
                    <div class="service-host-item-content">
                        <div class="service-host-item-label">{{ getServiceHostLabel(host) }}</div>
                        <div class="service-host-item-url">{{ host.baseUrl }}</div>
                    </div>
                    <button 
                        class="service-host-item-remove"
                        @click.stop="handleRemoveHost(host.id)"
                        title="Remove"
                    >
                        <X :size="14" />
                    </button>
                </div>
            </div>
            <div class="service-host-add-section">
                <button 
                    v-if="!showAddForm"
                    class="service-host-add-btn"
                    @click="showAddForm = true"
                >
                    + Add Service Host
                </button>
                <div v-else class="service-host-add-form">
                    <input 
                        v-model="newServiceHostBaseUrl"
                        type="text"
                        placeholder="Base URL (e.g., https://api.example.com)"
                        class="service-host-add-input"
                        @keyup.enter="handleAddHost"
                    />
                    <input 
                        v-model="newServiceHostOpenApiPath"
                        type="text"
                        placeholder="OpenAPI Path (optional, e.g., /openapi.json)"
                        class="service-host-add-input"
                        @keyup.enter="handleAddHost"
                    />
                    <div class="service-host-add-actions">
                        <button 
                            @click="handleAddHost"
                            class="service-host-add-submit"
                            :disabled="!newServiceHostBaseUrl.trim()"
                        >
                            Add
                        </button>
                        <button 
                            @click="handleCancelAdd"
                            class="service-host-add-cancel"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { ChevronDown, X } from 'lucide-vue-next';
import { useConfigStore } from '@/stores/config';
import type { ServiceHost } from '@/utils/types';

const config = useConfigStore();

// State
const showDropdown = ref(false);
const showAddForm = ref(false);
const newServiceHostBaseUrl = ref('');
const newServiceHostOpenApiPath = ref('');

// Use service hosts from config
const serviceHosts = computed(() => config.serviceHosts);

// Get selected service host from config
const selectedServiceHost = computed(() => config.selectedServiceHost);
const selectedServiceHostId = computed(() => {
    return selectedServiceHost.value?.id || null;
});

// Methods
const getServiceHostLabel = (host: ServiceHost): string => {
    if (host.label) return host.label;
    return host.baseUrl + (host.openApiPath ? ` (${host.openApiPath})` : '');
};

const handleSelectHost = async (id: string) => {
    const host = serviceHosts.value.find(h => h.id === id);
    if (!host) return;
    
    // Use config to handle host selection (will reload OpenAPI spec)
    await config.selectHost(id);
    
    // Close dropdown
    showDropdown.value = false;
};

const handleAddHost = async () => {
    if (!newServiceHostBaseUrl.value.trim()) return;
    
    const newHost: ServiceHost = {
        id: crypto.randomUUID(),
        baseUrl: newServiceHostBaseUrl.value.trim(),
        openApiPath: newServiceHostOpenApiPath.value.trim() || undefined,
    };
    
    // Use config to handle host addition (will add to localStorage and reload)
    await config.addHost(newHost);
    
    // Select the newly added host
    await config.selectHost(newHost.id);
    
    // Clear form
    newServiceHostBaseUrl.value = '';
    newServiceHostOpenApiPath.value = '';
    showAddForm.value = false;
    
    // Close dropdown
    showDropdown.value = false;
};

const handleCancelAdd = () => {
    showAddForm.value = false;
    newServiceHostBaseUrl.value = '';
    newServiceHostOpenApiPath.value = '';
};

const handleRemoveHost = async (id: string) => {
    // Use config to handle host removal (will remove from localStorage and reload)
    await config.removeHost(id);
};

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const wrapper = target.closest('.service-host-dropdown-wrapper');
    
    if (!wrapper) {
        showDropdown.value = false;
    }
};

// Watch for service host changes to update dropdown state
watch(() => config.serviceHosts, () => {
    // Service hosts updated, dropdown will reflect changes via computed
}, { deep: true });

// Lifecycle
onMounted(async () => {
    // Ensure service hosts are loaded
    await config.loadConfigFromLocalStorage();
    
    // If there's a selected service host, ensure OpenAPI spec is loaded
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
.service-host-dropdown-wrapper {
    position: relative;
    margin-left: auto;
}

.service-host-dropdown {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.875rem;
    min-width: 200px;
    height: 2rem;
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover {
        border-color: hsl(var(--ring));
    }

    .service-host-selected {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .service-host-placeholder {
        flex: 1;
        color: hsl(var(--muted-foreground));
    }

    .service-host-chevron {
        color: hsl(var(--muted-foreground));
        transition: transform 0.2s;
        flex-shrink: 0;
    }
}

.service-host-dropdown-menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    min-width: 300px;
    max-width: 400px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 1000;
    max-height: 400px;
    overflow-y: auto;
    overflow-x: hidden;
}

.service-host-list {
    padding: 0.5rem;
    min-height: 2rem;
}

.service-host-empty-state {
    padding: 1.5rem 0.5rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
}

.service-host-empty-text {
    font-size: 0.875rem;
    font-weight: 500;
    margin: 0 0 0.25rem 0;
    color: hsl(var(--foreground));
}

.service-host-empty-hint {
    font-size: 0.75rem;
    margin: 0;
    color: hsl(var(--muted-foreground));
}

.service-host-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
        background: hsl(var(--muted) / 0.5);
    }

    &.selected {
        background: hsl(var(--primary) / 0.1);
    }

    .service-host-item-content {
        flex: 1;
        min-width: 0;
    }

    .service-host-item-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: hsl(var(--foreground));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .service-host-item-url {
        font-size: 0.75rem;
        color: hsl(var(--muted-foreground));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .service-host-item-remove {
        padding: 0.25rem;
        border: none;
        background: transparent;
        color: hsl(var(--muted-foreground));
        cursor: pointer;
        border-radius: calc(var(--radius) - 2px);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;

        &:hover {
            background: hsl(var(--destructive) / 0.1);
            color: hsl(var(--destructive));
        }
    }
}

.service-host-add-section {
    border-top: 1px solid hsl(var(--border));
    padding: 0.5rem;
}

.service-host-add-btn {
    width: 100%;
    padding: 0.5rem;
    border: 1px dashed hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        border-color: hsl(var(--ring));
        background: hsl(var(--muted) / 0.3);
    }
}

.service-host-add-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.service-host-add-input {
    padding: 0.5rem;
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s;

    &:focus {
        border-color: hsl(var(--ring));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
}

.service-host-add-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
}

.service-host-add-submit,
.service-host-add-cancel {
    padding: 0.375rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
}

.service-host-add-submit {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));

    &:hover:not(:disabled) {
        opacity: 0.9;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.service-host-add-cancel {
    background: transparent;
    color: hsl(var(--foreground));

    &:hover {
        background: hsl(var(--muted) / 0.3);
    }
}
</style>