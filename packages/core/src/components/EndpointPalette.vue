<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import type { OpenAPIV3 } from 'openapi-types';
import { Search } from '@lucide/vue';

type EndpointItem = {
    path: string;
    method: string;
    operation: OpenAPIV3.OperationObject;
};

const props = defineProps<{
    open: boolean;
    endpoints: EndpointItem[];
    selectedPath: string | null;
    selectedMethod: string | null;
}>();

const emit = defineEmits<{
    close: [];
    select: [path: string, method: string];
}>();

const query = ref('');
const highlight = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);

const score = (ep: EndpointItem, q: string): number => {
    const qLower = q.toLowerCase();
    const path = ep.path.toLowerCase();
    const method = ep.method.toLowerCase();
    const tags = (ep.operation.tags || []).map(t => t.toLowerCase()).join(' ');
    const summary = (ep.operation.summary || '').toLowerCase();

    if (path === qLower) return 1000;
    if (path.includes(qLower)) return 500 - (path.indexOf(qLower) || 0);
    if (method === qLower) return 200;
    if (tags.includes(qLower)) return 100;
    if (summary.includes(qLower)) return 50 - (summary.indexOf(qLower) || 0);
    return 0;
};

const results = computed(() => {
    const q = query.value.trim();
    if (!q) {
        return props.endpoints.slice(0, 50);
    }
    const scored = props.endpoints
        .map(ep => ({ ep, s: score(ep, q) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 50)
        .map(x => x.ep);
    return scored;
});

watch(() => props.open, async (opened) => {
    if (opened) {
        query.value = '';
        highlight.value = 0;
        await nextTick();
        inputRef.value?.focus();
    }
});

watch(query, () => {
    highlight.value = 0;
    nextTick(() => scrollToHighlight());
});

const scrollToHighlight = () => {
    if (!listRef.value) return;
    const el = listRef.value.querySelector(`[data-idx="${highlight.value}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
};

const onKey = (e: KeyboardEvent) => {
    if (!props.open) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        emit('close');
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.value.length === 0) return;
        highlight.value = (highlight.value + 1) % results.value.length;
        nextTick(() => scrollToHighlight());
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.value.length === 0) return;
        highlight.value = (highlight.value - 1 + results.value.length) % results.value.length;
        nextTick(() => scrollToHighlight());
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = results.value[highlight.value];
        if (chosen) {
            emit('select', chosen.path, chosen.method);
        }
    }
};

onMounted(() => {
    document.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
});

const onBackdropClick = () => emit('close');
const onPanelClick = (e: MouseEvent) => e.stopPropagation();
const onPick = (path: string, method: string) => emit('select', path, method);
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="palette-backdrop" @click="onBackdropClick">
            <div class="palette" @click="onPanelClick">
                <header class="palette-input-row">
                    <Search :size="14" :stroke-width="1.5" class="palette-icon" />
                    <input
                        ref="inputRef"
                        v-model="query"
                        type="text"
                        class="palette-input"
                        placeholder="Search endpoints — type path, method, tag, or summary"
                        spellcheck="false"
                    />
                    <span class="palette-input-kbd">ESC</span>
                </header>
                <div ref="listRef" class="palette-list">
                    <p v-if="results.length === 0" class="palette-empty">[NO MATCHES]</p>
                    <button
                        v-for="(ep, idx) in results"
                        :key="`${ep.method}-${ep.path}`"
                        class="palette-row"
                        :class="[
                            `method-${ep.method.toLowerCase()}`,
                            {
                                highlighted: idx === highlight,
                                current: selectedPath === ep.path && selectedMethod === ep.method
                            }
                        ]"
                        :data-idx="idx"
                        @mouseenter="highlight = idx"
                        @click="onPick(ep.path, ep.method)"
                    >
                        <span class="palette-method">{{ ep.method }}</span>
                        <span class="palette-path">{{ ep.path }}</span>
                        <span v-if="ep.operation.summary" class="palette-summary">{{ ep.operation.summary }}</span>
                    </button>
                </div>
                <footer class="palette-footer">
                    <span class="palette-foot-key">↑↓</span><span class="palette-foot-label">navigate</span>
                    <span class="palette-foot-key">↵</span><span class="palette-foot-label">open</span>
                    <span class="palette-foot-key">esc</span><span class="palette-foot-label">close</span>
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/shared' as *;

.palette-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 2000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    backdrop-filter: blur(1px);
    animation: fade 0.15s ease-out;
}

@keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
}

.palette {
    width: min(720px, calc(100vw - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border-visible);
    overflow: hidden;
}

.palette-input-row {
    display: flex;
    align-items: center;
    gap: $space-md;
    padding: $space-md $space-lg;
    border-bottom: 1px solid var(--border);
}

.palette-icon {
    color: var(--text-disabled);
    flex-shrink: 0;
}

.palette-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    font-family: $font-data;
    font-size: $body;
    color: var(--text-primary);

    &::placeholder {
        color: var(--text-disabled);
    }
}

.palette-input-kbd {
    @include type-label;
    font-size: 10px;
    padding: 2px 6px;
    border: 1px solid var(--border-visible);
    color: var(--text-disabled);
}

.palette-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: $space-xs 0;
}

.palette-empty {
    @include type-label;
    color: var(--text-disabled);
    text-align: center;
    padding: $space-xl;
    margin: 0;
}

.palette-row {
    display: flex;
    align-items: center;
    gap: $space-md;
    width: 100%;
    padding: $space-sm $space-lg;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    @include transition-micro;

    &.method-get { border-left-color: var(--method-get); }
    &.method-post { border-left-color: var(--method-post); }
    &.method-put { border-left-color: var(--method-put); }
    &.method-patch { border-left-color: var(--method-patch); }
    &.method-delete { border-left-color: var(--method-delete); }
    &.method-options { border-left-color: var(--method-options); }
    &.method-head { border-left-color: var(--method-head); }

    &.highlighted {
        background: var(--surface-raised);
    }

    &.current {
        background: var(--surface-raised);

        .palette-path {
            color: var(--text-display);
        }
    }
}

.palette-method {
    @include type-label;
    font-size: 11px;
    width: 56px;
    flex-shrink: 0;

    .method-get & { color: var(--method-get); }
    .method-post & { color: var(--method-post); }
    .method-put & { color: var(--method-put); }
    .method-patch & { color: var(--method-patch); }
    .method-delete & { color: var(--method-delete); }
    .method-options & { color: var(--method-options); }
    .method-head & { color: var(--method-head); }
}

.palette-path {
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
}

.palette-summary {
    @include type-caption;
    color: var(--text-disabled);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 2;
    min-width: 0;
    margin-left: auto;
    text-align: right;
}

.palette-footer {
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: $space-sm $space-lg;
    border-top: 1px solid var(--border);
    background: var(--surface-raised);
}

.palette-foot-key {
    @include type-label;
    font-size: 10px;
    color: var(--text-secondary);
    padding: 1px 6px;
    border: 1px solid var(--border-visible);
    border-radius: 3px;
}

.palette-foot-label {
    @include type-label;
    font-size: 10px;
    color: var(--text-disabled);
    margin-right: $space-sm;
}
</style>
