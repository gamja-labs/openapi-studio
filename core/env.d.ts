/// <reference types="vite/client" />


interface ImportMetaEnv {
    VITE_SERVICE_HOST: string,
    VITE_CLERK_PUBLISHABLE_KEY: string,
    VITE_BUILD_ID: string,
    VITE_OPENAPI_SPEC_URL?: string,
    VITE_CONFIG_JSON_PATH?: string
    // more env variables...
}