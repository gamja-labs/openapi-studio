import { createApp } from 'vue';
import { routes } from '@openapi-studio/core/src/router';
import { createRouter, createMemoryHistory } from 'vue-router';

import '@openapi-studio/core/src/setup';

console.log('starting...');
export const router = createRouter({
    history: createMemoryHistory(),
    routes,
})

import { bootstrap } from '@openapi-studio/core/src/bootstrap';
import DesktopApp from './DesktopApp.vue';
import { createPinia } from 'pinia';

const app = createApp(DesktopApp);
// Set up Pinia
const pinia = createPinia();
app.use(pinia);
app.use(router);
bootstrap(app);
app.mount('#app');


