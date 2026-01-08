import { ViteSSG } from 'vite-ssg'
import { createPinia } from 'pinia'

import { clerkPlugin } from '@clerk/vue'
import { dark } from '@clerk/themes'

import App from './App.vue'
import { routes } from '@/router'
import { useConfigStore } from '@/stores/config'

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
        // Set up Pinia
        const pinia = createPinia()
        app.use(pinia)
        
        // Initialize config store (loads all settings from localStorage and config.json)
        const configStore = useConfigStore()
        await configStore.initialize()
        
        // Only initialize Clerk if not disabled and key is available
        if (configStore.isClerkEnabled) {
            const publishableKey = configStore.clerkPublishableKey
            
            if (publishableKey) {
                app.use(clerkPlugin, {
                    publishableKey: publishableKey,
                    appearance: {
                        theme: dark,
                    },
                });
            }
        } 
    }
);
