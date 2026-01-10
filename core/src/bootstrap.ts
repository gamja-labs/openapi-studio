import type { App } from 'vue';
import { useConfigStore } from './stores/config';
import { dark } from '@clerk/themes';
import { clerkPlugin } from '@clerk/vue';
import { createPinia } from 'pinia';

export async function bootstrap(app: App<Element>) {
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

