<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@clerk/vue';
import { SignInButton, UserButton } from '@clerk/vue';
import type { OpenAPIV3 } from 'openapi-types';
import JsonEditorVue from 'vue3-ts-jsoneditor';
import {
    Lock,
    ChevronRight,
    ChevronDown,
    ChevronLeft,
    FolderGit2,
    FileText,
    Unlock,
    RefreshCw,
    Sun,
    Moon,
    Search,
    X,
} from '@lucide/vue';
import { useOpenApiStore } from '@/stores/openapi';
import { useEndpointStore } from '@/stores/endpoint';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { useConfigStore } from '@/stores/config';
import { useTheme } from '@/composables/useTheme';
import ServiceHostPicker from '@/components/ServiceHostPicker.vue';
import EndpointTester from '@/components/EndpointTester.vue';
import SecuritySchemeMenu from '@/components/SecuritySchemeMenu.vue';
import WelcomeServiceHostInput from '@/components/WelcomeServiceHostInput.vue';
import EndpointPalette from '@/components/EndpointPalette.vue';

const localStorageStore = useLocalStorage();
const config = useConfigStore();
const { theme, toggle: toggleTheme } = useTheme();

const hasServiceHost = computed(() => config.hasServiceHost);

const router = useRouter();
const route = useRoute();

const openApiStore = useOpenApiStore();
const endpointStore = useEndpointStore();

let clerkAvailable = !!(config.clerkPublishableKey && config.clerkPublishableKey.trim());
let authState: ReturnType<typeof useAuth> | null = null;

if (clerkAvailable) {
    try {
        authState = useAuth();
    } catch (error) {
        console.warn('Failed to initialize Clerk auth:', error);
        clerkAvailable = false;
        authState = null;
    }
}

const isSignedIn = computed(() => {
    if (!authState) return false;
    try {
        return authState.isSignedIn.value ?? false;
    } catch {
        return false;
    }
});

const openApiSpec = computed(() => openApiStore.openApiSpec);
const loading = computed(() => openApiStore.loading);
const error = computed(() => openApiStore.error);
const CLERK_BEARER_SCHEME = '__clerk_bearer__';

const selectedPath = computed(() => endpointStore.selectedPath);
const selectedMethod = computed(() => endpointStore.selectedMethod);
const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);

const expandedGroups = ref<Set<string>>(new Set());
const expandedSchemaRefs = ref<Set<string>>(new Set());
const exampleViewMode = ref<Map<string, boolean>>(new Map());
const sidebarCollapsed = ref(false);
const examplesSidebarCollapsed = ref(false);
const endpointsSidebarWidth = ref(500);
const examplesSidebarWidth = ref(400);
const isResizingEndpoints = ref(false);
const isResizingExamples = ref(false);
const searchQuery = ref('');
const paletteOpen = ref(false);

const selectedEndpoint = computed(() => {
    return openApiStore.getSelectedEndpoint(selectedPath.value, selectedMethod.value);
});

const endpoints = computed(() => openApiStore.endpoints);

type EndpointGroup = {
    name: string;
    endpoints: Array<{ path: string; method: string; operation: OpenAPIV3.OperationObject }>;
};

const groupedEndpoints = computed(() => {
    if (endpoints.value.length === 0) return [];

    const groups = new Map<string, EndpointGroup>();

    for (const endpoint of endpoints.value) {
        const tags = endpoint.operation.tags || [];

        if (tags.length > 0) {
            const groupName = tags[0];
            if (groupName) {
                if (!groups.has(groupName)) {
                    groups.set(groupName, { name: groupName, endpoints: [] });
                }
                groups.get(groupName)!.endpoints.push(endpoint);
            }
        } else {
            const pathParts = endpoint.path.split('/').filter(p => p);
            const groupName = pathParts.length > 0 ? `/${pathParts[0]}` : 'Other';

            if (!groups.has(groupName)) {
                groups.set(groupName, { name: groupName, endpoints: [] });
            }
            groups.get(groupName)!.endpoints.push(endpoint);
        }
    }

    if (expandedGroups.value.size === 0) {
        groups.forEach((_, name) => expandedGroups.value.add(name));
    }

    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
});

const filteredGroupedEndpoints = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return groupedEndpoints.value;

    const filtered: EndpointGroup[] = [];
    for (const group of groupedEndpoints.value) {
        const groupMatches = group.name.toLowerCase().includes(q);
        const matchingEndpoints = group.endpoints.filter(ep =>
            groupMatches ||
            ep.path.toLowerCase().includes(q) ||
            ep.method.toLowerCase().includes(q) ||
            (ep.operation.summary || '').toLowerCase().includes(q)
        );
        if (matchingEndpoints.length > 0) {
            filtered.push({ name: group.name, endpoints: matchingEndpoints });
        }
    }
    return filtered;
});

const findGroupForEndpoint = (path: string, method: string): string | null => {
    const ep = endpoints.value.find(e => e.path === path && e.method === method);
    if (!ep) return null;
    const tags = ep.operation.tags || [];
    if (tags.length > 0 && tags[0]) return tags[0];
    const pathParts = ep.path.split('/').filter(p => p);
    return pathParts.length > 0 ? `/${pathParts[0]}` : 'Other';
};

const clearSearch = () => {
    searchQuery.value = '';
};

watch(searchQuery, (q) => {
    if (q.trim()) {
        expandedGroups.value = new Set(filteredGroupedEndpoints.value.map(g => g.name));
    }
});

const toggleGroup = (groupName: string) => {
    if (expandedGroups.value.has(groupName)) {
        expandedGroups.value.delete(groupName);
    } else {
        expandedGroups.value.add(groupName);
    }
};

const toggleSchemaRef = (schemaName: string) => {
    if (expandedSchemaRefs.value.has(schemaName)) {
        expandedSchemaRefs.value.delete(schemaName);
    } else {
        expandedSchemaRefs.value.add(schemaName);
    }
};

const toggleExampleViewMode = (itemId: string) => {
    const current = exampleViewMode.value.get(itemId) || false;
    exampleViewMode.value.set(itemId, !current);
};

const isSchemaMode = (itemId: string): boolean => {
    return exampleViewMode.value.get(itemId) || false;
};

const endpointHashCache = new Map<string, string>();

async function generateEndpointHashAsync(path: string, method: string): Promise<string> {
    const key = `${method}:${path}`;
    if (endpointHashCache.has(key)) {
        return endpointHashCache.get(key)!;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    endpointHashCache.set(key, hashHex);
    return hashHex;
}

function generateEndpointHash(path: string, method: string): string {
    const key = `${method}:${path}`;
    return endpointHashCache.get(key) || '';
}

async function parseEndpointFromQuery(): Promise<{ path: string; method: string } | null> {
    const endpointHash = route.query.endpoint as string | undefined;
    if (!endpointHash) return null;
    for (const endpoint of endpoints.value) {
        const endpointHashComputed = await generateEndpointHashAsync(endpoint.path, endpoint.method);
        if (endpointHashComputed === endpointHash) {
            return { path: endpoint.path, method: endpoint.method };
        }
    }
    return null;
}

onMounted(async () => {
    sidebarCollapsed.value = localStorageStore.loadSidebarCollapsed();
    examplesSidebarCollapsed.value = localStorageStore.loadExamplesSidebarCollapsed();
    endpointsSidebarWidth.value = localStorageStore.loadEndpointsSidebarWidth();
    examplesSidebarWidth.value = localStorageStore.loadExamplesSidebarWidth();

    await config.loadOpenApiSpec();

    for (const endpoint of endpoints.value) {
        await generateEndpointHashAsync(endpoint.path, endpoint.method);
    }

    const parsed = await parseEndpointFromQuery();
    if (parsed) {
        await nextTick();
        await selectEndpoint(parsed.path, parsed.method, false);
    }

    watch(() => route.query.endpoint, async (newEndpointHash) => {
        if (newEndpointHash) {
            const parsed = await parseEndpointFromQuery();
            if (parsed && (selectedPath.value !== parsed.path || selectedMethod.value !== parsed.method)) {
                await selectEndpoint(parsed.path, parsed.method, false);
            }
        } else if (selectedPath.value || selectedMethod.value) {
            endpointStore.setSelectedEndpoint(null, null);
        }
    });

    watch(sidebarCollapsed, (newValue) => {
        localStorageStore.saveSidebarCollapsed(newValue);
    });

    watch(examplesSidebarCollapsed, (newValue) => {
        localStorageStore.saveExamplesSidebarCollapsed(newValue);
    });

    watch(endpointsSidebarWidth, (newValue) => {
        localStorageStore.saveEndpointsSidebarWidth(newValue);
    });

    watch(examplesSidebarWidth, (newValue) => {
        localStorageStore.saveExamplesSidebarWidth(newValue);
    });

    document.addEventListener('keydown', handleGlobalKeydown);
});

const handleGlobalKeydown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        paletteOpen.value = !paletteOpen.value;
    }
};

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleGlobalKeydown);
});

const onPaletteSelect = async (path: string, method: string) => {
    paletteOpen.value = false;
    await selectEndpoint(path, method);
};

const startResizeEndpoints = (e: MouseEvent) => {
    isResizingEndpoints.value = true;
    const startX = e.clientX;
    const startWidth = endpointsSidebarWidth.value;

    const handleMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        const newWidth = Math.max(240, Math.min(800, startWidth + diff));
        endpointsSidebarWidth.value = newWidth;
    };

    const handleMouseUp = () => {
        isResizingEndpoints.value = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
};

const startResizeExamples = (e: MouseEvent) => {
    isResizingExamples.value = true;
    const startX = e.clientX;
    const startWidth = examplesSidebarWidth.value;

    const handleMouseMove = (e: MouseEvent) => {
        const diff = startX - e.clientX;
        const newWidth = Math.max(240, Math.min(800, startWidth + diff));
        examplesSidebarWidth.value = newWidth;
    };

    const handleMouseUp = () => {
        isResizingExamples.value = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
};

const selectEndpoint = async (path: string, method: string, updateHash = true) => {
    endpointStore.setSelectedEndpoint(path, method);
    expandedSchemaRefs.value.clear();
    exampleViewMode.value.clear();

    if (!searchQuery.value.trim()) {
        const groupName = findGroupForEndpoint(path, method);
        if (groupName) {
            expandedGroups.value = new Set([groupName]);
        }
    }

    if (updateHash) {
        const hash = generateEndpointHash(path, method) || await generateEndpointHashAsync(path, method);
        if (route.query.endpoint !== hash) {
            await router.replace({
                query: {
                    ...route.query,
                    endpoint: hash,
                },
            });
        }
    }
};

const exampleRequestBody = computed(() => {
    if (!selectedEndpoint.value) return null;
    return openApiStore.getExampleFromRequestBody(selectedEndpoint.value);
});

const requestBodySchema = computed(() => {
    if (!selectedEndpoint.value) return null;
    return openApiStore.getRequestBodySchema(selectedEndpoint.value);
});

const requestBodySchemaDisplay = computed(() => {
    if (!requestBodySchema.value || !openApiSpec.value) return null;
    return openApiStore.formatSchemaForDisplay(requestBodySchema.value, openApiSpec.value);
});

const getResponseSchemaDisplay = (schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined): string | null => {
    if (!schema || !openApiSpec.value) return null;
    return openApiStore.formatSchemaForDisplay(schema, openApiSpec.value);
};

const allResponseExamples = computed(() => {
    if (!selectedEndpoint.value) return [];
    return openApiStore.getAllResponseExamples(selectedEndpoint.value);
});

const endpointSchemaReferences = computed(() => {
    if (!selectedEndpoint.value) return [];
    return openApiStore.getEndpointSchemaReferences(selectedEndpoint.value);
});

const endpointRequiresSecurity = (operation: OpenAPIV3.OperationObject): boolean => {
    return openApiStore.endpointRequiresSecurity(operation);
};

const openApiTitle = computed(() => openApiStore.openApiTitle);
const openApiDescription = computed(() => openApiStore.openApiDescription);
const openApiVersion = computed(() => openApiStore.openApiVersion);

const selectedSchemeName = computed(() => {
    if (!selectedAuthScheme.value) return 'Anonymous';
    if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) return 'Clerk Bearer';
    const securitySchemes = openApiStore.securitySchemes;
    const scheme = securitySchemes.find(s => s.name === selectedAuthScheme.value);
    return scheme ? scheme.name : 'Anonymous';
});

const refreshOpenApiSpec = async () => {
    await config.reload();
};
</script>

<template>
    <div class="app-shell">
        <header class="app-header">
            <div class="header-title">
                <div class="title-row">
                    <h1 class="title">{{ openApiTitle }}</h1>
                    <span v-if="openApiVersion" class="version">v{{ openApiVersion }}</span>
                    <button
                        v-if="hasServiceHost"
                        @click="refreshOpenApiSpec"
                        class="icon-btn refresh-btn"
                        :disabled="openApiStore.loading"
                        title="Refresh OpenAPI Spec"
                    >
                        <RefreshCw :size="16" :stroke-width="1.5" :class="{ spinning: openApiStore.loading }" />
                    </button>
                </div>
                <p v-if="openApiDescription" class="description">{{ openApiDescription }}</p>
            </div>
            <div class="header-actions">
                <ServiceHostPicker v-if="config.isServiceHostPickerEnabled" />

                <button
                    @click="toggleTheme"
                    class="icon-btn"
                    :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                >
                    <Sun v-if="theme === 'dark'" :size="16" :stroke-width="1.5" />
                    <Moon v-else :size="16" :stroke-width="1.5" />
                </button>
                <button
                    @click="router.push('/spec')"
                    class="icon-btn"
                    title="View OpenAPI spec JSON"
                >
                    <FileText :size="16" :stroke-width="1.5" />
                </button>
                <a
                    href="https://github.com/gamja-labs/openapi-studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="icon-btn"
                    title="View on GitHub"
                >
                    <FolderGit2 :size="16" :stroke-width="1.5" />
                </a>
                <button
                    @click="endpointStore.toggleAuthMenu"
                    class="auth-pill"
                    :class="{ active: endpointStore.authMenuOpen, 'has-selection': selectedAuthScheme }"
                    title="Security scheme"
                >
                    <Unlock v-if="!selectedAuthScheme" :size="14" :stroke-width="1.5" />
                    <Lock v-else :size="14" :stroke-width="1.5" />
                    <span>{{ selectedAuthScheme ? selectedSchemeName : 'Security' }}</span>
                </button>
                <div v-if="clerkAvailable" class="auth-clerk">
                    <SignInButton v-if="!isSignedIn" mode="modal">
                        <button class="btn-primary">Sign In</button>
                    </SignInButton>
                    <div v-else class="user-section">
                        <UserButton />
                    </div>
                </div>
            </div>
        </header>

        <SecuritySchemeMenu />

        <EndpointPalette
            v-if="hasServiceHost"
            :open="paletteOpen"
            :endpoints="endpoints"
            :selected-path="selectedPath"
            :selected-method="selectedMethod"
            @close="paletteOpen = false"
            @select="onPaletteSelect"
        />

        <div class="layout">
            <aside
                v-if="hasServiceHost"
                class="endpoints-aside"
                :class="{ collapsed: sidebarCollapsed, resizing: isResizingEndpoints }"
                :style="{ width: sidebarCollapsed ? '48px' : `${endpointsSidebarWidth}px` }"
            >
                <header class="aside-header">
                    <h2 class="aside-title">Endpoints</h2>
                    <button
                        @click="sidebarCollapsed = !sidebarCollapsed"
                        class="icon-btn small"
                        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
                    >
                        <ChevronRight v-if="sidebarCollapsed" :size="14" :stroke-width="1.5" />
                        <ChevronLeft v-else :size="14" :stroke-width="1.5" />
                    </button>
                </header>
                <div v-show="!sidebarCollapsed" class="aside-search">
                    <Search :size="12" :stroke-width="1.5" class="aside-search-icon" />
                    <input
                        v-model="searchQuery"
                        class="aside-search-input"
                        type="text"
                        placeholder="Filter endpoints…"
                        spellcheck="false"
                    />
                    <button
                        v-if="searchQuery"
                        class="aside-search-clear"
                        @click="clearSearch"
                        title="Clear filter"
                    >
                        <X :size="11" :stroke-width="1.5" />
                    </button>
                    <button
                        v-else
                        class="aside-search-kbd"
                        @click="paletteOpen = true"
                        title="Open palette (⌘K)"
                    >⌘K</button>
                </div>
                <div class="aside-body" v-show="!sidebarCollapsed">
                    <div v-if="loading" class="status-text">[LOADING ENDPOINTS]</div>
                    <div v-else-if="error" class="status-text error">[ERROR] {{ error }}</div>
                    <div v-else-if="filteredGroupedEndpoints.length === 0" class="status-text">
                        [NO MATCHES]
                    </div>
                    <div v-else class="endpoint-groups">
                        <section v-for="group in filteredGroupedEndpoints" :key="group.name" class="endpoint-group">
                            <button class="group-row" @click="toggleGroup(group.name)">
                                <ChevronDown v-if="expandedGroups.has(group.name)" :size="12" :stroke-width="1.5" class="group-chevron" />
                                <ChevronRight v-else :size="12" :stroke-width="1.5" class="group-chevron" />
                                <span class="group-name">{{ group.name }}</span>
                                <span class="group-count">{{ group.endpoints.length }}</span>
                            </button>
                            <div v-if="expandedGroups.has(group.name)" class="group-endpoints">
                                <button
                                    v-for="endpoint in group.endpoints"
                                    :key="`${endpoint.method}-${endpoint.path}`"
                                    class="endpoint-row"
                                    :class="[
                                        `method-${endpoint.method.toLowerCase()}`,
                                        { active: selectedPath === endpoint.path && selectedMethod === endpoint.method }
                                    ]"
                                    @click.stop="selectEndpoint(endpoint.path, endpoint.method)"
                                >
                                    <span class="method-tag">{{ endpoint.method }}</span>
                                    <span class="endpoint-path">{{ endpoint.path }}</span>
                                    <Lock
                                        v-if="endpointRequiresSecurity(endpoint.operation)"
                                        :size="12"
                                        :stroke-width="1.5"
                                        class="lock-indicator"
                                        title="Requires authentication"
                                    />
                                    <span v-if="endpoint.operation.summary" class="endpoint-summary">
                                        {{ endpoint.operation.summary }}
                                    </span>
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            </aside>

            <div
                v-if="hasServiceHost && !sidebarCollapsed"
                class="resize-handle"
                @mousedown="startResizeEndpoints"
                :class="{ resizing: isResizingEndpoints }"
            ></div>

            <div v-if="selectedEndpoint" class="endpoint-content">
                <EndpointTester />

                <div
                    v-if="!examplesSidebarCollapsed"
                    class="resize-handle"
                    @mousedown="startResizeExamples"
                    :class="{ resizing: isResizingExamples }"
                ></div>

                <aside
                    class="examples-aside"
                    :class="{ collapsed: examplesSidebarCollapsed, resizing: isResizingExamples }"
                    :style="{ width: examplesSidebarCollapsed ? '48px' : `${examplesSidebarWidth}px` }"
                >
                    <header class="aside-header">
                        <h2 class="aside-title">Examples</h2>
                        <button
                            @click="examplesSidebarCollapsed = !examplesSidebarCollapsed"
                            class="icon-btn small"
                            :title="examplesSidebarCollapsed ? 'Expand examples' : 'Collapse examples'"
                        >
                            <ChevronLeft v-if="examplesSidebarCollapsed" :size="14" :stroke-width="1.5" />
                            <ChevronRight v-else :size="14" :stroke-width="1.5" />
                        </button>
                    </header>
                    <div v-show="!examplesSidebarCollapsed" class="aside-body">
                        <section v-if="exampleRequestBody || requestBodySchema" class="example-section">
                            <header class="section-head">
                                <h3 class="section-label">
                                    {{ isSchemaMode('request-body') ? 'Request Body Schema' : 'Example Request Body' }}
                                </h3>
                                <div class="segmented">
                                    <button
                                        @click="toggleExampleViewMode('request-body')"
                                        :class="{ active: !isSchemaMode('request-body') }"
                                        class="segment"
                                    >Example</button>
                                    <button
                                        @click="toggleExampleViewMode('request-body')"
                                        :class="{ active: isSchemaMode('request-body') }"
                                        class="segment"
                                    >Schema</button>
                                </div>
                            </header>
                            <div class="code-frame">
                                <div v-if="isSchemaMode('request-body') && requestBodySchemaDisplay" class="schema-display">
                                    <pre class="schema-text">{{ requestBodySchemaDisplay }}</pre>
                                </div>
                                <div v-else-if="!isSchemaMode('request-body')" class="json-editor-wrapper">
                                    <JsonEditorVue
                                        :model-value="exampleRequestBody"
                                        mode="text"
                                        :readOnly="true"
                                        :mainMenuBar="false"
                                        :navigationBar="false"
                                        :statusBar="false"
                                        :darkTheme="theme === 'dark'"
                                    />
                                </div>
                            </div>
                        </section>

                        <section v-if="allResponseExamples.length > 0" class="example-section">
                            <h3 class="section-label">Response Codes</h3>
                            <div class="response-list">
                                <div
                                    v-for="responseExample in allResponseExamples"
                                    :key="responseExample.code"
                                    class="response-item"
                                >
                                    <div class="response-head">
                                        <span
                                            class="response-code"
                                            :class="{ success: responseExample.isSuccess, error: !responseExample.isSuccess }"
                                        >{{ responseExample.code }}</span>
                                        <div class="response-meta">
                                            <p v-if="responseExample.description" class="response-description">
                                                {{ responseExample.description }}
                                            </p>
                                            <div class="segmented">
                                                <button
                                                    @click="toggleExampleViewMode(`response-${responseExample.code}`)"
                                                    :class="{ active: !isSchemaMode(`response-${responseExample.code}`) }"
                                                    class="segment"
                                                >Example</button>
                                                <button
                                                    @click="toggleExampleViewMode(`response-${responseExample.code}`)"
                                                    :class="{ active: isSchemaMode(`response-${responseExample.code}`) }"
                                                    class="segment"
                                                >Schema</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        v-if="isSchemaMode(`response-${responseExample.code}`) ? responseExample.schema : responseExample.example"
                                        class="code-frame"
                                    >
                                        <div v-if="isSchemaMode(`response-${responseExample.code}`) && responseExample.schema" class="schema-display">
                                            <pre class="schema-text">{{ getResponseSchemaDisplay(responseExample.schema) }}</pre>
                                        </div>
                                        <div v-else-if="!isSchemaMode(`response-${responseExample.code}`)" class="json-editor-wrapper">
                                            <JsonEditorVue
                                                :model-value="responseExample.example"
                                                mode="text"
                                                :readOnly="true"
                                                :mainMenuBar="false"
                                                :navigationBar="false"
                                                :statusBar="false"
                                                :darkTheme="theme === 'dark'"
                                            />
                                        </div>
                                    </div>
                                    <p v-else class="empty-inline">
                                        No {{ isSchemaMode(`response-${responseExample.code}`) ? 'schema' : 'example' }} available
                                    </p>
                                </div>
                            </div>
                        </section>

                        <p v-if="!exampleRequestBody && allResponseExamples.length === 0" class="empty-inline">
                            No examples available for this endpoint.
                        </p>

                        <section v-if="endpointSchemaReferences.length > 0" class="example-section">
                            <h3 class="section-label">Referenced Schemas</h3>
                            <div class="schema-references-list">
                                <div v-for="ref in endpointSchemaReferences" :key="ref.name" class="schema-reference">
                                    <button class="schema-reference-row" @click="toggleSchemaRef(ref.name)">
                                        <ChevronDown v-if="expandedSchemaRefs.has(ref.name)" :size="12" :stroke-width="1.5" />
                                        <ChevronRight v-else :size="12" :stroke-width="1.5" />
                                        <span class="schema-reference-name">{{ ref.name }}</span>
                                    </button>
                                    <div v-if="expandedSchemaRefs.has(ref.name)" class="code-frame">
                                        <div class="schema-display">
                                            <pre class="schema-text">{{ openApiStore.formatSchemaForDisplay(ref.schema, openApiSpec!) }}</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </aside>
            </div>

            <main v-else class="welcome">
                <div class="welcome-content">
                    <p class="welcome-eyebrow">OPENAPI / STUDIO</p>
                    <h1 class="welcome-title">Welcome.</h1>
                    <p v-if="hasServiceHost" class="welcome-sub">
                        Select an endpoint from the sidebar to begin.
                    </p>
                    <WelcomeServiceHostInput />
                    <div v-if="hasServiceHost" class="welcome-tips">
                        <div class="tip-row">
                            <span class="tip-key">01</span>
                            <span class="tip-text">Browse available endpoints in the sidebar</span>
                        </div>
                        <div class="tip-row">
                            <span class="tip-key">02</span>
                            <span class="tip-text">Test requests with custom parameters</span>
                        </div>
                        <div class="tip-row">
                            <span class="tip-key">03</span>
                            <span class="tip-text">View responses and schema documentation</span>
                        </div>
                    </div>
                </div>
                <footer class="welcome-footer">
                    <span>{{ new Date().getFullYear() }} / GAMJA LABS</span>
                </footer>
            </main>
        </div>
    </div>
</template>

<style lang="scss">
@use '@/styles/shared' as *;

.app-shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--black);
    color: var(--text-primary);
    overflow: hidden;
}

// ─── HEADER ───────────────────────────────────────────────────────────

.app-header {
    flex-shrink: 0;
    z-index: 100;
    padding: $space-md $space-lg;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-xl;
    border-bottom: 1px solid var(--border);
    background: var(--black);
}

.header-title {
    display: flex;
    flex-direction: column;
    gap: $space-xs;
    min-width: 0;
    flex: 1;
}

.title-row {
    display: flex;
    align-items: baseline;
    gap: $space-md;
    flex-wrap: wrap;
}

.title {
    @include type-heading;
    color: var(--text-display);
    margin: 0;
}

.version {
    @include type-label;
    color: var(--text-secondary);
}

.description {
    @include type-caption;
    color: var(--text-secondary);
    margin: 0;
    max-width: 720px;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: $space-sm;
    flex-shrink: 0;
}

.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0;
    @include transition-micro(color);

    &.small {
        width: 24px;
        height: 24px;
    }

    &:hover:not(:disabled) {
        color: var(--text-display);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .spinning {
        animation: spin 1s linear infinite;
    }
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.auth-pill {
    @include type-label;
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    height: 32px;
    padding: 0 $space-md;
    background: transparent;
    border: 1px solid var(--border-visible);
    border-radius: 999px;
    color: var(--text-primary);
    cursor: pointer;
    @include transition-micro;

    &:hover {
        border-color: var(--text-primary);
    }

    &.active,
    &.has-selection {
        background: var(--text-display);
        border-color: var(--text-display);
        color: var(--black);
    }
}

.btn-primary {
    @include type-label;
    height: 32px;
    padding: 0 $space-md;
    background: var(--text-display);
    color: var(--black);
    border: none;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;

    &:hover {
        background: var(--text-primary);
    }
}

.auth-clerk {
    display: flex;
    align-items: center;
}

// ─── LAYOUT ────────────────────────────────────────────────────────────

.layout {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.endpoints-aside,
.examples-aside {
    background: var(--black);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
    @include transition-default(width);

    &.resizing {
        transition: none;
    }
}

.endpoints-aside {
    border-right: 1px solid var(--border);
}

.examples-aside {
    border-left: 1px solid var(--border);
}

.aside-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-md $space-md $space-md $space-lg;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
}

.aside-title {
    @include type-label;
    color: var(--text-secondary);
    margin: 0;
}

.endpoints-aside.collapsed,
.examples-aside.collapsed {
    .aside-header {
        flex-direction: column;
        gap: $space-sm;
        padding: $space-md $space-xs;
    }

    .aside-title {
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
    }
}

.aside-search {
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: $space-sm $space-md;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.aside-search-icon {
    color: var(--text-disabled);
    flex-shrink: 0;
}

.aside-search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-primary);

    &::placeholder {
        color: var(--text-disabled);
    }
}

.aside-search-clear,
.aside-search-kbd {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--text-disabled);
    cursor: pointer;
    @include transition-micro(color);

    &:hover {
        color: var(--text-primary);
    }
}

.aside-search-clear {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.aside-search-kbd {
    @include type-label;
    font-size: 10px;
    padding: 2px 6px;
    border: 1px solid var(--border-visible);
    border-radius: 4px;
    color: var(--text-disabled);
}

.aside-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: $space-sm 0 $space-md 0;
}

.resize-handle {
    width: 1px;
    background: var(--border);
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    user-select: none;
    @include transition-micro(background);

    &::before {
        content: '';
        position: absolute;
        left: -3px;
        right: -3px;
        top: 0;
        bottom: 0;
    }

    &:hover,
    &.resizing {
        background: var(--text-disabled);
    }
}

// ─── ENDPOINT GROUPS ───────────────────────────────────────────────────

.status-text {
    @include type-label;
    color: var(--text-disabled);
    padding: $space-md $space-lg;

    &.error {
        color: var(--accent);
    }
}

.endpoint-groups {
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.endpoint-group {
    display: flex;
    flex-direction: column;
}

.group-row {
    @include type-label;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: $space-2xs $space-md;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    @include transition-micro(color);

    &:hover {
        color: var(--text-primary);
    }
}

.group-chevron {
    color: var(--text-disabled);
    flex-shrink: 0;
}

.group-name {
    flex: 1;
}

.group-count {
    @include type-label;
    font-size: 10px;
    color: var(--text-disabled);
}

.group-endpoints {
    display: flex;
    flex-direction: column;
}

.endpoint-row {
    display: flex;
    align-items: center;
    column-gap: $space-sm;
    padding: 3px $space-md 3px $space-sm;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    min-height: 24px;
    @include transition-micro;
    position: relative;

    &:hover {
        background: var(--surface);
    }

    &.active {
        background: var(--surface-raised);
    }

    &.method-get { border-left-color: var(--method-get); }
    &.method-post { border-left-color: var(--method-post); }
    &.method-put { border-left-color: var(--method-put); }
    &.method-patch { border-left-color: var(--method-patch); }
    &.method-delete { border-left-color: var(--method-delete); }
    &.method-options { border-left-color: var(--method-options); }
    &.method-head { border-left-color: var(--method-head); }
}

.method-tag {
    @include type-label;
    font-size: 10px;
    width: 44px;
    flex-shrink: 0;
    color: var(--text-secondary);
    text-align: left;

    .method-get & { color: var(--method-get); }
    .method-post & { color: var(--method-post); }
    .method-put & { color: var(--method-put); }
    .method-patch & { color: var(--method-patch); }
    .method-delete & { color: var(--method-delete); }
    .method-options & { color: var(--method-options); }
    .method-head & { color: var(--method-head); }
}

.endpoint-path {
    font-family: $font-data;
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    flex-shrink: 1;
    min-width: 0;
}

.endpoint-summary {
    @include type-caption;
    font-size: 11px;
    color: var(--text-disabled);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    text-align: right;
    margin-left: auto;
    flex-shrink: 2;
    min-width: 0;
}

.lock-indicator {
    color: var(--text-disabled);
    flex-shrink: 0;
}

// ─── ENDPOINT CONTENT (the testing canvas) ─────────────────────────────

.endpoint-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    background: var(--black);
}

// ─── WELCOME ───────────────────────────────────────────────────────────

.welcome {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    background: var(--black);
    @include dot-grid-subtle;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $space-4xl $space-xl $space-xl;
    position: relative;
}

.welcome-content {
    max-width: 560px;
    width: 100%;
    text-align: left;
    animation: fade-up 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
}

@keyframes fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

.welcome-eyebrow {
    @include type-label;
    color: var(--text-secondary);
    margin: 0 0 $space-md 0;
}

.welcome-title {
    font-family: $font-display;
    font-size: $display-lg;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--text-display);
    margin: 0 0 $space-lg 0;
    font-weight: 500;
}

.welcome-sub {
    @include type-body;
    color: var(--text-secondary);
    margin: 0 0 $space-2xl 0;
    max-width: 480px;
}

.welcome-tips {
    display: flex;
    flex-direction: column;
    margin-top: $space-2xl;
    border-top: 1px solid var(--border);
}

.tip-row {
    display: flex;
    align-items: center;
    gap: $space-lg;
    padding: $space-md 0;
    border-bottom: 1px solid var(--border);
}

.tip-key {
    @include type-label;
    color: var(--text-disabled);
    min-width: 24px;
}

.tip-text {
    @include type-body-sm;
    color: var(--text-primary);
}

.welcome-footer {
    position: absolute;
    bottom: $space-md;
    left: 0;
    right: 0;
    text-align: center;

    span {
        @include type-label;
        color: var(--text-disabled);
    }
}

// ─── EXAMPLES SIDEBAR INTERNALS ─────────────────────────────────────────

.example-section {
    padding: 0 $space-lg $space-2xl;

    &:last-child {
        padding-bottom: $space-lg;
    }
}

.section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-md;
    margin-bottom: $space-md;
}

.section-label {
    @include type-label;
    color: var(--text-secondary);
    margin: 0;
}

.segmented {
    display: inline-flex;
    border: 1px solid var(--border-visible);
    border-radius: 999px;
    overflow: hidden;
    flex-shrink: 0;
    align-self: flex-start;
    width: fit-content;
}

.segment {
    @include type-label;
    background: transparent;
    border: none;
    padding: $space-xs $space-md;
    color: var(--text-secondary);
    cursor: pointer;
    @include transition-default;

    &.active {
        background: var(--text-display);
        color: var(--black);
    }

    &:not(.active):hover {
        color: var(--text-primary);
    }
}

.code-frame {
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
}

.schema-display,
.json-editor-wrapper {
    background: var(--surface);
}

.schema-display {
    max-height: 400px;
    overflow: auto;
}

.schema-text {
    margin: 0;
    padding: $space-md;
    font-family: $font-data;
    font-size: $caption;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre;
    overflow-x: auto;
}

.response-list {
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.response-item {
    display: flex;
    flex-direction: column;
    gap: $space-sm;
    padding: $space-md 0;
    border-top: 1px solid var(--border);

    &:first-child {
        border-top: none;
        padding-top: 0;
    }
}

.response-head {
    display: flex;
    gap: $space-md;
    align-items: flex-start;
}

.response-code {
    @include type-data;
    font-size: $body;
    color: var(--text-primary);
    min-width: 48px;

    &.success { color: var(--success); }
    &.error { color: var(--accent); }
}

.response-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: $space-sm;
    min-width: 0;
}

.response-description {
    @include type-body-sm;
    color: var(--text-secondary);
    margin: 0;
}

.empty-inline {
    @include type-caption;
    color: var(--text-disabled);
    margin: 0;
    padding: $space-md $space-lg;
}

.schema-references-list {
    display: flex;
    flex-direction: column;
}

.schema-reference {
    border-top: 1px solid var(--border);

    &:first-child {
        border-top: none;
    }
}

.schema-reference-row {
    display: flex;
    align-items: center;
    gap: $space-sm;
    width: 100%;
    padding: $space-sm 0;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    @include transition-micro(color);

    &:hover {
        color: var(--text-primary);
    }
}

.schema-reference-name {
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-primary);
}

// ─── JSON EDITOR THEME OVERRIDES ───────────────────────────────────────

.json-editor-wrapper {
    width: 100%;
    overflow: auto;

    :deep(.jsoneditor) {
        border: none;
        background: var(--surface);
    }

    :deep(.jsoneditor-menu) {
        background: var(--surface-raised);
        border-bottom: 1px solid var(--border);
    }

    :deep(.jsoneditor-outer) {
        background: var(--surface);
    }

    :deep(.ace_editor) {
        background: var(--surface) !important;
        color: var(--text-primary) !important;
    }

    :deep(.ace_gutter) {
        background: var(--surface-raised) !important;
        color: var(--text-disabled) !important;
    }
}
</style>
