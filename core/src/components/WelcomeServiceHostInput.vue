<script setup lang="ts">
import { ref, computed } from 'vue';
import { useConfigStore } from '@/stores/config';
import ServiceHostPicker from '@/components/ServiceHostPicker.vue';
import type { ServiceHost } from '@/utils/types';

const config = useConfigStore();

// Service host management
const serviceHostInput = ref<string>('');
const openApiPathInput = ref<string>('');
const serviceHosts = computed(() => config.serviceHosts);
const hasServiceHost = computed(() => config.hasServiceHost);

// Handle direct form connection (when no service hosts exist)
const handleDirectConnect = async () => {
    if (!serviceHostInput.value.trim()) return;
    
    const newHost: ServiceHost = {
        id: crypto.randomUUID(),
        baseUrl: serviceHostInput.value.trim(),
        openApiPath: openApiPathInput.value.trim() || undefined,
    };
    
    // Use config to handle host addition (will add to localStorage and reload)
    await config.addHost(newHost);
    
    // Select the newly added host
    await config.selectHost(newHost.id);

    // Clear inputs
    serviceHostInput.value = '';
    openApiPathInput.value = '';
};
</script>

<template>
    <div v-if="config.isServiceHostPickerEnabled && !hasServiceHost" class="service-host-input-section">
        <p v-if="serviceHosts.length > 0" class="welcome-description">
            Please select or add a service host to get started.
        </p>
        <p v-else class="welcome-description">
            Please enter your service host URL to get started.
        </p>
        
        <!-- Show dropdown if there are service hosts -->
        <ServiceHostPicker 
            v-if="serviceHosts.length > 0"
        />
        
        <!-- Show direct input form if there are no service hosts -->
        <div v-else class="service-host-direct-form">
            <div class="service-host-input-wrapper">
                <input 
                    v-model="serviceHostInput"
                    type="text"
                    placeholder="Base URL (e.g., https://api.example.com)"
                    class="service-host-input"
                    @keyup.enter="handleDirectConnect"
                />
                <input 
                    v-model="openApiPathInput"
                    type="text"
                    placeholder="OpenAPI Path (optional, e.g., /openapi.json)"
                    class="service-host-input"
                    @keyup.enter="handleDirectConnect"
                />
                <button 
                    @click="handleDirectConnect" 
                    class="service-host-submit-btn"
                    :disabled="!serviceHostInput.trim()"
                >
                    Connect
                </button>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.welcome-description {
    font-size: 1.125rem;
    color: hsl(var(--muted-foreground));
    margin: 0 0 2.5rem 0;
    line-height: 1.6;
}

.service-host-input-section {
    margin: 2rem 0;
}

.service-host-direct-form {
    margin-top: 1.5rem;
}

.service-host-direct-form .service-host-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: stretch;
    justify-content: center;
    max-width: 500px;
    margin: 0 auto;
}

.service-host-input-wrapper {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    margin-top: 1.5rem;
}

.service-host-input {
    padding: 0.75rem 1rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 1rem;
    min-width: 300px;
    transition: border-color 0.2s;

    &:hover {
        border-color: hsl(var(--accent));
    }

    &:focus {
        outline: none;
        border-color: hsl(var(--ring));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
}

.service-host-submit-btn {
    padding: 0.75rem 1.5rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;

    &:hover:not(:disabled) {
        background: hsl(var(--primary) / 0.9);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.service-host-direct-form .service-host-submit-btn {
    width: 100%;
}
</style>
