import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'main',
        component: () => import('@/views/Main.vue'),
    },
    {
        path: '/spec',
        name: 'spec-viewer',
        component: () => import('@/views/SpecViewer.vue'),
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFound.vue'),
    },
];
