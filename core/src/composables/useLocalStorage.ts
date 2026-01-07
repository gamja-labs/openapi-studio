const LOCAL_STORAGE_PREFIX = 'o-s-'

// Storage keys
const STORAGE_KEYS = {
    CLERK_KEY: 'clerk-publishable-key',
    SERVICE_HOSTS: 'service-hosts',
    SELECTED_SERVICE_HOST_ID: 'selected-service-host-id',
    SIDEBAR_COLLAPSED: 'sidebar-collapsed',
    EXAMPLES_SIDEBAR_COLLAPSED: 'examples-sidebar-collapsed',
    ENDPOINTS_SIDEBAR_WIDTH: 'endpoints-sidebar-width',
    EXAMPLES_SIDEBAR_WIDTH: 'examples-sidebar-width',
} as const

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

function getStorageKey(key: string): string {
    return LOCAL_STORAGE_PREFIX + key
}   

// Service host type
export type ServiceHost = {
    id: string
    baseUrl: string
    openApiPath?: string
    label?: string
    clerkKey?: string
}

// Generic getter with JSON parsing
function getItem<T>(key: StorageKey, defaultValue: T): T {
    if (import.meta.env.SSR) return defaultValue
    
    try {
        const item = localStorage.getItem(getStorageKey(key))
        if (item === null) return defaultValue
        return JSON.parse(item) as T
    } catch (error) {
        console.error(`Failed to parse localStorage item "${key}":`, error)
        return defaultValue
    }
}

// Generic setter with JSON stringifying
function setItem<T>(key: StorageKey, value: T): void {
    if (import.meta.env.SSR) return
    
    try {
        localStorage.setItem(getStorageKey(key), JSON.stringify(value))
    } catch (error) {
        console.error(`Failed to save localStorage item "${key}":`, error)
    }
}

// Generic remover
function removeItem(key: StorageKey): void {
    if (import.meta.env.SSR) return
    
    try {
        localStorage.removeItem(getStorageKey(key))
    } catch (error) {
        console.error(`Failed to remove localStorage item "${key}":`, error)
    }
}

/**
 * LocalStorage composable that manages all localStorage operations
 * This composable only handles read/write operations to localStorage, no in-memory state
 */
export function useLocalStorage() {
    // Actions - Clerk Key
    function saveClerkKey(key: string) {
        if (key.trim()) {
            setItem(STORAGE_KEYS.CLERK_KEY, key.trim())
        } else {
            clearClerkKey()
        }
    }

    function clearClerkKey() {
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

    // Actions - Service Hosts List
    function getServiceHosts(): ServiceHost[] {
        return getItem<ServiceHost[]>(STORAGE_KEYS.SERVICE_HOSTS, [])
    }

    function saveServiceHosts(hosts: ServiceHost[]): void {
        setItem(STORAGE_KEYS.SERVICE_HOSTS, hosts)
    }

    function addServiceHost(host: ServiceHost): void {
        const hosts = getServiceHosts()
        // Check if host with same baseUrl already exists
        const existingIndex = hosts.findIndex(h => h.baseUrl === host.baseUrl)
        if (existingIndex >= 0) {
            // Update existing
            hosts[existingIndex] = host
        } else {
            // Add new
            hosts.push(host)
        }
        saveServiceHosts(hosts)
    }

    function removeServiceHost(id: string): void {
        const hosts = getServiceHosts()
        const filtered = hosts.filter(h => h.id !== id)
        saveServiceHosts(filtered)
        
        // If the removed host was selected, clear selection
        const selectedId = getSelectedServiceHostId()
        if (selectedId === id) {
            clearSelectedServiceHostId()
        }
    }

    function getSelectedServiceHostId(): string | null {
        return getItem<string | null>(STORAGE_KEYS.SELECTED_SERVICE_HOST_ID, null)
    }

    function setSelectedServiceHostId(id: string | null): void {
        if (id) {
            setItem(STORAGE_KEYS.SELECTED_SERVICE_HOST_ID, id)
        } else {
            removeItem(STORAGE_KEYS.SELECTED_SERVICE_HOST_ID)
        }
    }

    function clearSelectedServiceHostId(): void {
        removeItem(STORAGE_KEYS.SELECTED_SERVICE_HOST_ID)
    }

    function getSelectedServiceHost(): ServiceHost | null {
        const selectedId = getSelectedServiceHostId()
        if (!selectedId) return null
        
        const hosts = getServiceHosts()
        return hosts.find(h => h.id === selectedId) || null
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

    return {
        // Clerk Key
        saveClerkKey,
        clearClerkKey,
        getClerkKey,
        hasClerkKey,
        hasSavedClerkKey,
        // Service Hosts List
        getServiceHosts,
        saveServiceHosts,
        addServiceHost,
        removeServiceHost,
        getSelectedServiceHostId,
        setSelectedServiceHostId,
        clearSelectedServiceHostId,
        getSelectedServiceHost,
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
    }
}
