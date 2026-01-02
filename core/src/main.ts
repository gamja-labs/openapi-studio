import { ViteSSG } from 'vite-ssg'
import { createPinia } from 'pinia'

import { clerkPlugin } from '@clerk/vue'
import { dark } from '@clerk/themes'

import App from './App.vue'
import { routes } from '@/router'
import { useClerkStore } from '@/stores/clerk'
import { loadConfig, getServiceHost } from '@/utils/config'

import '@fontsource-variable/open-sans';
import '@fontsource-variable/chivo-mono';
import '@/styles/base.scss';

const BUILD_ID = import.meta.env.VITE_BUILD_ID

if (!BUILD_ID) {
    throw new Error('Missing Build ID')
}

export const createApp = ViteSSG(
    App,
    {
        routes,
    },
    async ({ app }) => {
        // Load config from config.json (path configurable via VITE_CONFIG_JSON_PATH)
        await loadConfig()

        // Set up Pinia
        const pinia = createPinia()
        app.use(pinia)

        // Get Clerk key from store
        const clerkStore = useClerkStore()
        const publishableKey = clerkStore.getClerkKey
        
        if (publishableKey) {
            app.use(clerkPlugin, {
                publishableKey: publishableKey,
                appearance: {
                    theme: dark,
                },
            });
        } 
    }
);
