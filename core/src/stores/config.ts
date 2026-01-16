import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import { useLocalStorage, } from '@/composables/useLocalStorage'
import { useConfigJson } from '@/composables/useConfigJson'
import { useFeaturesToggle } from '@/composables/useFeaturesToggle'
import { useOpenApiStore } from '@/stores/openapi'
import type { Config, ServiceHost } from '@/utils/types'

/**
 * Config store that manages configuration from config.json, localStorage, and environment variables
 * Loads all settings from localStorage on init and watches for selected service host changes
 */
export const useConfigStore = defineStore('config', () => {
    const localStorageService = useLocalStorage()
    const configJsonService = useConfigJson()
    const featuresToggle = useFeaturesToggle()
    const openApiStore = useOpenApiStore()

    // Service host management state (loaded from localStorage on init)
    const serviceHosts = ref<ServiceHost[]>([])
    const selectedServiceHost = ref<ServiceHost | null>(null)

    const isLoadingOpenApi = ref(false)

    // Config values (loaded and stored in refs)
    const mergedConfig = computed((): Config => {
        if (import.meta.env.SSR) {
            // When SSR, use environment variables
            return {
                serviceHost: import.meta.env.VITE_SERVICE_HOST,
                clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
                openApiSpecUrl: import.meta.env.VITE_OPENAPI_SPEC_URL,
            }
        }

        const configMap: {
            env: Config,
            json: Config,
            localStorage: Config,
        } = {
            env: {
                defaultServiceHostToWindowOrigin: import.meta.env.VITE_DEFAULT_SERVICE_HOST_TO_WINDOW_ORIGIN === 'true',
                serviceHost: import.meta.env.VITE_SERVICE_HOST,
                clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
                openApiSpecUrl: import.meta.env.VITE_OPENAPI_SPEC_URL,
            },
            json: configJsonService.config.value ?? {},
            localStorage: selectedServiceHost.value ? {
                ...(selectedServiceHost.value.baseUrl ? { serviceHost: selectedServiceHost.value.baseUrl } : {}),
                ...(selectedServiceHost.value.clerkPublishableKey ? { clerkPublishableKey: selectedServiceHost.value.clerkPublishableKey } : {}),
                ...(selectedServiceHost.value.openApiPath ? { openApiSpecUrl: selectedServiceHost.value.openApiPath } : {}),
            } : {},
        };

        const merged = {
            ...configMap.env,
            ...configMap.json,
            ...configMap.localStorage,
        }
        
        // Normalize serviceHost to remove trailing slashes
        if (merged.defaultServiceHostToWindowOrigin) {
            merged.serviceHost = window.location.origin
        } 
        
        if (merged.serviceHost && !merged.openApiSpecUrl) {
            merged.openApiSpecUrl = new URL('openapi.json', merged.serviceHost).href;
        }

        console.log('configMap', configMap)
        console.log('merged', merged)

        return merged
    });

    const serviceHost = computed((): string | null => {
        return mergedConfig.value.serviceHost ?? null
    });
    const clerkPublishableKey = computed((): string | null => {
        return mergedConfig.value.clerkPublishableKey ?? null
    });
    const openApiSpecUrl = computed((): string | null => {
        return mergedConfig.value.openApiSpecUrl ?? null
    });

    /**
     * Computed property that checks if a valid service host is available
     */
    const hasServiceHost = computed(() => {
        return !!serviceHost.value?.trim();
    })

    const initialize = async () => {
        await configJsonService.loadConfigJson();
        await reload();
    }

    const reload = async () => {
        await loadConfigFromLocalStorage();
        await loadOpenApiSpec();
    }

    const loadConfigFromLocalStorage = async () => {
        serviceHosts.value = localStorageService.getServiceHosts()
        // Also update selected ID from localStorage
        const storedSelectedId = localStorageService.getSelectedServiceHostId()
        if (storedSelectedId && storedSelectedId !== selectedServiceHost.value?.id) {
            selectedServiceHost.value = serviceHosts.value.find(h => h.id === storedSelectedId) || null
        }
    }


    /**
    * Load OpenAPI spec for the selected service host
    */
    const loadOpenApiSpec = async (): Promise<void> => {
        // Prevent double loading
        if (isLoadingOpenApi.value) return

        if (openApiSpecUrl.value) {
            isLoadingOpenApi.value = true
            try {
                await openApiStore.loadSpec()
            } finally {
                isLoadingOpenApi.value = false
            }
        } else {
            // No service host selected - clear state
            openApiStore.loading = false
            openApiStore.openApiSpec = null
            openApiStore.error = null
        }
    }

    /**
     * Handle service host selection
     */
    const selectHost = async (hostId: string | null): Promise<void> => {
        // Update in-memory state
        selectedServiceHost.value = serviceHosts.value.find(h => h.id === hostId) || null
        // Update localStorage
        localStorageService.setSelectedServiceHostId(hostId)
        // Reload
        await reload()
    }

    /**
     * Handle service host addition
     */
    const addHost = async (host: ServiceHost): Promise<void> => {
        // Update in-memory state
        serviceHosts.value.push(host)
        // Update localStorage
        localStorageService.addServiceHost(host)
        // Reload
        await reload()
    }

    /**
     * Handle service host removal
     */
    const removeHost = async (id: string): Promise<void> => {
        // Update in-memory state
        serviceHosts.value = serviceHosts.value.filter(h => h.id !== id)
        // Update localStorage
        localStorageService.removeServiceHost(id)
        // Clear selection if the removed host was selected
        if (selectedServiceHost.value?.id === id) {
            selectedServiceHost.value = null
            localStorageService.setSelectedServiceHostId(null)
        }
        // Reload
        await reload()
    }

    /**
     * Save clerk key for the selected service host
     */
    const saveClerkPublishableKeyForSelectedHost = (key: string): void => {
        const selectedHost = selectedServiceHost.value
        if (!selectedHost) return

        // Update the service host with the new clerk key
        const updatedHost: ServiceHost = {
            ...selectedHost,
            clerkPublishableKey: key.trim() || undefined
        }

        // Update in localStorage
        localStorageService.addServiceHost(updatedHost)

        // Update in-memory state
        const index = serviceHosts.value.findIndex(h => h.id === selectedHost.id)
        if (index >= 0) {
            serviceHosts.value[index] = updatedHost
        }
    }

    /**
     * Clear clerk key for the selected service host
     */
    const clearClerkPublishableKeyForSelectedHost = (): void => {
        saveClerkPublishableKeyForSelectedHost('')
    }

    const isServiceHostPickerEnabled = computed(() => featuresToggle.isServiceHostPickerEnabled && !mergedConfig.value.defaultServiceHostToWindowOrigin)
    const isClerkEnabled = computed(() => featuresToggle.isClerkEnabled)
    const isClerkPublishableKeyChangeEnabled = computed(() => featuresToggle.isClerkPublishableKeyChangeEnabled)

    return {
        // State
        serviceHosts,
        selectedServiceHost,
        // Config values (computed from mergedConfig)
        serviceHost,
        clerkPublishableKey,
        openApiSpecUrl,
        hasServiceHost,
        config: mergedConfig,
        // Config loading
        initialize,
        reload,
        loadConfigFromLocalStorage,
        loadOpenApiSpec,
        // Service host management
        selectHost,
        addHost,
        removeHost,
        // Clerk key management
        saveClerkPublishableKeyForSelectedHost,
        clearClerkPublishableKeyForSelectedHost,
        // Feature toggles (merged from useFeaturesToggle)
        isServiceHostPickerEnabled,
        isClerkEnabled,
        isClerkPublishableKeyChangeEnabled,
    }
})
