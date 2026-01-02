import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorageStore } from './localStorage'
import { getClerkKeySync, isClerkKeyFromConfig, isClerkKeyFromEnv } from '@/utils/config'

export type ClerkKeySource = 'localStorage' | 'config.json' | 'env' | null

export const useClerkStore = defineStore('clerk', () => {
    // State
    const clerkKey = ref<string>('')

    // Get localStorage store
    const localStorageStore = useLocalStorageStore()

    // Getters
    const hasClerkKey = computed((): boolean => {
        // Try localStorage first
        if (!import.meta.env.SSR) {
            const storedKey = localStorageStore.getClerkKey()
            if (storedKey && storedKey.trim()) {
                return true
            }
        }

        // Try config.json
        const configKey = getClerkKeySync()
        if (configKey && configKey.trim()) {
            return true
        }

        // Fallback to environment variable
        const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
        return !!(envKey && envKey.trim())
    })

    const getClerkKey = computed((): string => {
        // Try localStorage first
        if (!import.meta.env.SSR) {
            const storedKey = localStorageStore.getClerkKey()
            if (storedKey && storedKey.trim()) {
                return storedKey.trim()
            }
        }

        // Try config.json
        const configKey = getClerkKeySync()
        if (configKey && configKey.trim()) {
            return configKey.trim()
        }

        // Fallback to environment variable
        const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
        if (envKey && envKey.trim()) {
            return envKey.trim()
        }

        return ''
    })

    const hasSavedClerkKey = computed((): boolean => {
        return localStorageStore.hasSavedClerkKey()
    })

    /**
     * Determines the source of the Clerk key
     */
    const clerkKeySource = computed((): ClerkKeySource => {
        // Check localStorage first
        if (!import.meta.env.SSR) {
            const storedKey = localStorageStore.getClerkKey()
            if (storedKey && storedKey.trim()) {
                return 'localStorage'
            }
        }

        // Check config.json
        if (isClerkKeyFromConfig()) {
            return 'config.json'
        }

        // Check environment variable
        if (isClerkKeyFromEnv()) {
            return 'env'
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
        localStorageStore.loadClerkKey()
        // If localStorage has a key, use it
        if (localStorageStore.clerkKey && localStorageStore.clerkKey.trim()) {
            clerkKey.value = localStorageStore.clerkKey
        } else {
            // Otherwise, try to get from config.json or env var for display
            const key = getClerkKey.value
            if (key) {
                clerkKey.value = key
            } else {
                clerkKey.value = ''
            }
        }
    }

    function saveClerkKey() {
        if (clerkKey.value.trim()) {
            localStorageStore.saveClerkKey(clerkKey.value)
        } else {
            localStorageStore.clearClerkKey()
        }
        // Refresh the browser to apply the new Clerk key
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

    function clearClerkKey() {
        clerkKey.value = ''
        localStorageStore.clearClerkKey()
        // Refresh the browser
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

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
