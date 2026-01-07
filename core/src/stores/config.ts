import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useLocalStorage, type ServiceHost } from '@/composables/useLocalStorage'
import { useOpenApiStore } from '@/stores/openapi'

interface Config {
    serviceHost?: string
    clerkKey?: string
    openApiSpecUrl?: string
}

/**
 * Config store that manages configuration from config.json, localStorage, and environment variables
 * Loads all settings from localStorage on init and watches for selected service host changes
 */
export const useConfigStore = defineStore('config', () => {
    const localStorageService = useLocalStorage()
    const openApiStore = useOpenApiStore()
    const configCache = ref<Config | null>(null)
    
    // Service host management state (loaded from localStorage on init)
    const serviceHosts = ref<ServiceHost[]>([])
    const selectedServiceHostId = ref<string | null>(null)
    const isLoadingOpenApi = ref(false)
    
    /**
     * Computed property that checks if a valid service host is available
     */
    const hasServiceHost = computed(() => {
        // Check for selected service host
        const selectedId = selectedServiceHostId.value
        if (selectedId) {
            const selectedHost = serviceHosts.value.find(h => h.id === selectedId)
            if (selectedHost?.baseUrl?.trim()) {
                return true
            }
        }
        
        // Fallback to environment variable
        return !!(import.meta.env.VITE_SERVICE_HOST?.trim())
    })

    /**
     * Get the currently selected service host from in-memory state
     */
    const getSelectedServiceHost = computed((): ServiceHost | null => {
        if (!selectedServiceHostId.value) return null
        return serviceHosts.value.find(h => h.id === selectedServiceHostId.value) || null
    })

    /**
     * Gets the config.json path from environment variable or defaults to '/openapi-studio-config.json'
     */
    const getConfigJsonPath = (): string => {
        return import.meta.env.VITE_CONFIG_JSON_PATH || '/openapi-studio-config.json'
    }

    /**
     * Clears the config cache to force reload
     */
    const clearConfigCache = (): void => {
        configCache.value = null
    }

    /**
     * Normalizes an OpenAPI path to ensure it starts with /
     */
    const normalizeOpenApiPath = (path: string): string => {
        return path.startsWith('/') ? path : `/${path}`
    }

    /**
     * Loads configuration from config.json (path configurable via VITE_CONFIG_JSON_PATH)
     * Falls back to environment variables if config.json is not available
     */
    const loadConfig = async (): Promise<Config> => {
        if (configCache.value !== null) {
            return configCache.value
        }

        let config: Config = {}

        if (!import.meta.env.SSR) {
            const configPath = getConfigJsonPath()
            try {
                const response = await fetch(configPath)
                if (response.ok) {
                    config = await response.json() as Config
                    console.log(`Loaded config from ${configPath}`)
                }
            } catch (error) {
                // Failed to load config from configPath, falling back to environment variables
            }
        }

        // Apply defaults from environment variables for missing values
        if (!config.serviceHost) {
            // Check selected service host from in-memory state
            const selectedHost = getSelectedServiceHost.value
            if (selectedHost?.baseUrl?.trim()) {
                config.serviceHost = selectedHost.baseUrl.trim()
            }
            // Fallback to env var
            if (!config.serviceHost) {
                config.serviceHost = import.meta.env.VITE_SERVICE_HOST
            }
        }
        if (!config.clerkKey) {
            // Check selected service host's clerk key
            const selectedHost = getSelectedServiceHost.value
            if (selectedHost?.clerkKey?.trim()) {
                config.clerkKey = selectedHost.clerkKey.trim()
            }
            // Fallback to legacy localStorage store
            if (!config.clerkKey) {
                const storedKey = localStorageService.getClerkKey()
                if (storedKey && storedKey.trim()) {
                    config.clerkKey = storedKey.trim()
                }
            }
            // Fallback to env var
            if (!config.clerkKey) {
                config.clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
            }
        }
        if (!config.openApiSpecUrl) {
            config.openApiSpecUrl = import.meta.env.VITE_OPENAPI_SPEC_URL
        }

        // If openApiSpecUrl is still not set, construct it from serviceHost
        if (!config.openApiSpecUrl) {
            const host = config.serviceHost || import.meta.env.VITE_SERVICE_HOST || ''
            config.openApiSpecUrl = host ? `${host}/openapi.json` : ''
        }

        configCache.value = config
        return configCache.value
    }

    /**
     * Gets the service host from config.json or environment variable
     */
    const getServiceHost = async (): Promise<string> => {
        const config = await loadConfig()
        return config.serviceHost || ''
    }

    /**
     * Gets the clerk key from config.json or environment variable
     */
    const getClerkKey = async (): Promise<string> => {
        const config = await loadConfig()
        return config.clerkKey || ''
    }

    /**
     * Gets the OpenAPI spec URL from config.json or environment variable
     */
    const getOpenApiSpecUrl = async (): Promise<string> => {
        const config = await loadConfig()
        return config.openApiSpecUrl || ''
    }

    /**
     * Synchronously gets the service host
     */
    const getServiceHostSync = (): string => {
        if (configCache.value?.serviceHost) {
            return configCache.value.serviceHost
        }
        // Check selected service host from in-memory state
        const selectedHost = getSelectedServiceHost.value
        if (selectedHost?.baseUrl?.trim()) {
            return selectedHost.baseUrl.trim()
        }
        // Fallback to env var
        return import.meta.env.VITE_SERVICE_HOST || ''
    }

    /**
     * Synchronously gets the clerk key from selected service host, config cache, or fallbacks
     */
    const getClerkKeySync = (): string => {
        if (configCache.value?.clerkKey) {
            return configCache.value.clerkKey
        }
        // Check selected service host's clerk key
        const selectedHost = getSelectedServiceHost.value
        if (selectedHost?.clerkKey?.trim()) {
            return selectedHost.clerkKey.trim()
        }
        // Fallback to legacy localStorage store
        const storedKey = localStorageService.getClerkKey()
        if (storedKey && storedKey.trim()) {
            return storedKey.trim()
        }
        // Fallback to env var
        return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''
    }

    /**
     * Synchronously gets the OpenAPI spec URL
     */
    const getOpenApiSpecUrlSync = (): string => {
        // Use cached config if available
        if (configCache.value?.openApiSpecUrl) {
            return configCache.value.openApiSpecUrl
        }
        
        // Check environment variable
        if (import.meta.env.VITE_OPENAPI_SPEC_URL) {
            return import.meta.env.VITE_OPENAPI_SPEC_URL
        }
        
        // Check for selected service host from in-memory state
        const selectedHost = getSelectedServiceHost.value
        if (selectedHost?.baseUrl) {
            const openApiPath = normalizeOpenApiPath(selectedHost.openApiPath || '/openapi.json')
            return `${selectedHost.baseUrl}${openApiPath}`
        }
        
        // Fallback to constructing from service host
        const serviceHost = getServiceHostSync()
        return serviceHost ? `${serviceHost}/openapi.json` : ''
    }

    /**
     * Checks if the clerk key is loaded from config.json
     */
    const isClerkKeyFromConfig = (): boolean => {
        return !!(configCache.value?.clerkKey && configCache.value.clerkKey.trim())
    }

    /**
     * Checks if the clerk key is available from environment variable
     */
    const isClerkKeyFromEnv = (): boolean => {
        if (isClerkKeyFromConfig()) {
            return false
        }
        const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
        return !!(envKey && envKey.trim())
    }

    /**
     * Load service hosts list from localStorage and update in-memory state
     */
    const loadServiceHosts = (): void => {
        serviceHosts.value = localStorageService.getServiceHosts()
        // Also update selected ID from localStorage
        const storedSelectedId = localStorageService.getSelectedServiceHostId()
        if (storedSelectedId !== selectedServiceHostId.value) {
            selectedServiceHostId.value = storedSelectedId
        }
    }

    /**
     * Load OpenAPI spec for the selected service host
     */
    const loadOpenApiSpec = async (): Promise<void> => {
        // Prevent double loading
        if (isLoadingOpenApi.value) return
        
        const selectedHost = getSelectedServiceHost.value
        if (selectedHost) {
            isLoadingOpenApi.value = true
            try {
                clearConfigCache()
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
    const handleHostSelected = async (host: ServiceHost | null): Promise<void> => {
        // Update in-memory state
        selectedServiceHostId.value = host?.id || null
        // Update localStorage
        localStorageService.setSelectedServiceHostId(host?.id || null)
        // Reload OpenAPI spec and other settings (watch will also trigger, but this ensures immediate load)
        await loadOpenApiSpec()
    }

    /**
     * Handle service host addition
     */
    const handleHostAdded = (): void => {
        // Reload from localStorage to get the newly added host
        loadServiceHosts()
    }

    /**
     * Handle service host removal
     */
    const handleHostRemoved = (): void => {
        // Reload from localStorage to get updated list
        loadServiceHosts()
        // Update in-memory selected ID if it was cleared
        const storedSelectedId = localStorageService.getSelectedServiceHostId()
        selectedServiceHostId.value = storedSelectedId
        // If the removed host was selected, clear OpenAPI state
        if (!getSelectedServiceHost.value) {
            openApiStore.loading = false
            openApiStore.openApiSpec = null
            openApiStore.error = null
        }
    }

    /**
     * Handle direct form connection (when no service hosts exist)
     */
    const handleDirectConnect = async (baseUrl: string, openApiPath?: string): Promise<void> => {
        if (!baseUrl.trim()) return
        
        // Normalize OpenAPI path if provided
        const normalizedPath = openApiPath?.trim() 
            ? normalizeOpenApiPath(openApiPath.trim())
            : undefined
        
        // Create a service host from the input
        const newHost: ServiceHost = {
            id: crypto.randomUUID(),
            baseUrl: baseUrl.trim(),
            openApiPath: normalizedPath,
        }
        
        // Add service host to localStorage
        localStorageService.addServiceHost(newHost)
        localStorageService.setSelectedServiceHostId(newHost.id)
        
        // Update in-memory state
        serviceHosts.value = localStorageService.getServiceHosts()
        selectedServiceHostId.value = newHost.id
        
        // Load the OpenAPI spec
        clearConfigCache()
        await openApiStore.loadSpec()
    }

    /**
     * Save clerk key for the selected service host
     */
    const saveClerkKeyForSelectedHost = (key: string): void => {
        const selectedHost = getSelectedServiceHost.value
        if (!selectedHost) return
        
        // Update the service host with the new clerk key
        const updatedHost: ServiceHost = {
            ...selectedHost,
            clerkKey: key.trim() || undefined
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
    const clearClerkKeyForSelectedHost = (): void => {
        saveClerkKeyForSelectedHost('')
    }

    /**
     * Initialize - loads all settings from localStorage on init
     */
    const initialize = (): void => {
        // Load service hosts and selected ID from localStorage
        serviceHosts.value = localStorageService.getServiceHosts()
        selectedServiceHostId.value = localStorageService.getSelectedServiceHostId()
    }

    // Watch for selected service host changes and reload OpenAPI and other settings
    watch(selectedServiceHostId, async (newId, oldId) => {
        if (newId !== oldId) {
            // Reload OpenAPI spec when selected service host changes
            await loadOpenApiSpec()
        }
    })

    return {
        // State
        serviceHosts,
        selectedServiceHostId,
        configCache,
        // Computed
        hasServiceHost,
        getSelectedServiceHost,
        // Config loading
        loadConfig,
        clearConfigCache,
        getConfigJsonPath,
        // Service host
        getServiceHost,
        getServiceHostSync,
        // Service host management
        loadServiceHosts,
        loadOpenApiSpec,
        handleHostSelected,
        handleHostAdded,
        handleHostRemoved,
        handleDirectConnect,
        initialize,
        // Clerk key
        getClerkKey,
        getClerkKeySync,
        isClerkKeyFromConfig,
        isClerkKeyFromEnv,
        saveClerkKeyForSelectedHost,
        clearClerkKeyForSelectedHost,
        // OpenAPI spec URL
        getOpenApiSpecUrl,
        getOpenApiSpecUrlSync,
    }
})
