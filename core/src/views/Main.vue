<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@clerk/vue';
import { SignInButton, UserButton } from '@clerk/vue';
import type { OpenAPIV3 } from 'openapi-types';
import JsonEditorVue from 'vue3-ts-jsoneditor';
import { Lock, X, ChevronRight, ChevronDown, ChevronLeft, Copy, Github, Rocket, FileText, Zap, BarChart, Unlock } from 'lucide-vue-next';
import { useClerkStore } from '@/stores/clerk';
import { useOpenApiStore } from '@/stores/openapi';
import { useLocalStorageStore } from '@/stores/localStorage';
import { getServiceHostSync, getConfigJsonPath } from '@/utils/config';

// Get router and route
const router = useRouter();
const route = useRoute();

// Get stores
const clerkStore = useClerkStore();
const openApiStore = useOpenApiStore();
const localStorageStore = useLocalStorageStore();

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

const getToken = authState?.getToken?.value ?? (() => Promise.resolve(null));

const isLoaded = computed(() => {
    if (!authState) return false;
    try {
        return authState.isLoaded.value ?? false;
    } catch {
        return false;
    }
});

const openApiSpec = computed(() => openApiStore.openApiSpec);
const loading = computed(() => openApiStore.loading);
const error = computed(() => openApiStore.error);
const selectedPath = ref<string | null>(null);
const selectedAuthScheme = ref<string | null>(null);
const CLERK_BEARER_SCHEME = '__clerk_bearer__';
const selectedMethod = ref<string | null>(null);
const requestParams = ref<Record<string, any>>({});
const requestBody = ref<string>('');
const response = ref<any>(null);
const responseError = ref<string | null>(null);
const sendingRequest = ref(false);
const expandedGroups = ref<Set<string>>(new Set());
const expandedSchemaRefs = ref<Set<string>>(new Set());
const exampleViewMode = ref<Map<string, boolean>>(new Map()); // Track schema/example mode per item
const authMenuOpen = ref(false);
// Auth credentials are in-memory only (not persisted)
const authCredentials = ref<Record<string, any>>({});
const sidebarCollapsed = ref(false);
const examplesSidebarCollapsed = ref(false);
const expandedCurlSections = ref<Set<string>>(new Set());
const endpointsSidebarWidth = ref(500);
const examplesSidebarWidth = ref(400);
const isResizingEndpoints = ref(false);
const isResizingExamples = ref(false);

type RequestHistoryItem = {
    id: string;
    timestamp: Date;
    method: string;
    path: string;
    url: string;
    requestBody: any;
    requestParams: Record<string, any>;
    headers: Record<string, string>;
    response: any;
    responseError: string | null;
    status?: number;
    statusText?: string;
    authScheme?: string | null;
};

const requestHistory = ref<RequestHistoryItem[]>([]);

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
    // Initialize localStorage store (loads all data)
    localStorageStore.initialize();
    
    // Load Clerk publishable key from localStorage store
    clerkStore.loadClerkKey();

    // Load sidebar collapsed states from localStorage
    sidebarCollapsed.value = localStorageStore.loadSidebarCollapsed();
    examplesSidebarCollapsed.value = localStorageStore.loadExamplesSidebarCollapsed();
    
    // Load sidebar widths from localStorage
    endpointsSidebarWidth.value = localStorageStore.loadEndpointsSidebarWidth();
    examplesSidebarWidth.value = localStorageStore.loadExamplesSidebarWidth();

    await openApiStore.loadSpec();

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
            selectedPath.value = null;
            selectedMethod.value = null;
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

const updateAuthCredential = (schemeName: string, field: string, value: any) => {
    // Update auth credentials in memory
    if (!authCredentials.value[schemeName]) {
        authCredentials.value[schemeName] = {};
    }
    authCredentials.value[schemeName][field] = value;
};

const clearAuthCredential = (schemeName: string) => {
    delete authCredentials.value[schemeName];
};

const saveClerkKey = () => {
    clerkStore.saveClerkKey();
};

const clearClerkKey = () => {
    clerkStore.clearClerkKey();
};

const selectEndpoint = async (path: string, method: string, updateHash = true) => {
    selectedPath.value = path;
    selectedMethod.value = method;
    requestParams.value = {};
    requestBody.value = '';
    response.value = null;
    responseError.value = null;
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

    // Find the endpoint
    const endpoint = endpoints.value.find(e => e.path === path && e.method === method);

    // Initialize request params from the endpoint
    if (endpoint?.operation.parameters) {
        for (const param of endpoint.operation.parameters) {
            const resolved = openApiStore.resolveParameter(param);
            if (resolved && (resolved.in === 'query' || resolved.in === 'path')) {
                requestParams.value[resolved.name] = '';
            }
        }
    }

    // Initialize request body if needed
    if (endpoint?.operation.requestBody) {
        let requestBodyObj: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined = endpoint.operation.requestBody;
        
        // Handle reference
        if (requestBodyObj && typeof requestBodyObj === 'object' && '$ref' in requestBodyObj && requestBodyObj.$ref && openApiSpec.value) {
            const refValue = openApiStore.resolveReference<OpenAPIV3.RequestBodyObject>(requestBodyObj.$ref, openApiSpec.value);
            if (refValue && typeof refValue === 'object') {
                requestBodyObj = refValue;
            }
        }
        
        if (requestBodyObj && typeof requestBodyObj === 'object' && 'content' in requestBodyObj && requestBodyObj.content) {
            const jsonContent = requestBodyObj.content['application/json'];
            if (jsonContent?.schema && openApiSpec.value) {
                // Generate example from schema
                const example = openApiStore.generateExampleFromSchema(jsonContent.schema, openApiSpec.value);
                requestBody.value = JSON.stringify(example || {}, null, 2);
            } else {
                requestBody.value = JSON.stringify({}, null, 2);
            }
        }
    }
};

const sendRequest = async () => {
    if (!selectedPath.value || !selectedMethod.value) return;

    sendingRequest.value = true;
    response.value = null;
    responseError.value = null;

    // Create history item
    const historyItem: RequestHistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        method: selectedMethod.value,
        path: selectedPath.value || '',
        url: '',
        requestBody: requestBody.value.trim() ? (() => {
            try {
                return JSON.parse(requestBody.value);
            } catch {
                return requestBody.value;
            }
        })() : null,
        requestParams: { ...requestParams.value },
        headers: {},
        response: null,
        responseError: null,
        authScheme: selectedAuthScheme.value,
    };

    try {
        const SERVICE_HOST = getServiceHostSync();
        let url = `${SERVICE_HOST}${selectedPath.value}`;

        // Replace path parameters
        const pathParams: Record<string, string> = {};
        const queryParams = new URLSearchParams();

        for (const [key, value] of Object.entries(requestParams.value)) {
            if (value !== '' && value != null) {
                const endpoint = endpoints.value.find(e => e.path === selectedPath.value && e.method === selectedMethod.value);
                let isPathParam = false;
                
                if (endpoint?.operation.parameters) {
                    for (const p of endpoint.operation.parameters) {
                        const resolved = openApiStore.resolveParameter(p);
                        if (resolved && resolved.name === key) {
                            isPathParam = resolved.in === 'path';
                            break;
                        }
                    }
                }

                if (isPathParam) {
                    pathParams[key] = String(value);
                } else {
                    queryParams.append(key, String(value));
                }
            }
        }

        // Replace path parameters in URL
        for (const [key, value] of Object.entries(pathParams)) {
            url = url.replace(`{${key}}`, encodeURIComponent(value));
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // Apply selected OpenAPI security scheme credentials
        // Handle Clerk Bearer Auth (special case)
        if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) {
            if (isSignedIn.value) {
                if (!isLoaded.value) {
                    await new Promise(resolve => {
                        const checkLoaded = setInterval(() => {
                            if (isLoaded.value) {
                                clearInterval(checkLoaded);
                                resolve(undefined);
                            }
                        }, 100);
                    });
                }
                const token = await getToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
        } else if (selectedAuthScheme.value && openApiSpec.value?.components?.securitySchemes) {
            const scheme = openApiSpec.value.components.securitySchemes[selectedAuthScheme.value];
            if (scheme && typeof scheme === 'object' && !('$ref' in scheme)) {
                const credentials = authCredentials.value[selectedAuthScheme.value];
                
                if (scheme.type === 'apiKey') {
                    const apiKeyScheme = scheme as OpenAPIV3.ApiKeySecurityScheme;
                    if (credentials?.value) {
                        if (apiKeyScheme.in === 'header') {
                            headers[apiKeyScheme.name] = credentials.value;
                        } else if (apiKeyScheme.in === 'query') {
                            queryParams.append(apiKeyScheme.name, credentials.value);
                        } else if (apiKeyScheme.in === 'cookie') {
                            // Note: cookies are handled by the browser automatically
                            // This would need to be set via document.cookie or a cookie library
                        }
                    }
                } else if (scheme.type === 'http') {
                    const httpScheme = scheme as OpenAPIV3.HttpSecurityScheme;
                    if (httpScheme.scheme === 'basic') {
                        if (credentials?.username && credentials?.password) {
                            const credentialsStr = `${credentials.username}:${credentials.password}`;
                            headers['Authorization'] = `Basic ${btoa(credentialsStr)}`;
                        }
                    } else if (httpScheme.scheme === 'bearer') {
                        // Use manual token
                        if (credentials?.token) {
                            headers['Authorization'] = `Bearer ${credentials.token}`;
                        }
                    }
                } else if (scheme.type === 'oauth2') {
                    // Use manual token
                    if (credentials?.accessToken) {
                        headers['Authorization'] = `Bearer ${credentials.accessToken}`;
                    }
                } else if (scheme.type === 'openIdConnect') {
                    // Use manual token
                    if (credentials?.idToken) {
                        headers['Authorization'] = `Bearer ${credentials.idToken}`;
                    }
                }
            }
        }

        // Add query parameters (including any from security schemes)
        if (queryParams.toString()) {
            url += `?${queryParams.toString()}`;
        }

        historyItem.url = url;
        // Store headers in history item for curl formatting
        historyItem.headers = { ...headers };

        const options: RequestInit = {
            method: selectedMethod.value,
            headers,
        };

        // Add body for methods that support it
        if (['POST', 'PUT', 'PATCH'].includes(selectedMethod.value) && requestBody.value.trim()) {
            try {
                console.log(requestBody.value);
                options.body = JSON.stringify(JSON.parse(requestBody.value));
                console.log(options.body);
            } catch (e) {
                const error = 'Invalid JSON in request body';
                responseError.value = error;
                historyItem.responseError = error;
                requestHistory.value.unshift(historyItem);
                sendingRequest.value = false;
                return;
            }
        }

        const res = await fetch(url, options);
        const contentType = res.headers.get('content-type');

        let responseData: any;
        if (contentType?.includes('application/json')) {
            responseData = {
                status: res.status,
                statusText: res.statusText,
                headers: Object.fromEntries(res.headers.entries()),
                body: await res.json(),
            };
        } else {
            const text = await res.text();
            responseData = {
                status: res.status,
                statusText: res.statusText,
                headers: Object.fromEntries(res.headers.entries()),
                body: text,
            };
        }

        response.value = responseData;
        historyItem.response = responseData;
        historyItem.status = res.status;
        historyItem.statusText = res.statusText;
    } catch (err) {
        const error = err instanceof Error ? err.message : 'Request failed';
        responseError.value = error;
        historyItem.responseError = error;
    } finally {
        sendingRequest.value = false;
        requestHistory.value.unshift(historyItem);
    }
};

const formatAsCurl = (item: RequestHistoryItem): string => {
    const parts: string[] = ['curl'];
    
    // Add method
    if (item.method !== 'GET') {
        parts.push(`-X ${item.method}`);
    }
    
    // Add headers
    for (const [key, value] of Object.entries(item.headers || {})) {
        // Escape quotes in header values
        const escapedValue = value.replace(/"/g, '\\"');
        parts.push(`-H "${key}: ${escapedValue}"`);
    }
    
    // Add request body for methods that support it
    if (['POST', 'PUT', 'PATCH'].includes(item.method) && item.requestBody) {
        const bodyStr = typeof item.requestBody === 'string' 
            ? item.requestBody 
            : JSON.stringify(item.requestBody, null, 2);
        // Escape single quotes and newlines for shell
        const escapedBody = bodyStr
            .replace(/'/g, "'\\''")
            .replace(/\n/g, '\\n');
        parts.push(`-d '${escapedBody}'`);
    }
    
    // Add URL (should be last)
    parts.push(`"${item.url}"`);
    
    return parts.join(' \\\n  ');
};

const copyCurlToClipboard = async (item: RequestHistoryItem) => {
    const curlCommand = formatAsCurl(item);
    try {
        await navigator.clipboard.writeText(curlCommand);
        // You could add a toast notification here if desired
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
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

const pathParameters = computed(() => {
    if (!selectedEndpoint.value || !selectedEndpoint.value.parameters) return [];
    return selectedEndpoint.value.parameters
        .map(openApiStore.resolveParameter)
        .filter((p): p is OpenAPIV3.ParameterObject => p !== null && p.in === 'path');
});

const queryParameters = computed(() => {
    if (!selectedEndpoint.value || !selectedEndpoint.value.parameters) return [];
    return selectedEndpoint.value.parameters
        .map(openApiStore.resolveParameter)
        .filter((p): p is OpenAPIV3.ParameterObject => p !== null && p.in === 'query');
});

const requestBodyJson = computed({
    get: () => {
        if (!requestBody.value.trim()) return "{}";
        try {
            return requestBody.value;
        } catch {
            return "{}";
        }
    },
    set: (value: string) => {
        requestBody.value = value;
    }
});

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

// Extract security schemes from OpenAPI spec
const securitySchemes = computed(() => openApiStore.securitySchemes);

// Check if an endpoint requires security
const endpointRequiresSecurity = (operation: OpenAPIV3.OperationObject): boolean => {
    return openApiStore.endpointRequiresSecurity(operation);
};

// Get available security schemes for the selected endpoint
const availableSecuritySchemes = computed(() => {
    if (!selectedEndpoint.value) return [];
    return openApiStore.getAvailableSecuritySchemes(selectedEndpoint.value);
});

// Check if any scheme uses bearer authentication
const hasBearerScheme = computed(() => {
    const schemesToCheck = selectedEndpoint.value ? availableSecuritySchemes.value : securitySchemes.value;
    return schemesToCheck.some(item => 
        item.scheme.type === 'http' && 
        (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'bearer'
    );
});

// Get security schemes to display - show only schemes available for the selected endpoint
// Also include Clerk Bearer if bearer auth is available and Clerk is enabled
const displayedSecuritySchemes = computed(() => {
    // Use available schemes for the selected endpoint, or all schemes if no endpoint selected
    const schemes = selectedEndpoint.value 
        ? [...availableSecuritySchemes.value]
        : [...securitySchemes.value];
    
    // Add Clerk Bearer if bearer auth is available and Clerk is enabled
    if (hasBearerScheme.value && clerkAvailable) {
        // Check if Clerk Bearer is not already in the list
        const hasClerkBearer = schemes.some(s => s.name === CLERK_BEARER_SCHEME);
        if (!hasClerkBearer) {
            schemes.push({
                name: CLERK_BEARER_SCHEME,
                scheme: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Clerk Bearer Authentication'
                } as OpenAPIV3.HttpSecurityScheme
            });
        }
    }
    
    return schemes;
});

// Extract title and description from OpenAPI spec
const openApiTitle = computed(() => openApiStore.openApiTitle);
const openApiDescription = computed(() => openApiStore.openApiDescription);
const openApiVersion = computed(() => openApiStore.openApiVersion);

// Check if Clerk key is saved in localStorage (using store)
const hasSavedClerkKey = computed(() => clerkStore.hasSavedClerkKey);

// Check if Clerk key is read-only (from config.json or env var)
const isClerkKeyReadOnly = computed(() => clerkStore.isClerkKeyReadOnly);
const clerkKeySource = computed(() => clerkStore.clerkKeySource);

// Get message for clerk key source
const clerkKeySourceMessage = computed(() => {
    const source = clerkKeySource.value;
    if (source === 'config.json') {
        return `Key loaded from ${getConfigJsonPath()}`;
    } else if (source === 'env') {
        return 'Key loaded from environment variable';
    }
    return null;
});

// Get selected security scheme display name
const selectedSchemeName = computed(() => {
    if (!selectedAuthScheme.value) return 'Anonymous';
    if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) return 'Clerk Bearer';
    const scheme = securitySchemes.value.find(s => s.name === selectedAuthScheme.value);
    return scheme ? scheme.name : 'Anonymous';
});

// Handle security scheme selection
const selectSecurityScheme = (schemeName: string | null) => {
    if (schemeName === null) {
        // Select anonymous
        selectedAuthScheme.value = null;
    } else if (selectedAuthScheme.value === schemeName) {
        // Deselect if clicking the same scheme
        selectedAuthScheme.value = null;
    } else {
        selectedAuthScheme.value = schemeName;
    }
};

// Filter request history for currently selected endpoint
const filteredRequestHistory = computed(() => {
    if (!selectedPath.value || !selectedMethod.value) {
        return [];
    }
    return requestHistory.value.filter(item => 
        item.path === selectedPath.value && item.method === selectedMethod.value
    );
});

// Clear history for current endpoint
const clearCurrentEndpointHistory = () => {
    if (!selectedPath.value || !selectedMethod.value) return;
    requestHistory.value = requestHistory.value.filter(item => 
        !(item.path === selectedPath.value && item.method === selectedMethod.value)
    );
};
</script>

<template>
    <div class="openapi-test">
        <header class="test-header">
            <div class="header-content">
                <div class="header-title-section">
                    <div class="title-row">
                        <h1 class="logo">{{ openApiTitle }}</h1>
                        <div v-if="openApiVersion" class="api-version">v{{ openApiVersion }}</div>
                    </div>
                    <p v-if="openApiDescription" class="api-description">{{ openApiDescription }}</p>
                </div>
                <div class="header-actions">
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
                        @click="authMenuOpen = !authMenuOpen"
                        class="auth-menu-toggle"
                        :class="{ active: authMenuOpen, 'has-selection': selectedAuthScheme }"
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
        <aside v-if="authMenuOpen" class="auth-side-menu">
            <div class="auth-menu-header">
                <h2>Security Scheme</h2>
                <button @click="authMenuOpen = false" class="close-auth-menu" title="Close">
                    <X :size="20" />
                </button>
            </div>
            <div class="auth-menu-content">
                <!-- Anonymous Option -->
                <div 
                    class="auth-scheme anonymous-option"
                    :class="{ selected: selectedAuthScheme === null }"
                    @click="selectSecurityScheme(null)"
                >
                    <div class="auth-scheme-header">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <Unlock :size="18" />
                            <h3>Anonymous</h3>
                        </div>
                        <span class="auth-scheme-type">NONE</span>
                    </div>
                    <div class="auth-scheme-description">
                        Make requests without authentication
                    </div>
                </div>

                <!-- Clerk Bearer Auth Option -->
                <div 
                    v-if="clerkAvailable"
                    class="auth-scheme clerk-bearer-option"
                    :class="{ selected: selectedAuthScheme === CLERK_BEARER_SCHEME }"
                    @click="selectSecurityScheme(CLERK_BEARER_SCHEME)"
                >
                    <div class="auth-scheme-header">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <Lock :size="18" />
                            <h3>Clerk Bearer</h3>
                        </div>
                        <span class="auth-scheme-type">CLERK</span>
                    </div>
                    <div class="auth-scheme-description">
                        Use Clerk authentication token for bearer authentication
                    </div>
                </div>

                <!-- Security Schema Cards -->
                <div 
                    v-for="item in securitySchemes" 
                    :key="item.name" 
                    class="auth-scheme"
                    :class="{ selected: selectedAuthScheme === item.name }"
                    @click="selectSecurityScheme(item.name)"
                >
                    <div class="auth-scheme-header">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <Lock :size="18" />
                            <h3>{{ item.name }}</h3>
                        </div>
                        <span class="auth-scheme-type">{{ item.scheme.type }}</span>
                    </div>
                    <div class="auth-scheme-description" v-if="item.scheme.description">
                        {{ item.scheme.description }}
                    </div>
                    
                    <!-- API Key Scheme -->
                    <div v-if="item.scheme.type === 'apiKey'" class="auth-scheme-fields" @click.stop>
                        <label>
                            <span>{{ (item.scheme as OpenAPIV3.ApiKeySecurityScheme).name }}</span>
                            <span class="field-location">({{ (item.scheme as OpenAPIV3.ApiKeySecurityScheme).in }})</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.value || ''"
                                @input="updateAuthCredential(item.name, 'value', ($event.target as HTMLInputElement).value)"
                                :placeholder="`Enter ${(item.scheme as OpenAPIV3.ApiKeySecurityScheme).name}`"
                                class="auth-input"
                            />
                        </label>
                        <button 
                            v-if="authCredentials[item.name]?.value"
                            @click="clearAuthCredential(item.name)"
                            class="clear-credential-btn"
                        >
                            Clear
                        </button>
                    </div>

                    <!-- HTTP Basic Auth -->
                    <div v-else-if="item.scheme.type === 'http' && (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'basic'" class="auth-scheme-fields" @click.stop>
                        <label>
                            <span>Username</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.username || ''"
                                @input="updateAuthCredential(item.name, 'username', ($event.target as HTMLInputElement).value)"
                                placeholder="Enter username"
                                class="auth-input"
                            />
                        </label>
                        <label>
                            <span>Password</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.password || ''"
                                @input="updateAuthCredential(item.name, 'password', ($event.target as HTMLInputElement).value)"
                                placeholder="Enter password"
                                class="auth-input"
                            />
                        </label>
                        <button 
                            v-if="authCredentials[item.name]?.username || authCredentials[item.name]?.password"
                            @click="clearAuthCredential(item.name)"
                            class="clear-credential-btn"
                        >
                            Clear
                        </button>
                    </div>

                    <!-- HTTP Bearer Auth -->
                    <div v-else-if="item.scheme.type === 'http' && (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'bearer'" class="auth-scheme-fields" @click.stop>
                        <label>
                            <span>Bearer Token</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.token || ''"
                                @input="updateAuthCredential(item.name, 'token', ($event.target as HTMLInputElement).value)"
                                placeholder="Enter bearer token"
                                class="auth-input"
                            />
                        </label>
                        <button 
                            v-if="authCredentials[item.name]?.token"
                            @click="clearAuthCredential(item.name)"
                            class="clear-credential-btn"
                        >
                            Clear
                        </button>
                    </div>

                    <!-- OAuth2 -->
                    <div v-else-if="item.scheme.type === 'oauth2'" class="auth-scheme-fields" @click.stop>
                        <label>
                            <span>Access Token</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.accessToken || ''"
                                @input="updateAuthCredential(item.name, 'accessToken', ($event.target as HTMLInputElement).value)"
                                placeholder="Enter OAuth2 access token"
                                class="auth-input"
                            />
                        </label>
                        <button 
                            v-if="authCredentials[item.name]?.accessToken"
                            @click="clearAuthCredential(item.name)"
                            class="clear-credential-btn"
                        >
                            Clear
                        </button>
                    </div>

                    <!-- OpenID Connect -->
                    <div v-else-if="item.scheme.type === 'openIdConnect'" class="auth-scheme-fields" @click.stop>
                        <label>
                            <span>ID Token</span>
                            <input
                                type="text"
                                :value="authCredentials[item.name]?.idToken || ''"
                                @input="updateAuthCredential(item.name, 'idToken', ($event.target as HTMLInputElement).value)"
                                placeholder="Enter OpenID Connect ID token"
                                class="auth-input"
                            />
                        </label>
                        <button 
                            v-if="authCredentials[item.name]?.idToken"
                            @click="clearAuthCredential(item.name)"
                            class="clear-credential-btn"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                <!-- Clerk Publishable Key Card -->
                <div class="clerk-key-card">
                    <div class="clerk-key-header">
                        <h3>Clerk Publishable Key</h3>
                    </div>
                    <div class="clerk-key-description">
                        <span v-if="clerkKeySourceMessage">
                            {{ clerkKeySourceMessage }}
                        </span>
                        <span v-else>
                            Enter your Clerk publishable key to enable authentication. This will be stored locally in your browser.
                        </span>
                    </div>
                    <div class="clerk-key-fields">
                        <label>
                            <span>Publishable Key</span>
                            <input
                                v-model="clerkStore.clerkKey"
                                type="text"
                                placeholder="pk_test_..."
                                class="clerk-key-input"
                                :disabled="hasSavedClerkKey || isClerkKeyReadOnly"
                            />
                        </label>
                        <button 
                            v-if="!hasSavedClerkKey && !isClerkKeyReadOnly" 
                            @click="saveClerkKey" 
                            class="save-button"
                        >
                            Save and reload
                        </button>
                        <button 
                            v-else-if="hasSavedClerkKey && !isClerkKeyReadOnly" 
                            @click="clearClerkKey" 
                            class="save-button"
                        >
                            Clear and reload
                        </button>
                    </div>
                </div>
            </div>
        </aside>

        <div class="test-container">
            <aside 
                class="endpoints-sidebar" 
                :class="{ collapsed: sidebarCollapsed, resizing: isResizingEndpoints }"
                :style="{ width: sidebarCollapsed ? '60px' : `${endpointsSidebarWidth}px` }"
            >
                <div class="sidebar-header">
                    <h2>Endpoints</h2>
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
                                    <div class="endpoint-meta">
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
                </div>
            </aside>

            <div 
                v-if="!sidebarCollapsed"
                class="resize-handle resize-handle-endpoints"
                @mousedown="startResizeEndpoints"
                :class="{ resizing: isResizingEndpoints }"
            ></div>

            <div v-if="selectedEndpoint" class="endpoint-content">
                <main class="endpoint-tester">
                    <div class="endpoint-header">
                        <div class="endpoint-title">
                            <span class="method-badge large"
                                :style="{ backgroundColor: getMethodColor(selectedMethod || '') }">
                                {{ selectedMethod }}
                            </span>
                            <span class="endpoint-path">{{ selectedPath }}</span>
                            <Lock v-if="endpointRequiresSecurity(selectedEndpoint)" 
                                :size="18" 
                                class="security-indicator-large"
                                title="Requires authentication" />
                        </div>
                        <div v-if="selectedEndpoint.summary || selectedEndpoint.description" class="endpoint-info">
                            <p v-if="selectedEndpoint.summary" class="endpoint-summary-text">
                                {{ selectedEndpoint.summary }}
                            </p>
                            <p v-if="selectedEndpoint.description" class="endpoint-description">
                                {{ selectedEndpoint.description }}
                            </p>
                        </div>
                    </div>

                    <!-- Security Schemes Section -->
                    <div v-if="displayedSecuritySchemes.length > 0" class="security-schemes-wrapper">
                        <h4 class="security-schemes-title">Security Schemes</h4>
                        <div class="security-schemes-section">
                            <div 
                                v-for="scheme in displayedSecuritySchemes" 
                                :key="scheme.name" 
                                class="security-scheme-card"
                                :class="{ selected: selectedAuthScheme === scheme.name }"
                                @click="selectSecurityScheme(scheme.name)"
                            >
                                <Lock :size="12" class="security-card-icon" />
                                <span class="scheme-name">{{ scheme.name === CLERK_BEARER_SCHEME ? 'Clerk Bearer' : scheme.name }}</span>
                            </div>
                        </div>
                    </div>

                <div class="request-section">
                    <h3>Request</h3>

                    <!-- Path Parameters -->
                    <div v-if="pathParameters.length > 0" class="params-section">
                        <h4>Path Parameters</h4>
                        <dl class="params-list">
                            <div v-for="param in pathParameters" :key="param.name" class="param-item">
                                <dt>
                                    <span class="param-name">{{ param.name }}</span>
                                    <span v-if="param.required" class="required">*</span>
                                    <span v-if="param.description" class="param-desc"> - {{ param.description }}</span>
                                </dt>
                                <dd>
                                    <input v-model="requestParams[param.name]" type="text"
                                        :placeholder="param.schema && 'default' in param.schema ? String(param.schema.default) : ''" />
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <!-- Query Parameters -->
                    <div v-if="queryParameters.length > 0" class="params-section">
                        <h4>Query Parameters</h4>
                        <dl class="params-list">
                            <div v-for="param in queryParameters" :key="param.name" class="param-item">
                                <dt>
                                    <span class="param-name">{{ param.name }}</span>
                                    <span v-if="param.required" class="required">*</span>
                                    <span v-if="param.description" class="param-desc"> - {{ param.description }}</span>
                                </dt>
                                <dd>
                                    <input v-model="requestParams[param.name]" type="text"
                                        :placeholder="param.schema && 'default' in param.schema ? String(param.schema.default) : ''" />
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <!-- Request Body -->
                    <div v-if="selectedEndpoint.requestBody" class="body-section">
                        <h4>Request Body</h4>
                        <div class="json-editor-wrapper">
                            <JsonEditorVue v-model:text="requestBodyJson"
                            mode="text"
                            :mainMenuBar="false"
                                    :navigationBar="false"
                                    :statusBar="false"
                                    :darkTheme="true"
                             
                             />
                        </div>
                    </div>

                    <button @click="sendRequest" class="send-button" :disabled="sendingRequest">
                        <Rocket :size="16" class="send-button-icon" />
                        <span>{{ sendingRequest ? 'Sending...' : 'Send Request' }}</span>
                    </button>
                </div>

                <!-- Request History -->
                <div class="response-section">
                    <div class="section-header">
                        <h3>Request History</h3>
                        <button v-if="filteredRequestHistory.length > 0" @click="clearCurrentEndpointHistory" class="clear-history-btn">
                            Clear History
                        </button>
                    </div>
                    <div v-if="!selectedPath || !selectedMethod" class="no-response">
                        Select an endpoint to view request history.
                    </div>
                    <div v-else-if="filteredRequestHistory.length === 0" class="no-response">
                        No requests sent yet. Click "Send Request" to test the endpoint.
                    </div>
                    <div v-else class="request-history-list">
                        <div v-for="item in filteredRequestHistory" :key="item.id" class="history-item">
                            <div class="history-item-header">
                                <div class="history-item-title">
                                    <span class="method-badge small" :style="{ backgroundColor: getMethodColor(item.method) }">
                                        {{ item.method }}
                                    </span>
                                    <span class="history-url">{{ item.url }}</span>
                                </div>
                                <div class="history-meta-group">
                                    <span v-if="item.authScheme" class="history-auth-scheme">
                                        <Lock :size="12" />
                                        {{ item.authScheme === CLERK_BEARER_SCHEME ? 'Clerk Bearer' : item.authScheme }}
                                    </span>
                                    <span v-else class="history-auth-scheme">
                                        <Unlock :size="12" />
                                        Anonymous
                                    </span>
                                    <span class="history-timestamp">
                                        {{ new Date(item.timestamp).toLocaleTimeString() }}
                                    </span>
                                    <div v-if="item.status" class="history-status">
                                        <span class="status-code" :class="{
                                            success: item.status >= 200 && item.status < 300,
                                            error: item.status >= 400,
                                            redirect: item.status >= 300 && item.status < 400
                                        }">
                                            {{ item.status }} {{ item.statusText }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="history-curl-section">
                                <div class="curl-header" @click="expandedCurlSections.has(item.id) ? expandedCurlSections.delete(item.id) : expandedCurlSections.add(item.id)">
                                    <div class="curl-header-left">
                                        <ChevronDown v-if="expandedCurlSections.has(item.id)" :size="16" class="curl-toggle-icon" />
                                        <ChevronRight v-else :size="16" class="curl-toggle-icon" />
                                        <h5>cURL Command</h5>
                                    </div>
                                    <button @click.stop="copyCurlToClipboard(item)" class="copy-curl-btn" title="Copy cURL command">
                                        <Copy :size="16" />
                                        <span>Copy</span>
                                    </button>
                                </div>
                                <div v-if="expandedCurlSections.has(item.id)" class="curl-command">
                                    <pre>{{ formatAsCurl(item) }}</pre>
                                </div>
                            </div>

                            <div v-if="item.requestBody" class="history-request-body">
                                <h5>Request Body</h5>
                                <div class="json-editor-wrapper">
                                    <JsonEditorVue 
                                        :model-value="item.requestBody" 
                                        mode="text"
                                        :readOnly="true"
                                        :mainMenuBar="false"
                                        :navigationBar="false"
                                        :statusBar="false"
                                        :darkTheme="true"
                                    />
                                </div>
                            </div>

                            <div v-if="item.responseError" class="history-error">
                                <h5>Error</h5>
                                <div class="error-message">{{ item.responseError }}</div>
                            </div>

                            <div v-else-if="item.response" class="history-response">
                                <h5>Response</h5>
                                <div class="json-editor-wrapper">
                                    <JsonEditorVue 
                                        :model-value="(() => {
                                            if (typeof item.response.body === 'string') {
                                                try {
                                                    return JSON.parse(item.response.body);
                                                } catch {
                                                    return { text: item.response.body };
                                                }
                                            }
                                            return item.response.body || {};
                                        })()" 
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
                    </div>
                </div>
                <footer class="app-footer">
                    <p>&copy; {{ new Date().getFullYear() }} Gamja Labs</p>
                </footer>
                </main>

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
                                <div class="response-code-header" :class="{ success: responseExample.isSuccess, error: !responseExample.isSuccess }">
                                    <span class="response-code-number">{{ responseExample.code }}</span>
                                    <span class="response-code-description">{{ responseExample.description }}</span>
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
                        <p class="welcome-description">
                            Select an endpoint from the sidebar to start testing your API endpoints.
                        </p>
                        <div class="welcome-tips">
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
// Card styles
.card {
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--card));
    color: hsl(var(--card-foreground));
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3);
}

.card-header {
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    border-bottom: 1px solid hsl(var(--border));
}

.card-title {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.2;
}

.card-description {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-top: 0.5rem;
}

.card-content {
    padding: 1.5rem;
}

// Button styles
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
    border: none;
    padding: 0.5rem 1rem;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &.btn-primary {
        background-color: hsl(var(--primary));
        color: hsl(var(--primary-foreground));

        &:hover:not(:disabled) {
            opacity: 0.9;
        }
    }

    &.btn-destructive {
        background-color: hsl(var(--destructive));
        color: hsl(var(--destructive-foreground));

        &:hover:not(:disabled) {
            opacity: 0.9;
        }
    }

    &.btn-outline {
        border: 1px solid hsl(var(--border));
        background-color: transparent;
        color: hsl(var(--foreground));

        &:hover:not(:disabled) {
            background-color: hsl(var(--accent));
            color: hsl(var(--accent-foreground));
        }
    }

    &.btn-ghost {
        background-color: transparent;
        color: hsl(var(--foreground));

        &:hover:not(:disabled) {
            background-color: hsl(var(--accent));
            color: hsl(var(--accent-foreground));
        }
    }

    &.btn-sm {
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
    }
}

// Text utilities
.text-muted {
    color: hsl(var(--muted-foreground));
}

// Dialog/Modal styles
.dialog-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
}

.dialog-content {
    background-color: hsl(var(--card));
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    max-width: 32rem;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 51;
    margin: 1rem;
}

.dialog-header {
    padding: 1.5rem;
    border-bottom: 1px solid hsl(var(--border));
}

.dialog-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
}

.dialog-body {
    padding: 1.5rem;
}

.dialog-footer {
    padding: 1.5rem;
    border-top: 1px solid hsl(var(--border));
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}

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
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
}

.title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
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

.header-actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
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

.api-key-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.api-key-input {
    padding: 0.5rem 0.75rem;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.875rem;
    width: 200px;
    transition: border-color 0.2s;

    &:focus {
        outline: none;
        border-color: hsl(var(--ring));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
}

.clear-api-key-btn {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    &:hover {
        background: hsl(var(--accent));
        opacity: 0.9;
    }
}

.auth-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;

    input[type="checkbox"] {
        cursor: pointer;
        width: 1.25rem;
        height: 1.25rem;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
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

.auth-side-menu {
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: hsl(var(--card));
    border-left: 1px solid hsl(var(--border));
    z-index: 1000;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
}

.auth-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid hsl(var(--border));

    h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: hsl(var(--foreground));
    }
}

.close-auth-menu {
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
}

.close-auth-menu:hover {
    color: hsl(var(--foreground));
}

.auth-menu-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.auth-scheme {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 1.25rem;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    position: relative;

    &:hover {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        border-color: hsl(var(--ring));
    }

    &.selected {
        border-color: hsl(var(--primary));
        background: hsla(var(--primary) / 0.1);
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);

        .auth-scheme-header {
            border-bottom-color: hsla(var(--primary) / 0.3);
            
            h3 {
                color: hsl(var(--primary));
            }
        }

        .auth-scheme-type {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            box-shadow: 0 0 0 1px hsla(var(--primary-foreground) / 0.2);
        }
        
        .auth-scheme-description {
            color: hsl(var(--muted-foreground));
        }

        &::before {
            content: '';
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            width: 8px;
            height: 8px;
            background: hsl(var(--primary));
            border-radius: 50%;
        }
    }
}

.auth-scheme-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid hsl(var(--border));

    h3 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: hsl(var(--foreground));
    }
}

.auth-scheme-type {
    font-size: 0.75rem;
    padding: 0.375rem 0.625rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-radius: calc(var(--radius) - 4px);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.025em;
}

.auth-scheme-description {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1rem;
    margin-top: 0.5rem;
    line-height: 1.5;
}

.auth-scheme-fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.5rem;

    label {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        span {
            font-size: 0.875rem;
            font-weight: 500;
            color: hsl(var(--foreground));
        }

        .field-location {
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
            font-weight: normal;
        }
    }
}

.clerk-toggle-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
    padding: 0.5rem 0;
    user-select: none;

    input[type="checkbox"] {
        cursor: pointer;
        width: 1rem;
        height: 1rem;
        appearance: none;
        background-color: hsl(var(--background));
        border: 1px solid hsl(var(--border));
        border-radius: calc(var(--radius) - 2px);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s;
        position: relative;

        &:hover:not(:disabled) {
            border-color: hsl(var(--ring));
        }

        &:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));
        }

        &:checked {
            background-color: hsl(var(--primary));
            border-color: hsl(var(--primary));
            
            &::after {
                content: '';
                position: absolute;
                width: 0.25rem;
                height: 0.5rem;
                border: solid hsl(var(--primary-foreground));
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
                top: 0.125rem;
            }
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background-color: hsl(var(--muted));
        }
    }

    span:not(.sign-in-hint) {
        color: hsl(var(--foreground));
        font-weight: 500;
        line-height: 1.5;
    }

    .sign-in-hint {
        font-size: 0.75rem;
        color: hsl(var(--muted-foreground));
        font-style: italic;
    }
}

.auth-input {
    padding: 0.5rem 0.75rem;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.875rem;
    transition: border-color 0.2s;

    &:focus {
        outline: none;
        border-color: hsl(var(--ring));
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
}

.clear-credential-btn {
    padding: 0.5rem 1rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
    align-self: flex-start;
    margin-top: 0.25rem;

    &:hover {
        background: hsl(var(--accent));
        opacity: 0.9;
    }
}

.save-button {
    padding: 0.75rem 1.5rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: calc(var(--radius) - 2px);
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    align-self: flex-start;
    margin-top: 0.25rem;
}

.save-button:hover {
    opacity: 0.9;
}

.clerk-key-card {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 1.25rem;
    margin-top: auto;
    border-top: 2px solid hsl(var(--border));
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    box-shadow: none;

    &:hover {
        box-shadow: none;
        border-color: hsl(var(--border));
    }
}

.clerk-key-header {
    margin-bottom: 0.5rem;
    
    h3 {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0;
        color: hsl(var(--muted-foreground));
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
}

.clerk-key-description {
    font-size: 0.8125rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1rem;
    line-height: 1.4;
}

.clerk-key-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    
    label {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        
        span {
            font-size: 0.8125rem;
            color: hsl(var(--muted-foreground));
            font-weight: 500;
        }
    }
}

.clerk-key-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    color: hsl(var(--foreground));
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.8125rem;
    transition: all 0.2s;

    &:focus:not(:disabled) {
        outline: none;
        border-color: hsl(var(--ring));
        box-shadow: 0 0 0 2px hsla(var(--ring) / 0.2);
    }

    &:disabled {
        background: hsl(var(--muted));
        color: hsl(var(--muted-foreground));
        cursor: not-allowed;
        opacity: 0.7;
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
}

.anonymous-option {
    .auth-scheme-header {
        h3 {
            display: flex;
            align-items: center;
            gap: 0.5rem;
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
    flex-wrap: wrap;

    &:hover {
        background: hsl(var(--accent));
    }

    &.active {
        background: hsl(var(--accent));
    }
}

.security-indicator {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0.7;
}

.security-indicator-large {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0.8;
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

    &.large {
        font-size: 0.875rem;
        padding: 0.375rem 0.75rem;
        width: auto;
        min-width: auto;
        max-width: none;
    }
}

.endpoint-path {
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.75rem;
    color: hsl(var(--foreground));
    font-weight: 500;
    flex: 1 1 auto;
    min-width: 0;
    line-height: 1.3;
    word-break: break-all;
    overflow-wrap: break-word;
}

.endpoint-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-left: auto;
    justify-content: flex-end;
    min-width: fit-content;
}

.endpoint-summary {
    font-size: 0.6875rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.3;
    flex-shrink: 0;
    text-align: right;
}


.endpoint-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.endpoint-tester {
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

    &.empty {
        align-items: center;
        justify-content: center;
    }
}

.examples-sidebar {
    border-right: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    padding: 1.5rem;
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
    margin-bottom: 1rem;
    flex-shrink: 0;

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
}

.view-toggle {
    display: flex;
    gap: 0.25rem;
    background: hsl(var(--muted));
    border-radius: calc(var(--radius) - 2px);
    padding: 0.125rem;
}

.toggle-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    transition: all 0.2s;
    white-space: nowrap;

    &:hover {
        color: hsl(var(--foreground));
    }

    &.active {
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    }

    &.small {
        padding: 0.25rem 0.5rem;
        font-size: 0.6875rem;
    }
}

.example-section {
    margin-bottom: 1.5rem;
    flex-shrink: 0;

    &:last-child {
        margin-bottom: 0;
    }

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
    gap: 1rem;
}

.response-code-item {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--card));

    .example-content {
        border: none;
        border-radius: 0;
        box-shadow: none;
        margin-top: 0;

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

.response-code-header {
    padding: 0.75rem 1rem;
    background: hsl(var(--muted));
    border-bottom: none;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;

    &.success {
        background: rgba(73, 204, 144, 0.1);
    }

    &.error {
        background: rgba(249, 62, 62, 0.1);
    }
}

.response-code-number {
    font-weight: 700;
    font-size: 0.875rem;
    font-family: 'Chivo Mono Variable', monospace;
    min-width: 3rem;
    text-align: center;
    padding: 0.25rem 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    background: hsl(var(--background));
    color: hsl(var(--foreground));

    .response-code-header.success & {
        background: rgba(73, 204, 144, 0.2);
        color: #49cc90;
    }

    .response-code-header.error & {
        background: rgba(249, 62, 62, 0.2);
        color: #f93e3e;
    }
}

.response-code-description {
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    flex: 1;
    min-width: 0;
}

.response-code-header .view-toggle {
    margin-left: auto;
    flex-shrink: 0;
}

.no-example {
    padding: 1rem;
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

.endpoint-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid hsl(var(--border));
}

.endpoint-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
}

.security-schemes-wrapper {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid hsl(var(--border));
}

.security-schemes-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.security-schemes-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.security-scheme-card {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background-color: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--muted-foreground) / 0.2);
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.6875rem;
    transition: all 0.2s ease;
    cursor: pointer;
}

.security-scheme-card:hover {
    background-color: hsl(var(--muted) / 0.7);
    border-color: hsl(var(--muted-foreground) / 0.3);
}

.security-scheme-card.selected {
    border-color: hsl(var(--primary));
    background-color: hsla(var(--primary) / 0.1);
    box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
}

.security-scheme-card.selected .security-card-icon {
    color: hsl(var(--primary));
    opacity: 1;
}

.security-scheme-card.selected .scheme-name {
    color: hsl(var(--primary));
}

.security-card-icon {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0.8;
    transition: all 0.2s ease;
}

.scheme-name {
    font-weight: 500;
    color: hsl(var(--foreground));
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.6875rem;
    transition: color 0.2s ease;
}

.endpoint-info {
    margin-top: 0.75rem;
}

.endpoint-summary-text {
    color: hsl(var(--foreground));
    margin-top: 0;
    margin-bottom: 0.5rem;
    line-height: 1.5;
    font-size: 1rem;
    font-weight: 500;
}

.endpoint-description {
    color: hsl(var(--muted-foreground));
    margin-top: 0;
    margin-bottom: 0;
    line-height: 1.6;
    font-size: 0.9375rem;
}

.auth-selection-section {
    margin-bottom: 1.25rem;
}

.auth-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));

    span {
        min-width: fit-content;
    }
}

.auth-select {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='hsl(0%2C 0%25%2C 98%25)' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    padding-right: 2rem;

    &:focus {
        outline: none;
        border-color: hsl(var(--ring));
        box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
    }

    &:hover {
        border-color: hsl(var(--ring));
    }

    option {
        background: hsl(var(--input));
        color: hsl(var(--foreground));
    }
}

.request-section {
    margin-bottom: 1.5rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    padding: 1.25rem;
    background: hsl(var(--card));
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

    h3 {
        font-size: 1.125rem;
        margin-bottom: 1.25rem;
        margin-top: 0;
        font-weight: 600;
        color: hsl(var(--foreground));
    }

    &:last-child {
        margin-bottom: 0;
    }
}

.response-section {
    margin-bottom: 1.5rem;

    h3 {
        font-size: 1.125rem;
        margin-bottom: 1.25rem;
        margin-top: 0;
        font-weight: 600;
        color: hsl(var(--foreground));
    }

    &:last-child {
        margin-bottom: 0;
    }
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;

    h3 {
        margin-bottom: 0;
    }
}

.clear-history-btn {
    padding: 0.375rem 0.75rem;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all 0.2s;

    &:hover {
        background: hsl(var(--accent));
        border-color: hsl(var(--accent));
    }
}

.request-history-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.history-item {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--card));
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

    &:last-child {
        margin-bottom: 0;
    }
}

.history-item-header {
    padding: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: 0.75rem;
    flex-wrap: wrap;
}

.history-item-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1 1 0;
    min-width: 200px;
    flex-wrap: nowrap;
}

.method-badge.small {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    width: auto;
    min-width: 3rem;
    max-width: 3rem;
    flex-shrink: 0;
}

.history-url {
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.8125rem;
    color: hsl(var(--foreground));
    flex: 1 1 auto;
    min-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.history-meta-group {
    display: flex;
    align-items: center;
    gap: 0;
    flex: 0 0 auto;
    flex-wrap: wrap;
    min-width: fit-content;

    @media (max-width: 640px) {
        width: 100%;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }
}

.history-auth-scheme {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
    padding-right: 0.75rem;

    @media (max-width: 640px) {
        padding-right: 0;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid hsl(var(--border));
        width: 100%;
    }
}

.history-timestamp {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
    padding: 0 0.75rem;
    border-left: 1px solid hsl(var(--border));

    @media (max-width: 640px) {
        padding: 0;
        padding-bottom: 0.5rem;
        border-left: none;
        border-bottom: 1px solid hsl(var(--border));
        width: 100%;
    }
}

.history-status {
    flex-shrink: 0;
    padding-left: 0.75rem;
    border-left: 1px solid hsl(var(--border));

    @media (max-width: 640px) {
        padding-left: 0;
        border-left: none;
        width: 100%;
    }
}

.history-curl-section {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: hsl(var(--input));
    border-radius: calc(var(--radius) - 2px);

    .curl-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        // margin-bottom: 0.75rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: calc(var(--radius) - 2px);
        transition: background-color 0.2s;

        &:hover {
            background: hsl(var(--muted));
        }

        .curl-header-left {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .curl-toggle-icon {
            color: hsl(var(--muted-foreground));
            flex-shrink: 0;
        }

        h5 {
            font-size: 0.875rem;
            font-weight: 600;
            margin: 0;
        }
    }

    .copy-curl-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: hsl(var(--muted));
        color: hsl(var(--foreground));
        border: 1px solid hsl(var(--border));
        border-radius: calc(var(--radius) - 2px);
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;

        &:hover {
            background: hsl(var(--accent));
            opacity: 0.9;
        }
    }

    .curl-command {
        padding: 0.75rem 0;
        overflow-x: auto;

        pre {
            margin: 0;
            font-family: 'Chivo Mono Variable', monospace;
            font-size: 0.8125rem;
            line-height: 1.6;
            color: hsl(var(--foreground));
            white-space: pre-wrap;
            word-break: break-all;
        }
    }
}

.history-request-body,
.history-response,
.history-error {
    padding: 0.75rem 0;
    margin-bottom: 1rem;

    &:last-child {
        margin-bottom: 0;
    }

    h5 {
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 0.625rem;
        margin-top: 0;
        color: hsl(var(--muted-foreground));
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .json-editor-wrapper {
        border: 1px solid hsl(var(--border));
        max-height: 60vh;
        background: hsl(var(--input));
        overflow: auto;
    }
}

.history-error {
    .error-message {
        color: hsl(var(--destructive));
        font-size: 0.875rem;
        padding: 0.5rem 0;
        margin: 0;
    }
}

.params-section {
    margin-bottom: 1.25rem;

    &:last-child {
        margin-bottom: 0;
    }

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

.params-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.param-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;

    dt {
        font-size: 0.875rem;
        color: hsl(var(--foreground));
        margin: 0;
        flex: 1;
    }

    dd {
        margin: 0;
        flex: 1;
    }

    .param-name {
        font-weight: 500;
        font-family: 'Chivo Mono Variable', monospace;
    }

    .required {
        color: hsl(var(--destructive));
        margin-left: 0.25rem;
    }

    .param-desc {
        color: hsl(var(--muted-foreground));
        font-weight: normal;
    }

    input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid hsl(var(--border));
        border-radius: calc(var(--radius) - 2px);
        background: hsl(var(--input));
        color: hsl(var(--foreground));
        font-family: 'Chivo Mono Variable', monospace;
        font-size: 0.875rem;

        &:focus {
            outline: none;
            border-color: hsl(var(--ring));
        }
    }
}

.body-section {
    margin-bottom: 1.25rem;

    &:last-child {
        margin-bottom: 0;
    }

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

.request-body {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) - 2px);
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    font-family: 'Chivo Mono Variable', monospace;
    font-size: 0.875rem;
    resize: vertical;

    &:focus {
        outline: none;
        border-color: hsl(var(--ring));
    }
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

.send-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: hsl(var(--primary) / 0.9);
    color: hsl(var(--primary-foreground));
    border: 1px solid hsl(var(--primary) / 0.3);
    border-radius: var(--radius);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8125rem;
    letter-spacing: 0.025em;
    margin: 1.5rem auto 0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);

    &:hover:not(:disabled) {
        background: hsl(var(--primary) / 1);
        border-color: hsl(var(--primary) / 0.5);
        box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }

    &:active:not(:disabled) {
        box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2);
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
}

.send-button-icon {
    flex-shrink: 0;
}

.response-content {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--input));
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
}

.response-status {
    padding: 0.75rem 1rem;
    background: hsl(var(--muted));
    border-bottom: 1px solid hsl(var(--border));
}

.status-code {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.5rem;
    border-radius: calc(var(--radius) - 2px);
    font-weight: 600;
    font-size: 0.75rem;
    white-space: nowrap;
    flex-shrink: 0;

    &.success {
        background-color: rgba(73, 204, 144, 0.1);
        color: #49cc90;
        border: 1px solid rgba(73, 204, 144, 0.2);
    }

    &.error {
        background-color: rgba(249, 62, 62, 0.1);
        color: #f93e3e;
        border: 1px solid rgba(249, 62, 62, 0.2);
    }

    &.redirect {
        background-color: rgba(255, 193, 7, 0.1);
        color: #ffc107;
        border: 1px solid rgba(255, 193, 7, 0.2);
    }

    &:not(.success):not(.error):not(.redirect) {
        background-color: hsl(var(--muted));
        color: hsl(var(--muted-foreground));
        border: 1px solid hsl(var(--border));
    }
}

.response-body {
    padding: 1rem;
    background: hsl(var(--input));
    overflow-x: auto;

    pre {
        margin: 0;
        font-family: 'Chivo Mono Variable', monospace;
        font-size: 0.875rem;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
}

.example-response {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--input));
    border-color: hsl(var(--accent));
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
}

.example-header {
    padding: 0.75rem 1rem;
    background: hsl(var(--muted));
    border-bottom: 1px solid hsl(var(--border));
}

.example-label {
    font-weight: 600;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.no-response {
    padding: 1.5rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    border: 1px dashed hsl(var(--border));
    border-radius: var(--radius);
}
</style>
