<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@clerk/vue';
import { SignInButton, UserButton } from '@clerk/vue';
import type { OpenAPIV3 } from 'openapi-types';
import JsonEditorVue from 'vue3-ts-jsoneditor';
import { Lock, ChevronRight, ChevronDown, ChevronLeft, Github, Rocket, FileText, Zap, BarChart, Unlock, RefreshCw } from 'lucide-vue-next';
import { useClerkStore } from '@/stores/clerk';
import { useOpenApiStore } from '@/stores/openapi';
import { useEndpointStore } from '@/stores/endpoint';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { useConfigStore } from '@/stores/config';
import { useFeaturesToggle } from '@/composables/useFeaturesToggle';
import ServiceHostPicker from '@/components/ServiceHostPicker.vue';
import EndpointTester from '@/components/EndpointTester.vue';
import SecuritySchemeMenu from '@/components/SecuritySchemeMenu.vue';
import WelcomeServiceHostInput from '@/components/WelcomeServiceHostInput.vue';

// Initialize stores and composables first
const localStorageStore = useLocalStorage();
const config = useConfigStore();

// Service host management
// Use service host management from config
const hasServiceHost = computed(() => config.hasServiceHost);

// Get router and route
const router = useRouter();
const route = useRoute();

// Get stores
const clerkStore = useClerkStore();
const openApiStore = useOpenApiStore();
const endpointStore = useEndpointStore();

// Use feature toggle composable
const features = useFeaturesToggle();

// Only use Clerk if key exists
let clerkAvailable = clerkStore.hasClerkKey;
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

// Safely access Clerk auth state
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

// Use endpoint store for selected endpoint and auth scheme
const selectedPath = computed(() => endpointStore.selectedPath);
const selectedMethod = computed(() => endpointStore.selectedMethod);
const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);

const expandedGroups = ref<Set<string>>(new Set());
const expandedSchemaRefs = ref<Set<string>>(new Set());
const exampleViewMode = ref<Map<string, boolean>>(new Map()); // Track schema/example mode per item
const sidebarCollapsed = ref(false);
const examplesSidebarCollapsed = ref(false);
const endpointsSidebarWidth = ref(500);
const examplesSidebarWidth = ref(400);
const isResizingEndpoints = ref(false);
const isResizingExamples = ref(false);

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

    // First, try to group by tags
    for (const endpoint of endpoints.value) {
        const tags = endpoint.operation.tags || [];

        if (tags.length > 0) {
            // Use the first tag as the group name
            const groupName = tags[0];
            if (groupName) {
                if (!groups.has(groupName)) {
                    groups.set(groupName, { name: groupName, endpoints: [] });
                }
                groups.get(groupName)!.endpoints.push(endpoint);
            }
        } else {
            // If no tags, group by path prefix
            const pathParts = endpoint.path.split('/').filter(p => p);
            const groupName = pathParts.length > 0 ? `/${pathParts[0]}` : 'Other';

            if (!groups.has(groupName)) {
                groups.set(groupName, { name: groupName, endpoints: [] });
            }
            groups.get(groupName)!.endpoints.push(endpoint);
        }
    }

    // Expand all groups by default
    if (expandedGroups.value.size === 0) {
        groups.forEach((_, name) => expandedGroups.value.add(name));
    }

    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
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

// Cache for endpoint hashes
const endpointHashCache = new Map<string, string>();

// Generate a deterministic hash from path and method using Web Crypto API
async function generateEndpointHashAsync(path: string, method: string): Promise<string> {
    const key = `${method}:${path}`;
    
    // Check cache first
    if (endpointHashCache.has(key)) {
        return endpointHashCache.get(key)!;
    }
    
    // Generate hash using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); // Use first 16 chars for shorter hash
    
    // Cache the result
    endpointHashCache.set(key, hashHex);
    return hashHex;
}

// Synchronous version that uses cache (for template use)
function generateEndpointHash(path: string, method: string): string {
    const key = `${method}:${path}`;
    return endpointHashCache.get(key) || '';
}

// Parse query string endpoint parameter back to path and method
async function parseEndpointFromQuery(): Promise<{ path: string; method: string } | null> {
    const endpointHash = route.query.endpoint as string | undefined;
    if (!endpointHash) return null;
    
    // Try to find the endpoint by matching hash
    for (const endpoint of endpoints.value) {
        const endpointHashComputed = await generateEndpointHashAsync(endpoint.path, endpoint.method);
        if (endpointHashComputed === endpointHash) {
            return { path: endpoint.path, method: endpoint.method };
        }
    }
    return null;
}

onMounted(async () => {
    // Load Clerk publishable key from localStorage store
    clerkStore.loadClerkKey();
    
    // Initialize config store (loads all settings from localStorage)
    config.initialize();
    
    // Load sidebar collapsed states from localStorage
    sidebarCollapsed.value = localStorageStore.loadSidebarCollapsed();
    examplesSidebarCollapsed.value = localStorageStore.loadExamplesSidebarCollapsed();
    
    // Load sidebar widths from localStorage
    endpointsSidebarWidth.value = localStorageStore.loadEndpointsSidebarWidth();
    examplesSidebarWidth.value = localStorageStore.loadExamplesSidebarWidth();

    // Load OpenAPI spec if a service host is selected
    await config.loadOpenApiSpec();

    // Pre-compute all endpoint hashes for synchronous access in template
    for (const endpoint of endpoints.value) {
        await generateEndpointHashAsync(endpoint.path, endpoint.method);
    }

    // Check for URL query parameter and select endpoint if found
    const parsed = await parseEndpointFromQuery();
    if (parsed) {
        // Use nextTick to ensure the DOM is ready
        await nextTick();
        await selectEndpoint(parsed.path, parsed.method, false);
    }

    // Watch for route query changes (browser back/forward)
    watch(() => route.query.endpoint, async (newEndpointHash) => {
        if (newEndpointHash) {
            const parsed = await parseEndpointFromQuery();
            if (parsed && (selectedPath.value !== parsed.path || selectedMethod.value !== parsed.method)) {
                // Only update if different from current selection to avoid infinite loops
                // Don't update query since we're responding to a query change
                await selectEndpoint(parsed.path, parsed.method, false);
            }
        } else if (selectedPath.value || selectedMethod.value) {
            // Clear selection if endpoint parameter is removed
            endpointStore.setSelectedEndpoint(null, null);
        }
    });

    // Watch for sidebar state changes and save to localStorage
    watch(sidebarCollapsed, (newValue) => {
        localStorageStore.saveSidebarCollapsed(newValue);
    });

    watch(examplesSidebarCollapsed, (newValue) => {
        localStorageStore.saveExamplesSidebarCollapsed(newValue);
    });

    // Watch for sidebar width changes and save to localStorage
    watch(endpointsSidebarWidth, (newValue) => {
        localStorageStore.saveEndpointsSidebarWidth(newValue);
    });

    watch(examplesSidebarWidth, (newValue) => {
        localStorageStore.saveExamplesSidebarWidth(newValue);
    });
});

// Drag handlers for resizing sidebars
const startResizeEndpoints = (e: MouseEvent) => {
    isResizingEndpoints.value = true;
    const startX = e.clientX;
    const startWidth = endpointsSidebarWidth.value;

    const handleMouseMove = (e: MouseEvent) => {
        // For left sidebar: dragging right (e.clientX increases) should increase width
        const diff = e.clientX - startX;
        const newWidth = Math.max(200, Math.min(800, startWidth + diff));
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
        // For right sidebar: dragging left (e.clientX decreases) should increase width
        const diff = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(800, startWidth + diff));
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
    // Clear expanded schema refs and view modes when switching endpoints
    expandedSchemaRefs.value.clear();
    exampleViewMode.value.clear();

    // Update URL query string (unless called from query change handler)
    if (updateHash) {
        // Ensure hash is computed (should be in cache from pre-computation)
        const hash = generateEndpointHash(path, method) || await generateEndpointHashAsync(path, method);
        // Only update if different to avoid triggering route watcher
        if (route.query.endpoint !== hash) {
            // Use router to update query string
            await router.replace({
                query: {
                    ...route.query,
                    endpoint: hash,
                },
            });
        }
    }
};

const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
        GET: '#61affe',
        POST: '#49cc90',
        PUT: '#fca130',
        PATCH: '#50e3c2',
        DELETE: '#f93e3e',
    };
    return colors[method] || '#999';
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

// Check if an endpoint requires security
const endpointRequiresSecurity = (operation: OpenAPIV3.OperationObject): boolean => {
    return openApiStore.endpointRequiresSecurity(operation);
};

// Extract title and description from OpenAPI spec
const openApiTitle = computed(() => openApiStore.openApiTitle);
const openApiDescription = computed(() => openApiStore.openApiDescription);
const openApiVersion = computed(() => openApiStore.openApiVersion);

// Get selected security scheme display name
const selectedSchemeName = computed(() => {
    if (!selectedAuthScheme.value) return 'Anonymous';
    if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) return 'Clerk Bearer';
    const securitySchemes = openApiStore.securitySchemes;
    const scheme = securitySchemes.find(s => s.name === selectedAuthScheme.value);
    return scheme ? scheme.name : 'Anonymous';
});

// Refresh OpenAPI spec
const refreshOpenApiSpec = async () => {
    config.clearConfigCache();
    await openApiStore.loadSpec();
};
</script>

<template>
    <div class="openapi-test">
        <header class="test-header">
            <div class="header-content">
                <div class="header-title-section">
                    <div class="title-section-content">
                        <div class="title-row">
                            <h1 class="logo">{{ openApiTitle }}</h1>
                            <div v-if="openApiVersion" class="api-version">v{{ openApiVersion }}</div>
                           
                        </div>
                        <p v-if="openApiDescription" class="api-description">{{ openApiDescription }}</p>
                    </div>
                    <div class="header-title-section"  v-if="hasServiceHost">
                        <button 
                        v-if="hasServiceHost"
                        @click="refreshOpenApiSpec"
                        class="refresh-spec-btn"
                        :disabled="openApiStore.loading"
                        title="Refresh OpenAPI Spec"
                    >
                    <RefreshCw :size="20" :class="{ 'spinning': openApiStore.loading }" />
                    </button>
                    </div>
                </div>
                <div class="header-actions">
                    <ServiceHostPicker 
                            v-if="features.isServiceHostPickerEnabled"
                            />
                    
                    <a 
                        :href="openApiStore.openApiSpecUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="openapi-spec-link"
                        title="View OpenAPI Spec JSON"
                    >
                        <FileText :size="20" />
                    </a>
                    <a 
                        href="https://github.com/gamja-labs/openapi-studio"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="github-link"
                        title="View on GitHub"
                    >
                        <Github :size="20" />
                    </a>
                    <button 
                        @click="endpointStore.toggleAuthMenu"
                        class="auth-menu-toggle"
                        :class="{ active: endpointStore.authMenuOpen, 'has-selection': selectedAuthScheme }"
                        title="Security Scheme"
                    >
                        <Unlock v-if="!selectedAuthScheme" :size="16" />
                        <Lock v-else :size="16" />
                        <span>{{ selectedAuthScheme ? selectedSchemeName : 'Security' }}</span>
                    </button>
                    <div v-if="clerkAvailable" class="auth-section">
                        <SignInButton v-if="!isSignedIn" mode="modal">
                            <button class="sign-in-btn">Sign In</button>
                        </SignInButton>
                        <div v-else class="user-section">
                            <UserButton />
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Security Schema Side Menu -->
        <SecuritySchemeMenu />

        <div class="test-container">
            <aside 
                v-if="hasServiceHost"
                class="endpoints-sidebar" 
                :class="{ collapsed: sidebarCollapsed, resizing: isResizingEndpoints }"
                :style="{ width: sidebarCollapsed ? '60px' : `${endpointsSidebarWidth}px` }"
            >
                <div class="sidebar-header">
                    <h2>Endpoints </h2>
                    <button 
                        @click="sidebarCollapsed = !sidebarCollapsed" 
                        class="sidebar-toggle"
                        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
                    >
                        <ChevronRight v-if="sidebarCollapsed" :size="16" />
                        <ChevronLeft v-else :size="16" />
                    </button>
                </div>
                <div class="sidebar-content" v-show="!sidebarCollapsed">
                    <div v-if="loading" class="loading">Loading OpenAPI spec...</div>
                    <div v-else-if="error" class="error">{{ error }}</div>
                    <div v-else class="endpoints-groups">
                        <div v-for="group in groupedEndpoints" :key="group.name" class="endpoint-group">
                            <div class="group-header" @click="toggleGroup(group.name)">
                                <span class="group-name">{{ group.name }}</span>
                                <span class="group-count">({{ group.endpoints.length }})</span>
                                <span class="group-toggle">
                                    <ChevronDown v-if="expandedGroups.has(group.name)" :size="14" />
                                    <ChevronRight v-else :size="14" />
                                </span>
                            </div>
                            <div v-if="expandedGroups.has(group.name)" class="group-endpoints">
                                <div v-for="endpoint in group.endpoints" :key="`${endpoint.method}-${endpoint.path}`"
                                    class="endpoint-item"
                                    :class="{ active: selectedPath === endpoint.path && selectedMethod === endpoint.method }"
                                    @click.stop="selectEndpoint(endpoint.path, endpoint.method)">
                                    <span class="method-badge"
                                        :style="{ backgroundColor: getMethodColor(endpoint.method) }">
                                        {{ endpoint.method }}
                                    </span>
                                    <span class="endpoint-path">{{ endpoint.path }}</span>
                                    <span v-if="endpoint.operation.summary" class="endpoint-summary">
                                        {{ endpoint.operation.summary }}
                                    </span>
                                    <Lock v-if="endpointRequiresSecurity(endpoint.operation)" 
                                        :size="14" 
                                        class="security-indicator"
                                        title="Requires authentication" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <div 
                v-if="hasServiceHost && !sidebarCollapsed"
                class="resize-handle resize-handle-endpoints"
                @mousedown="startResizeEndpoints"
                :class="{ resizing: isResizingEndpoints }"
            ></div>

            <div v-if="selectedEndpoint" class="endpoint-content">
                <EndpointTester 
                    :path="selectedPath"
                    :method="selectedMethod"
                />

                <div 
                    v-if="!examplesSidebarCollapsed"
                    class="resize-handle resize-handle-examples"
                    @mousedown="startResizeExamples"
                    :class="{ resizing: isResizingExamples }"
                ></div>

                <!-- Examples Column -->
                <aside 
                    class="examples-sidebar" 
                    :class="{ collapsed: examplesSidebarCollapsed, resizing: isResizingExamples }"
                    :style="{ width: examplesSidebarCollapsed ? '60px' : `${examplesSidebarWidth}px` }"
                >
                    <div class="examples-header">
                        <h3>Examples</h3>
                        <button 
                            @click="examplesSidebarCollapsed = !examplesSidebarCollapsed" 
                            class="examples-toggle"
                            :title="examplesSidebarCollapsed ? 'Expand examples' : 'Collapse examples'"
                        >
                            <ChevronLeft v-if="examplesSidebarCollapsed" :size="16" />
                            <ChevronRight v-else :size="16" />
                        </button>
                    </div>
                    <div v-show="!examplesSidebarCollapsed" class="examples-content">
                        <!-- Example/Schema Request Body -->
                    <div v-if="exampleRequestBody || requestBodySchema" class="example-section">
                        <div class="example-section-header">
                            <h4>{{ isSchemaMode('request-body') ? 'Request Body Schema' : 'Example Request Body' }}</h4>
                            <div class="view-toggle">
                                <button 
                                    @click="toggleExampleViewMode('request-body')" 
                                    :class="{ active: !isSchemaMode('request-body') }"
                                    class="toggle-btn"
                                >
                                    Example
                                </button>
                                <button 
                                    @click="toggleExampleViewMode('request-body')" 
                                    :class="{ active: isSchemaMode('request-body') }"
                                    class="toggle-btn"
                                >
                                    Schema
                                </button>
                            </div>
                        </div>
                        <div class="example-content">
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
                                    :darkTheme="true"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Response Codes -->
                    <div v-if="allResponseExamples.length > 0" class="example-section">
                        <h4>Response Codes</h4>
                        <div class="response-codes-list">
                            <div v-for="responseExample in allResponseExamples" :key="responseExample.code" class="response-code-item">
                                <div class="response-code-header">
                                    <div class="response-code-left" :class="{ success: responseExample.isSuccess, error: !responseExample.isSuccess }">
                                        <span class="response-code-number">{{ responseExample.code }}</span>
                                    </div>
                                    <div class="response-code-right">
                                        <div v-if="responseExample.description" class="response-code-description">{{ responseExample.description }}</div>
                                        <div class="view-toggle">
                                            <button 
                                                @click="toggleExampleViewMode(`response-${responseExample.code}`)" 
                                                :class="{ active: !isSchemaMode(`response-${responseExample.code}`) }"
                                                class="toggle-btn small"
                                            >
                                                Example
                                            </button>
                                            <button 
                                                @click="toggleExampleViewMode(`response-${responseExample.code}`)" 
                                                :class="{ active: isSchemaMode(`response-${responseExample.code}`) }"
                                                class="toggle-btn small"
                                            >
                                                Schema
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="isSchemaMode(`response-${responseExample.code}`) ? responseExample.schema : responseExample.example" class="example-content">
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
                                            :darkTheme="true"
                                        />
                                    </div>
                                </div>
                                <div v-else class="no-example">
                                    No {{ isSchemaMode(`response-${responseExample.code}`) ? 'schema' : 'example' }} available
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="!exampleRequestBody && allResponseExamples.length === 0" class="no-examples">
                        No examples available for this endpoint.
                    </div>

                        <!-- Schema References -->
                        <div v-if="endpointSchemaReferences.length > 0" class="example-section">
                        <h4>Referenced Schemas</h4>
                        <div class="schema-references-list">
                            <div v-for="ref in endpointSchemaReferences" :key="ref.name" class="schema-reference-item">
                                <div class="schema-reference-header" @click="toggleSchemaRef(ref.name)">
                                    <span class="schema-reference-toggle">
                                        <ChevronDown v-if="expandedSchemaRefs.has(ref.name)" :size="14" />
                                        <ChevronRight v-else :size="14" />
                                    </span>
                                    <span class="schema-reference-name">{{ ref.name }}</span>
                                </div>
                                <div v-if="expandedSchemaRefs.has(ref.name)" class="example-content">
                                    <div class="schema-display">
                                        <pre class="schema-text">{{ openApiStore.formatSchemaForDisplay(ref.schema, openApiSpec!) }}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </aside>
            </div>

            <main v-else class="endpoint-tester empty">
                <div class="empty-state">
                    <div class="welcome-content">
                        <div class="welcome-icon">
                            <Rocket :size="64" />
                        </div>
                        <h1 class="welcome-title">Welcome to OpenAPI Studio</h1>
                        <p v-if="hasServiceHost" class="welcome-description">
                            Select an endpoint from the sidebar to start testing your API endpoints.
                        </p>
                        <WelcomeServiceHostInput />
                        <div v-if="hasServiceHost" class="welcome-tips">
                            <div class="tip-item">
                                <FileText :size="20" class="tip-icon" />
                                <span>Browse available endpoints in the sidebar</span>
                            </div>
                            <div class="tip-item">
                                <Zap :size="20" class="tip-icon" />
                                <span>Test requests with custom parameters</span>
                            </div>
                            <div class="tip-item">
                                <BarChart :size="20" class="tip-icon" />
                                <span>View responses and schema documentation</span>
                            </div>
                        </div>
                    </div>
                </div>
                <footer class="app-footer">
                    <p>&copy; {{ new Date().getFullYear() }} Gamja Labs</p>
                </footer>
            </main>
        </div>
    </div>
</template>

<style lang="scss">
// Component-specific styles
.openapi-test {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    overflow: hidden;
}

.test-header {
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    flex-shrink: 0;
    z-index: 100;
}

.app-footer {
    margin-top: auto;
    text-align: center;

    p {
        margin: 0;
        font-size: 0.875rem;
        color: hsl(var(--muted-foreground));
    }
}

.header-content {
    max-width: 100%;
    margin: 0 auto;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
}

.header-title-section {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
}

.title-section-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
}

.title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.logo {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
}

.api-version {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    font-weight: 500;
}

.api-description {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.4;
    max-width: 600px;
}

.header-title-action {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
}

.refresh-spec-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: hsl(var(--foreground));
    cursor: pointer;
    padding: 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    transition: color 0.2s, opacity 0.2s, background-color 0.2s;

    &:hover:not(:disabled) {
        background: hsl(var(--muted) / 0.3);
        color: hsl(var(--primary));
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .spinning {
        animation: spin 1s linear infinite;
    }
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.openapi-spec-link,
.github-link {
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--foreground));
    text-decoration: none;
    transition: color 0.2s, opacity 0.2s;
    padding: 0.5rem;
    border-radius: calc(var(--radius) - 2px);

    &:hover {
        color: hsl(var(--primary));
        opacity: 0.8;
    }

    &:focus {
        outline: none;
        color: hsl(var(--primary));
    }
}

.auth-section {
    display: flex;
    align-items: center;
}

.sign-in-btn {
    padding: 0.5rem 1rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.2s;

    &:hover {
        opacity: 0.9;
    }
}

.user-section {
    display: flex;
    align-items: center;
}

.auth-menu-toggle {
    padding: 0.5rem 1rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
        background: hsl(var(--accent));
        opacity: 0.9;
    }

    &.active {
        background: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
    }

    &.has-selection {
        background: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
        
        svg {
            color: hsl(var(--primary-foreground));
        }
    }
}


.test-container {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.endpoints-sidebar {
    background: hsl(var(--card));
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
    transition: width 0.3s ease;

    &.resizing {
        transition: none;
    }

    .sidebar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        flex-shrink: 0;

        h2 {
            font-size: 1rem;
            margin: 0;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    &.collapsed .sidebar-header {
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem 0.5rem;

        h2 {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
        }
    }
}

.sidebar-toggle {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    line-height: 1;
    transition: all 0.2s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: hsl(var(--accent));
        opacity: 0.9;
    }

    &:active {
        transform: scale(0.95);
    }
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding-left: 1rem;
    padding-bottom: 1rem;
}

.resize-handle {
    width: 8px;
    background: hsl(var(--card));
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    user-select: none;
    display: flex;
    justify-content: center;
    align-items: stretch;

    &::before {
        content: '';
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 8px;
        top: 0;
        bottom: 0;
        // background: hsl(var(--border));
        cursor: col-resize;
        transition: background-color 0.2s;
    }

    &:hover::before {
        background: hsl(var(--accent));
    }

    &.resizing::before {
        background: hsl(var(--accent));
    }
}

.resize-handle-endpoints {
    border-right: 1px solid hsl(var(--border));
}

.resize-handle-examples {
    border-left: 1px solid hsl(var(--border));
}

.loading,
.error {
    padding: 0.75rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
}

.error {
    color: hsl(var(--destructive));
}

.endpoints-groups {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 1rem;
}

.endpoint-group {
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    overflow: hidden;
}

.group-header {
    padding: 0.5rem 0.75rem;
    background: hsl(var(--muted));
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    transition: background 0.2s;
    user-select: none;

    &:hover {
        background: hsl(var(--accent));
    }
}

.group-name {
    font-weight: 600;
    font-size: 0.8125rem;
    color: hsl(var(--foreground));
    flex: 1;
}

.group-count {
    font-size: 0.6875rem;
    color: hsl(var(--muted-foreground));
}

.group-toggle {
    color: hsl(var(--muted-foreground));
    width: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.group-endpoints {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    background: hsl(var(--card));
    min-width: 0;
}

.endpoint-item {
    padding: 0.375rem 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;

    &:hover {
        background: hsl(var(--accent));
    }

    &.active {
        background: hsl(var(--accent));
    }
}

.method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    color: white;
    font-weight: 600;
    font-size: 0.625rem;
    text-transform: uppercase;
    flex-shrink: 0;
    line-height: 1.2;
    width: 3.5rem;
    min-width: 3.5rem;
    max-width: 3.5rem;
    text-align: center;
    box-sizing: border-box;
}

.endpoint-path {
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.75rem;
    color: hsl(var(--foreground));
    font-weight: 500;
    flex: 1;
    line-height: 1.3;
    white-space: nowrap;
    overflow: visible;
}

.endpoint-summary {
    font-size: 0.6875rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.3;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: auto;
}

.security-indicator {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0.7;
}

.endpoint-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.endpoint-tester.empty {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    background-color: hsl(var(--background));
    background-image: 
        linear-gradient(hsl(var(--border) / 0.3) 1px, transparent 1px),
        linear-gradient(90deg, hsl(var(--border) / 0.3) 1px, transparent 1px);
    background-size: 50px 50px;
    background-position: 0 0, 0 0;
    border-right: 1px solid hsl(var(--border));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.examples-sidebar {
    border-right: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    transition: width 0.3s ease;

    &.resizing {
        transition: none;
    }

    &.collapsed {
        padding: 1.5rem 0.5rem;
    }
}

.examples-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    padding: 1rem;

    h3 {
        font-size: 1rem;
        margin-bottom: 0;
        margin-top: 0;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.examples-sidebar.collapsed .examples-header {
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0;

    h3 {
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
    }
}

.examples-toggle {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    line-height: 1;
    transition: all 0.2s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: hsl(var(--accent));
        opacity: 0.9;
    }

    &:active {
        transform: scale(0.95);
    }
}

.examples-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding-left: 1rem;
}

.view-toggle {
    display: inline-flex;
    gap: 0;
    background: transparent;
    border-radius: calc(var(--radius) - 2px);
    padding: 0;
    border: 1px solid hsl(var(--border));
    overflow: hidden;
}

.toggle-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    transition: all 0.2s ease;
    white-space: nowrap;
    border-right: 1px solid hsl(var(--border));

    &:last-child {
        border-right: none;
    }

    &:hover {
        color: hsl(var(--foreground));
    }

    &.active {
        background: hsl(var(--muted));
        color: hsl(var(--foreground));
    }

    &.small {
        padding: 0.25rem 0.5rem;
        font-size: 0.6875rem;
    }
}

.example-section {
    padding-right: 1rem;
    margin-bottom: 1.5rem;
    flex-shrink: 0;

    h4 {
        font-size: 0.75rem;
        margin-bottom: 0.75rem;
        margin-top: 0;
        font-weight: 600;
        color: hsl(var(--foreground));
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
}

.example-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;

    h4 {
        margin-bottom: 0;
    }
}

.example-content {
    border: none;
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--input));
    box-shadow: none;

    pre {
        margin: 0;
        padding: 1rem;
        font-family: 'Chivo Mono Variable', monospace;
        font-size: 0.875rem;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-x: auto;
        max-height: 400px;
        overflow-y: auto;
    }

    .json-editor-wrapper {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border: none;
        box-shadow: none;
    }

    .schema-display {
        border: none;
        box-shadow: none;
        max-height: 400px;
        min-height: 150px;
        overflow-y: auto;
        overflow-x: auto;
        background: hsl(var(--input));
    }

    .schema-text {
        margin: 0;
        padding: 1rem;
        font-family: 'Chivo Mono Variable', monospace;
        font-size: 0.8125rem;
        line-height: 1.8;
        color: hsl(var(--foreground));
        white-space: pre;
        overflow-x: auto;
        background: hsl(var(--input));
        border-radius: calc(var(--radius) - 2px);
    }
}

.no-examples {
    padding: 1.5rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    border: 1px dashed hsl(var(--border));
    border-radius: var(--radius);
    font-size: 0.875rem;
}

.response-codes-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.response-code-item {
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    overflow: hidden;
    background: hsl(var(--card));
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);

    .example-content {
        border: none;
        border-radius: 0;
        box-shadow: none;
        margin-top: 0;
        border-top: 1px solid hsl(var(--border));

        pre {
            max-height: 300px;
        }

        .json-editor-wrapper {
            border: none;
            box-shadow: none;
        }

        .schema-display {
            border: none;
            box-shadow: none;
            max-height: 300px;
            min-height: 100px;
            overflow-y: auto;
            overflow-x: auto;
            background: hsl(var(--input));
        }

        .schema-text {
            margin: 0;
            padding: 0.75rem;
            font-family: 'Chivo Mono Variable', monospace;
            font-size: 0.75rem;
            line-height: 1.7;
            color: hsl(var(--foreground));
            white-space: pre;
            overflow-x: auto;
            background: hsl(var(--input));
        }
    }
}

.response-code-header {
    display: flex;
    border-bottom: 1px solid hsl(var(--border));
    min-height: 0;
}

.response-code-left {
    width: 4rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.625rem 0.5rem;
    background: hsl(var(--muted) / 0.3);
    border-right: 1px solid hsl(var(--border));

    &.success {
        background: hsl(142 76% 36% / 0.1);
        border-right-color: hsl(142 76% 36% / 0.2);
    }

    &.error {
        background: hsl(0 84% 60% / 0.1);
        border-right-color: hsl(0 84% 60% / 0.2);
    }
}

.response-code-number {
    font-weight: 600;
    font-size: 0.75rem;
    font-family: 'Chivo Mono Variable', monospace;
    text-align: center;
    padding: 0.3125rem 0.5rem;
    border-radius: calc(var(--radius) - 4px);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    line-height: 1.2;
    width: 100%;

    .response-code-left.success & {
        background: hsl(142 76% 36% / 0.15);
        color: hsl(142 76% 36%);
        border-color: hsl(142 76% 36% / 0.3);
    }

    .response-code-left.error & {
        background: hsl(0 84% 60% / 0.15);
        color: hsl(0 84% 60%);
        border-color: hsl(0 84% 60% / 0.3);
    }
}

.response-code-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: hsl(var(--card));
    min-width: 0;
}

.response-code-description {
    font-size: 0.8125rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
    word-wrap: break-word;
    white-space: pre-wrap;
    display: block;
}

.response-code-right .view-toggle {
    align-self: flex-end;
}

.no-example {
    padding: 0.75rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    font-style: italic;
}

.schema-references-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.schema-reference-item {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--card));

    .example-content {
        border: none;
        border-radius: 0;
        box-shadow: none;
        margin-top: 0;

        .schema-display {
            border: none;
            box-shadow: none;
            max-height: 300px;
            min-height: 100px;
            overflow-y: auto;
            overflow-x: auto;
            background: hsl(var(--input));
        }

        .schema-text {
            margin: 0;
            padding: 0.875rem;
            font-family: 'Chivo Mono Variable', monospace;
            font-size: 0.75rem;
            line-height: 1.7;
            color: hsl(var(--foreground));
            white-space: pre;
            overflow-x: auto;
            background: hsl(var(--input));
        }
    }
}

.schema-reference-header {
    padding: 0.75rem 1rem;
    background: hsl(var(--muted));
    border-bottom: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
    user-select: none;

    &:hover {
        background: hsl(var(--accent));
    }
}

.schema-reference-toggle {
    color: hsl(var(--muted-foreground));
    width: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.schema-reference-name {
    font-weight: 700;
    font-size: 0.875rem;
    font-family: 'Chivo Mono Variable', monospace;
    color: hsl(var(--foreground));
    flex: 1;
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
}

.welcome-content {
    max-width: 600px;
    text-align: center;
    animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.welcome-icon {
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: center;
    color: hsl(var(--foreground));
    opacity: 0.9;
}

.welcome-title {
    font-size: 2rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 1rem 0;
    letter-spacing: -0.02em;
}

.welcome-description {
    font-size: 1.125rem;
    color: hsl(var(--muted-foreground));
    margin: 0 0 2.5rem 0;
    line-height: 1.6;
}


.welcome-tips {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 2rem;
    text-align: left;
}

.tip-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 0.9375rem;
    cursor: default;
    user-select: none;
}

.tip-icon {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
}


.json-editor-wrapper {
    width: 100%;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: auto;
    background: hsl(var(--input));

    :deep(.jsoneditor) {
        border: none;
        background: hsl(var(--input));
    }

    :deep(.jsoneditor-menu) {
        background: hsl(var(--muted));
        border-bottom: none;
    }

    :deep(.jsoneditor-outer) {
        background: hsl(var(--input));
    }

    :deep(.ace_editor) {
        background: hsl(var(--input)) !important;
        color: hsl(var(--foreground)) !important;
    }

    :deep(.ace_gutter) {
        background: hsl(var(--muted)) !important;
    }
}


</style>
