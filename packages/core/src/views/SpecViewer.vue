<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Download, ArrowLeft, FileText } from 'lucide-vue-next';
import { useOpenApiStore } from '@/stores/openapi';
import { useConfigStore } from '@/stores/config';

const router = useRouter();
const openApiStore = useOpenApiStore();
const config = useConfigStore();

const openApiSpec = computed(() => openApiStore.openApiSpec);
const loading = computed(() => openApiStore.loading);
const error = computed(() => openApiStore.error);
const openApiTitle = computed(() => openApiStore.openApiTitle);
const openApiVersion = computed(() => openApiStore.openApiVersion);
const openApiSpecUrl = computed(() => openApiStore.openApiSpecUrl);

// Download the spec as JSON file
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

// Load spec if not already loaded
onMounted(async () => {
    if (!openApiSpec.value && !loading.value && !error.value) {
        await config.loadOpenApiSpec();
    }
});
</script>

<template>
    <div class="spec-viewer">
        <header class="spec-viewer-header">
            <div class="header-content">
                <button 
                    @click="router.push('/')" 
                    class="back-button"
                    title="Back to main view"
                >
                    <ArrowLeft :size="20" />
                </button>
                <div class="header-title-section">
                    <FileText :size="24" />
                    <div class="title-row">
                        <h1 class="spec-title">{{ openApiTitle }}</h1>
                        <div v-if="openApiVersion" class="api-version">v{{ openApiVersion }}</div>
                    </div>
                </div>
                <button 
                    @click="downloadSpec" 
                    class="download-button"
                    :disabled="!openApiSpec || loading"
                    title="Download OpenAPI Spec JSON"
                >
                    <Download :size="20" />
                    <span>Download</span>
                </button>
            </div>
        </header>

        <div v-if="openApiSpecUrl" class="url-display">
            <span class="url-label">OpenAPI Spec URL:</span>
            <a 
                :href="openApiSpecUrl" 
                target="_blank" 
                rel="noopener noreferrer"
                class="url-link"
            >
                {{ openApiSpecUrl }}
            </a>
        </div>

        <main class="spec-viewer-content">
            <div v-if="loading" class="loading-state">
                <p>Loading OpenAPI specification...</p>
            </div>
            <div v-else-if="error" class="error-state">
                <p>Error loading specification: {{ error }}</p>
            </div>
            <div v-else-if="!openApiSpec" class="empty-state">
                <p>No OpenAPI specification available.</p>
            </div>
            <div v-else class="json-viewer-container">
                <JsonEditorVue 
                    :model-value="openApiSpec" 
                    mode="text"
                    :readOnly="true"
                    :mainMenuBar="true"
                    :navigationBar="true"
                    :statusBar="false"
                    :darkTheme="true"
                />
            </div>
        </main>
    </div>
</template>

<style lang="scss" scoped>
.spec-viewer {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    overflow: hidden;
}

.spec-viewer-header {
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    flex-shrink: 0;
    z-index: 100;
}

.url-display {
    padding: 0.75rem 2rem;
    background: hsl(var(--muted) / 0.3);
    border-bottom: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    font-size: 0.875rem;
}

.url-label {
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
}

.url-link {
    color: hsl(var(--primary));
    text-decoration: none;
    font-family: 'Chivo Mono Variable', monospace;
    word-break: break-all;
    transition: opacity 0.2s;

    &:hover {
        opacity: 0.8;
        text-decoration: underline;
    }
}

.header-content {
    max-width: 100%;
    margin: 0 auto;
    padding: 1rem 2rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}

.back-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
    cursor: pointer;
    padding: 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    transition: all 0.2s;
    flex-shrink: 0;

    &:hover {
        background: hsl(var(--muted) / 0.3);
        color: hsl(var(--primary));
    }
}

.header-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;

    svg {
        flex-shrink: 0;
        color: hsl(var(--muted-foreground));
    }
}

.title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
}

.spec-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}

.api-version {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    font-weight: 500;
    white-space: nowrap;
}

.download-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.2s;
    flex-shrink: 0;

    &:hover:not(:disabled) {
        opacity: 0.9;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.spec-viewer-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    min-height: 0;
}

.loading-state,
.error-state,
.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem;

    p {
        font-size: 1rem;
        color: hsl(var(--muted-foreground));
    }
}

.error-state p {
    color: hsl(var(--destructive));
}

.json-viewer-container {
    flex: 1;
    min-height: 0;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--input));
    display: flex;
    flex-direction: column;

    :deep(.jsoneditor) {
        border: none;
        background: hsl(var(--input));
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    :deep(.jsoneditor-menu) {
        background: hsl(var(--muted));
        border-bottom: 1px solid hsl(var(--border));
        flex-shrink: 0;
    }

    :deep(.jsoneditor-outer) {
        background: hsl(var(--input));
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
        position: relative;
    }

    :deep(.ace_editor) {
        background: hsl(var(--input)) !important;
        color: hsl(var(--foreground)) !important;
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
        background: hsl(var(--muted)) !important;
    }

    :deep(.ace_content) {
        overflow-y: auto !important;
        overflow-x: auto !important;
    }
}
</style>
