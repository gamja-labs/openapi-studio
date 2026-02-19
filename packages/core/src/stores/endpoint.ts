import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type RequestHistoryItem = {
    id: string
    timestamp: Date
    method: string
    path: string
    url: string
    requestBody: any
    requestQuery: Record<string, any>
    requestUrlParams: Record<string, any>
    headers: Record<string, string>
    response: any
    responseError: string | null
    status?: number
    statusText?: string
    authScheme: string | null
}

export type EndpointFormState = {
    requestQuery: Record<string, any>
    requestUrlParams: Record<string, any>
    requestBody: string
    selectedAuthScheme: string | null
}

export const useEndpointStore = defineStore('endpoint', () => {
    // Selected endpoint
    const selectedPath = ref<string | null>(null)
    const selectedMethod = ref<string | null>(null)
    
    // Auth scheme selection
    const selectedAuthScheme = ref<string | null>(null)
    
    // Security scheme menu state
    const authMenuOpen = ref<boolean>(false)
    
    // Request history (all endpoints)
    const requestHistory = ref<RequestHistoryItem[]>([])
    
    // Form state per endpoint (dirty state preservation)
    const endpointFormState = ref<Map<string, EndpointFormState>>(new Map())
    
    // Helper to get endpoint key
    const getEndpointKey = (path: string | null, method: string | null): string | null => {
        if (!path || !method) return null
        return `${method}:${path}`
    }
    
    // Get current endpoint key
    const currentEndpointKey = computed(() => {
        return getEndpointKey(selectedPath.value, selectedMethod.value)
    })
    
    // Get form state for current endpoint
    const currentFormState = computed<EndpointFormState | null>(() => {
        const key = currentEndpointKey.value
        if (!key) return null
        return endpointFormState.value.get(key) || null
    })
    
    // Get filtered request history for current endpoint
    const filteredRequestHistory = computed(() => {
        if (!selectedPath.value || !selectedMethod.value) {
            return []
        }
        return requestHistory.value.filter(item => 
            item.path === selectedPath.value && item.method === selectedMethod.value
        )
    })
    
    // Actions
    function setSelectedEndpoint(path: string | null, method: string | null) {
        selectedPath.value = path
        selectedMethod.value = method
    }
    
    function setSelectedAuthScheme(scheme: string | null) {
        selectedAuthScheme.value = scheme
    }
    
    function toggleSelectedAuthScheme(scheme: string | null) {
        if (scheme === null) {
            selectedAuthScheme.value = null
        } else if (selectedAuthScheme.value === scheme) {
            selectedAuthScheme.value = null
        } else {
            selectedAuthScheme.value = scheme
        }
    }
    
    function toggleAuthMenu() {
        authMenuOpen.value = !authMenuOpen.value
    }
    
    function openAuthMenu() {
        authMenuOpen.value = true
    }
    
    function closeAuthMenu() {
        authMenuOpen.value = false
    }
    
    function saveEndpointFormState(
        path: string,
        method: string,
        formState: EndpointFormState
    ) {
        const key = getEndpointKey(path, method)
        if (!key) return
        endpointFormState.value.set(key, { ...formState })
    }
    
    function getEndpointFormState(
        path: string,
        method: string
    ): EndpointFormState | null {
        const key = getEndpointKey(path, method)
        if (!key) return null
        const state = endpointFormState.value.get(key) || null
        console.log('getEndpointFormState', key, state);
        return state
    }
    
    function clearEndpointFormState(path: string, method: string) {
        const key = getEndpointKey(path, method)
        if (!key) return
        endpointFormState.value.delete(key)
    }
    
    function addRequestHistory(item: RequestHistoryItem) {
        requestHistory.value.unshift(item)
    }
    
    function clearEndpointHistory(path: string, method: string) {
        requestHistory.value = requestHistory.value.filter(item => 
            !(item.path === path && item.method === method)
        )
    }
    
    function clearAllHistory() {
        requestHistory.value = []
    }
    
    return {
        // State
        selectedPath,
        selectedMethod,
        selectedAuthScheme,
        authMenuOpen,
        requestHistory,
        endpointFormState,
        // Computed
        currentEndpointKey,
        currentFormState,
        filteredRequestHistory,
        // Actions
        setSelectedEndpoint,
        setSelectedAuthScheme,
        toggleSelectedAuthScheme,
        toggleAuthMenu,
        openAuthMenu,
        closeAuthMenu,
        saveEndpointFormState,
        getEndpointFormState,
        clearEndpointFormState,
        addRequestHistory,
        clearEndpointHistory,
        clearAllHistory,
        // Helpers
        getEndpointKey,
    }
})
