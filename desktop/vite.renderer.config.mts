import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// Set environment variable to disable configJson for desktop
process.env.VITE_DISABLE_CONFIG_JSON = 'true';

// https://vitejs.dev/config
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '..','core','src'),
        },
    },
});