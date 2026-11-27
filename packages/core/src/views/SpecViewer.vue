<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Download, ArrowLeft } from '@lucide/vue';
import { useOpenApiStore } from '@/stores/openapi';
import { useConfigStore } from '@/stores/config';
import { useTheme } from '@/composables/useTheme';

const router = useRouter();
const openApiStore = useOpenApiStore();
const config = useConfigStore();
const { theme } = useTheme();

const openApiSpec = computed(() => openApiStore.openApiSpec);
const loading = computed(() => openApiStore.loading);
const error = computed(() => openApiStore.error);
const openApiTitle = computed(() => openApiStore.openApiTitle);
const openApiVersion = computed(() => openApiStore.openApiVersion);
const openApiSpecUrl = computed(() => openApiStore.openApiSpecUrl);

const downloadSpec = () => {
    if (!openApiSpec.value) return;

    const jsonString = JSON.stringify(openApiSpec.value, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openapi-spec.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

onMounted(async () => {
    if (!openApiSpec.value && !loading.value && !error.value) {
        await config.loadOpenApiSpec();
    }
});
</script>

<template>
    <div class="spec-viewer">
        <header class="spec-head">
            <div class="spec-head-left">
                <button
                    @click="router.push('/')"
                    class="back-btn"
                    title="Back"
                >
                    <ArrowLeft :size="16" :stroke-width="1.5" />
                </button>
                <div class="spec-title-block">
                    <p class="spec-eyebrow">OPENAPI / SPEC</p>
                    <div class="spec-title-row">
                        <h1 class="spec-title">{{ openApiTitle }}</h1>
                        <span v-if="openApiVersion" class="spec-version">v{{ openApiVersion }}</span>
                    </div>
                </div>
            </div>
            <button
                @click="downloadSpec"
                class="download-btn"
                :disabled="!openApiSpec || loading"
                title="Download"
            >
                <Download :size="14" :stroke-width="1.5" />
                <span>Download</span>
            </button>
        </header>

        <div v-if="openApiSpecUrl" class="spec-url-bar">
            <span class="spec-url-label">URL</span>
            <a :href="openApiSpecUrl" target="_blank" rel="noopener noreferrer" class="spec-url-link">
                {{ openApiSpecUrl }}
            </a>
        </div>

        <main class="spec-body">
            <p v-if="loading" class="spec-status">[LOADING SPECIFICATION...]</p>
            <p v-else-if="error" class="spec-status error">[ERROR] {{ error }}</p>
            <p v-else-if="!openApiSpec" class="spec-status">No OpenAPI specification available.</p>
            <div v-else class="spec-json">
                <JsonEditorVue
                    :model-value="openApiSpec"
                    mode="text"
                    :readOnly="true"
                    :mainMenuBar="true"
                    :navigationBar="true"
                    :statusBar="false"
                    :darkTheme="theme === 'dark'"
                />
            </div>
        </main>
    </div>
</template>

<style lang="scss" scoped>
@use '@/styles/shared' as *;

.spec-viewer {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--black);
    color: var(--text-primary);
    overflow: hidden;
}

.spec-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-md $space-lg;
    border-bottom: 1px solid var(--border);
    gap: $space-md;
}

.spec-head-left {
    display: flex;
    align-items: center;
    gap: $space-md;
    min-width: 0;
    flex: 1;
}

.back-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-visible);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 999px;
    @include transition-micro;

    &:hover {
        color: var(--text-display);
        border-color: var(--text-display);
    }
}

.spec-title-block {
    display: flex;
    flex-direction: column;
    gap: $space-2xs;
    min-width: 0;
}

.spec-eyebrow {
    @include type-label;
    color: var(--text-disabled);
    margin: 0;
}

.spec-title-row {
    display: flex;
    align-items: baseline;
    gap: $space-md;
    flex-wrap: wrap;
}

.spec-title {
    @include type-heading;
    color: var(--text-display);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.spec-version {
    @include type-label;
    color: var(--text-secondary);
}

.download-btn {
    @include type-label;
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    height: 32px;
    padding: 0 $space-md;
    background: var(--text-display);
    color: var(--black);
    border: none;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;

    &:hover:not(:disabled) {
        background: var(--text-primary);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

.spec-url-bar {
    display: flex;
    align-items: baseline;
    gap: $space-md;
    padding: $space-sm $space-lg;
    border-bottom: 1px solid var(--border);
}

.spec-url-label {
    @include type-label;
    color: var(--text-disabled);
}

.spec-url-link {
    font-family: $font-data;
    font-size: $caption;
    color: var(--interactive);
    word-break: break-all;
    @include transition-micro(color);

    &:hover {
        color: var(--text-display);
    }
}

.spec-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    padding: $space-lg;
    min-height: 0;
}

.spec-status {
    @include type-label;
    color: var(--text-disabled);
    text-align: center;
    padding: $space-2xl;
    margin: 0;

    &.error {
        color: var(--accent);
    }
}

.spec-json {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;

    :deep(.jsoneditor) {
        border: none;
        background: var(--surface);
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    :deep(.jsoneditor-menu) {
        background: var(--surface-raised);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }

    :deep(.jsoneditor-outer) {
        background: var(--surface);
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
        position: relative;
    }

    :deep(.ace_editor) {
        background: var(--surface) !important;
        color: var(--text-primary) !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
    }

    :deep(.ace_scroller) {
        overflow-y: auto !important;
        overflow-x: auto !important;
    }

    :deep(.ace_gutter) {
        background: var(--surface-raised) !important;
        color: var(--text-disabled) !important;
    }

    :deep(.ace_content) {
        overflow-y: auto !important;
        overflow-x: auto !important;
    }
}
</style>
