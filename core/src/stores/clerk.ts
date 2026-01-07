import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useConfigStore } from '@/stores/config'

export type ClerkKeySource = 'localStorage' | 'config.json' | 'env' | null

export const useClerkStore = defineStore('clerk', () => {
    // State
    const clerkKey = ref<string>('')

    // Get composables
    const localStorage = useLocalStorage()
    const config = useConfigStore()

    // Getters
    const hasClerkKey = computed((): boolean => {
        // Get key from config (which checks selected service host, config.json, localStorage, env)
        const key = config.getClerkKeySync()
        return !!(key && key.trim())
    })

    const getClerkKey = computed((): string => {
        // Get key from config (which checks selected service host, config.json, localStorage, env)
        return config.getClerkKeySync()
    })

    const hasSavedClerkKey = computed((): boolean => {
        // Check if selected service host has a clerk key
        const selectedHost = config.getSelectedServiceHost
        if (selectedHost?.clerkKey?.trim()) {
            return true
        }
        // Fallback to legacy localStorage check
        return localStorage.hasSavedClerkKey()
    })

    /**
     * Determines the source of the Clerk key
     */
    const clerkKeySource = computed((): ClerkKeySource => {
        // Check selected service host first
        const selectedHost = config.getSelectedServiceHost
        if (selectedHost?.clerkKey?.trim()) {
            return 'localStorage' // Stored with service host (in localStorage)
        }

        // Check config.json
        if (config.isClerkKeyFromConfig()) {
            return 'config.json'
        }

        // Check environment variable
        if (config.isClerkKeyFromEnv()) {
            return 'env'
        }

        // Fallback to legacy localStorage
        if (!import.meta.env.SSR) {
            const storedKey = localStorage.getClerkKey()
            if (storedKey && storedKey.trim()) {
                return 'localStorage'
            }
        }

        return null
    })

    /**
     * Returns true if the key is loaded from config.json or env var (not editable)
     */
    const isClerkKeyReadOnly = computed((): boolean => {
        const source = clerkKeySource.value
        return source === 'config.json' || source === 'env'
    })

    // Actions
    function loadClerkKey() {
        // Get the key from selected service host, config.json, localStorage, or env var for display
        const key = getClerkKey.value
        if (key) {
            clerkKey.value = key
        } else {
            clerkKey.value = ''
        }
    }

    function saveClerkKey() {
        // Save to selected service host if available, otherwise legacy localStorage
        const selectedHost = config.getSelectedServiceHost
        if (selectedHost) {
            if (clerkKey.value.trim()) {
                config.saveClerkKeyForSelectedHost(clerkKey.value)
            } else {
                config.clearClerkKeyForSelectedHost()
            }
        } else {
            // Fallback to legacy localStorage
            if (clerkKey.value.trim()) {
                localStorage.saveClerkKey(clerkKey.value)
            } else {
                localStorage.clearClerkKey()
            }
        }
        // Refresh the browser to apply the new Clerk key
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

    function clearClerkKey() {
        clerkKey.value = ''
        // Clear from selected service host if available, otherwise legacy localStorage
        const selectedHost = config.getSelectedServiceHost
        if (selectedHost) {
            config.clearClerkKeyForSelectedHost()
        } else {
            localStorage.clearClerkKey()
        }
        // Refresh the browser
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

    // Watch for selected service host changes to reload clerk key
    watch(() => config.getSelectedServiceHost, () => {
        loadClerkKey()
    }, { deep: true })

    return {
        clerkKey,
        hasClerkKey,
        getClerkKey,
        hasSavedClerkKey,
        clerkKeySource,
        isClerkKeyReadOnly,
        loadClerkKey,
        saveClerkKey,
        clearClerkKey,
    }
})
