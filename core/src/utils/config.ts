interface Config {
    serviceHost?: string
    clerkKey?: string
    openApiSpecUrl?: string
}

let configCache: Config | null = null

/**
 * Gets the config.json path from environment variable or defaults to '/config.json'
 */
export function getConfigJsonPath(): string {
    return import.meta.env.VITE_CONFIG_JSON_PATH || '/openapi-studio-config.json'
}

/**
 * Loads configuration from config.json (path configurable via VITE_CONFIG_JSON_PATH)
 * Falls back to environment variables if config.json is not available
 * Applies all defaulting logic to ensure a fully resolved config
 */
export async function loadConfig(): Promise<Config> {
    if (configCache !== null) {
        return configCache
    }

    let config: Config = {}

    if (!import.meta.env.SSR) {
        const configPath = getConfigJsonPath()
        try {
            const response = await fetch(configPath)
            if (response.ok) {
                config = await response.json() as Config
            }
        } catch (error) {
            console.warn(`Failed to load config from ${configPath}, falling back to environment variables:`, error)
        }
    }

    // Apply defaults from environment variables for missing values
    if (!config.serviceHost) {
        config.serviceHost = import.meta.env.VITE_SERVICE_HOST
    }
    if (!config.clerkKey) {
        config.clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
    }
    if (!config.openApiSpecUrl) {
        config.openApiSpecUrl = import.meta.env.VITE_OPENAPI_SPEC_URL
    }

    // If openApiSpecUrl is still not set, construct it from serviceHost
    if (!config.openApiSpecUrl) {
        config.openApiSpecUrl = [import.meta.env.VITE_SERVICE_HOST, 'openapi.json'].filter(Boolean).join('/')
    }

    configCache = config
    return configCache
}

/**
 * Gets the service host from config.json or environment variable
 */
export async function getServiceHost(): Promise<string> {
    const config = await loadConfig()
    return config.serviceHost || ''
}

/**
 * Gets the clerk key from config.json or environment variable
 */
export async function getClerkKey(): Promise<string> {
    const config = await loadConfig()
    return config.clerkKey || ''
}

/**
 * Gets the OpenAPI spec URL from config.json or environment variable
 */
export async function getOpenApiSpecUrl(): Promise<string> {
    const config = await loadConfig()
    return config.openApiSpecUrl || ''
}

/**
 * Synchronously gets the service host (uses cached config if available, otherwise env var)
 * Note: This will return env var if config hasn't been loaded yet
 */
export function getServiceHostSync(): string {
    if (configCache?.serviceHost) {
        return configCache.serviceHost
    }
    // Fallback to env var if config not loaded yet
    return import.meta.env.VITE_SERVICE_HOST || ''
}

/**
 * Synchronously gets the clerk key (uses cached config if available, otherwise env var)
 * Note: This will return env var if config hasn't been loaded yet
 */
export function getClerkKeySync(): string {
    if (configCache?.clerkKey) {
        return configCache.clerkKey
    }
    // Fallback to env var if config not loaded yet
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''
}

/**
 * Synchronously gets the OpenAPI spec URL (uses cached config if available, otherwise env var or constructed)
 * Note: This will return env var or constructed URL if config hasn't been loaded yet
 */
export function getOpenApiSpecUrlSync(): string {
    if (configCache?.openApiSpecUrl) {
        return configCache.openApiSpecUrl
    }
    
    // Fallback logic if config not loaded yet
    if (import.meta.env.VITE_OPENAPI_SPEC_URL) {
        return import.meta.env.VITE_OPENAPI_SPEC_URL
    }
    
    // Fallback to constructing from service host
    const serviceHost = import.meta.env.VITE_SERVICE_HOST || ''
    return serviceHost ? `${serviceHost}/openapi.json` : ''
}

/**
 * Checks if the clerk key is loaded from config.json
 */
export function isClerkKeyFromConfig(): boolean {
    return !!(configCache?.clerkKey && configCache.clerkKey.trim())
}

/**
 * Checks if the clerk key is available from environment variable
 * (only if not from config.json)
 */
export function isClerkKeyFromEnv(): boolean {
    if (isClerkKeyFromConfig()) {
        return false
    }
    const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
    return !!(envKey && envKey.trim())
}
