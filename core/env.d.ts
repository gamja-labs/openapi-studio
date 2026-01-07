/// <reference types="vite/client" />


interface ImportMetaEnv {
    VITE_SERVICE_HOST: string,
    VITE_CLERK_PUBLISHABLE_KEY: string,
    VITE_BUILD_ID: string,
    VITE_OPENAPI_SPEC_URL?: string,
    VITE_CONFIG_JSON_PATH?: string
    VITE_ENABLE_SERVICE_HOST_SELECTION?: string,
    VITE_ENABLE_CLERK_PUB_KEY_SELECTION?: string,
    VITE_DISABLE_CLERK?: string
    // more env variables...
}