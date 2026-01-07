import { defineStore } from 'pinia'
import { ref } from 'vue'

// Storage keys
const STORAGE_KEYS = {
    CLERK_KEY: 'clerk-publishable-key',
    SIDEBAR_COLLAPSED: 'sidebar-collapsed',
    EXAMPLES_SIDEBAR_COLLAPSED: 'examples-sidebar-collapsed',
    ENDPOINTS_SIDEBAR_WIDTH: 'endpoints-sidebar-width',
    EXAMPLES_SIDEBAR_WIDTH: 'examples-sidebar-width',
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

    // Actions - Sidebar States
    function loadSidebarCollapsed(): boolean {
        return getItem<boolean>(STORAGE_KEYS.SIDEBAR_COLLAPSED, false)
    }

    function saveSidebarCollapsed(collapsed: boolean): void {
        setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed)
    }

    function loadExamplesSidebarCollapsed(): boolean {
        return getItem<boolean>(STORAGE_KEYS.EXAMPLES_SIDEBAR_COLLAPSED, false)
    }

    function saveExamplesSidebarCollapsed(collapsed: boolean): void {
        setItem(STORAGE_KEYS.EXAMPLES_SIDEBAR_COLLAPSED, collapsed)
    }

    // Actions - Sidebar Widths
    function loadEndpointsSidebarWidth(): number {
        return getItem<number>(STORAGE_KEYS.ENDPOINTS_SIDEBAR_WIDTH, 500)
    }

    function saveEndpointsSidebarWidth(width: number): void {
        setItem(STORAGE_KEYS.ENDPOINTS_SIDEBAR_WIDTH, width)
    }

    function loadExamplesSidebarWidth(): number {
        return getItem<number>(STORAGE_KEYS.EXAMPLES_SIDEBAR_WIDTH, 400)
    }

    function saveExamplesSidebarWidth(width: number): void {
        setItem(STORAGE_KEYS.EXAMPLES_SIDEBAR_WIDTH, width)
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
        // Sidebar States
        loadSidebarCollapsed,
        saveSidebarCollapsed,
        loadExamplesSidebarCollapsed,
        saveExamplesSidebarCollapsed,
        // Sidebar Widths
        loadEndpointsSidebarWidth,
        saveEndpointsSidebarWidth,
        loadExamplesSidebarWidth,
        saveExamplesSidebarWidth,
        // Initialization
        initialize,
    }
})
