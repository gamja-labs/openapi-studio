import { ref } from 'vue'
import type { Config } from '@/utils/types'

/**
 * Config JSON Composable
 * 
 * Provides functionality to load configuration from config.json file.
 * Handles fetching, caching, and path resolution.
 */
export function useConfigJson() {
    const config = ref<Config | null>(null)

    /**
     * Clears the config cache to force reload
     */
    const clearConfigCache = (): void => {
        config.value = null
    }

    /**
    * Gets the config.json path from environment variable or defaults to '/openapi-studio-config.json'
    */
    const getConfigJsonPath = () => {
        return import.meta.env.VITE_CONFIG_JSON_PATH || '/openapi-studio-config.json'
    }

    /**
     * Loads configuration from config.json (path configurable via VITE_CONFIG_JSON_PATH)
     * Returns null if config.json is not available or fails to load
     * Can be disabled via VITE_DISABLE_CONFIG_JSON environment variable
     */
    const loadConfigJson = async () => {
        if (import.meta.env.SSR) {
            return;
        }
        // Skip loading if disabled via environment variable
        if (import.meta.env.VITE_DISABLE_CONFIG_JSON === 'true') {
            console.log('Config JSON loading is disabled via VITE_DISABLE_CONFIG_JSON')
            return;
        }
        const configPath = getConfigJsonPath()
        try {
            const response = await fetch(configPath)
            if (response.ok) {
                const result = await response.json() as Config
                console.log(`Loaded config from ${configPath}`)
                config.value = result;
            }
        } catch (error) {
            // Failed to load config from configPath
            console.log(`Failed to load config from ${configPath}:`, error)
            config.value = null;
        }
    }

    return {
        config,
        loadConfigJson,
        clearConfigCache,
        getConfigJsonPath,
    }
}
