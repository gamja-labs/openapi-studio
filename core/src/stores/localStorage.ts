import { defineStore } from 'pinia'
import { ref } from 'vue'

// Storage keys
const STORAGE_KEYS = {
    CLERK_KEY: 'clerk-publishable-key',
} as const

// Generic getter with JSON parsing
function getItem<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(key)
        if (item === null) return defaultValue
        return JSON.parse(item) as T
    } catch (error) {
        console.error(`Failed to parse localStorage item "${key}":`, error)
        return defaultValue
    }
}

// Generic setter with JSON stringifying
function setItem<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
        console.error(`Failed to save localStorage item "${key}":`, error)
    }
}

// Generic remover
function removeItem(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch (error) {
        console.error(`Failed to remove localStorage item "${key}":`, error)
    }
}

export const useLocalStorageStore = defineStore('localStorage', () => {
    // State for Clerk key
    const clerkKey = ref<string>('')

    // Actions - Clerk Key
    function loadClerkKey() {
        clerkKey.value = getItem<string>(STORAGE_KEYS.CLERK_KEY, '')
    }

    function saveClerkKey(key: string) {
        if (key.trim()) {
            clerkKey.value = key.trim()
            setItem(STORAGE_KEYS.CLERK_KEY, key.trim())
        } else {
            clearClerkKey()
        }
    }

    function clearClerkKey() {
        clerkKey.value = ''
        removeItem(STORAGE_KEYS.CLERK_KEY)
    }

    function getClerkKey(): string {
        return getItem<string>(STORAGE_KEYS.CLERK_KEY, '')
    }

    function hasClerkKey(): boolean {
        const key = getClerkKey()
        return !!(key && key.trim())
    }

    function hasSavedClerkKey(): boolean {
        return hasClerkKey()
    }

    // Initialize all data on store creation
    function initialize() {
        loadClerkKey()
    }

    return {
        // State
        clerkKey,
        // Clerk Key
        loadClerkKey,
        saveClerkKey,
        clearClerkKey,
        getClerkKey,
        hasClerkKey,
        hasSavedClerkKey,
        // Initialization
        initialize,
    }
})
