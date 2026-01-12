import { ViteSSG } from 'vite-ssg'
import App from './App.vue'
import { routes } from '@/router'
import { bootstrap } from './bootstrap'
import { createPinia } from 'pinia';

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
        const pinia = createPinia();
        app.use(pinia);
        await bootstrap(app);
    }
);
