<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import type { OpenAPIV3 } from 'openapi-types';
import JsonEditorVue from 'vue3-ts-jsoneditor';
import { Lock, Unlock, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next';
import { useOpenApiStore } from '@/stores/openapi';
import { useEndpointStore, type RequestHistoryItem } from '@/stores/endpoint';
import { useConfigStore } from '@/stores/config';
import { useTheme } from '@/composables/useTheme';
import { useAuth } from '@clerk/vue';

const CLERK_BEARER_SCHEME = '__clerk_bearer__';

const openApiStore = useOpenApiStore();
const endpointStore = useEndpointStore();
const { theme } = useTheme();

const path = computed(() => endpointStore.selectedPath);
const method = computed(() => endpointStore.selectedMethod);
const config = useConfigStore();
const clerkAvailable = !!(config.clerkPublishableKey && config.clerkPublishableKey.trim());
let authState: ReturnType<typeof useAuth> | null = null;

if (clerkAvailable) {
    try {
        authState = useAuth();
    } catch (error) {
        console.warn('Failed to initialize Clerk auth:', error);
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

const getToken = authState?.getToken?.value ?? (() => Promise.resolve(null));

const isLoaded = computed(() => {
    if (!authState) return false;
    try {
        return authState.isLoaded.value ?? false;
    } catch {
        return false;
    }
});

const requestQuery = ref<Record<string, any>>({});
const requestUrlParams = ref<Record<string, any>>({});
const requestBody = ref<string>('');
const response = ref<any>(null);
const responseError = ref<string | null>(null);
const sendingRequest = ref(false);
const authCredentials = ref<Record<string, any>>({});
const expandedCurlSections = ref<Set<string>>(new Set());
const requestBodyViewMode = ref(false);

type BottomTab = 'response' | 'history' | 'curl';
const bottomTab = ref<BottomTab>('response');
const BOTTOM_PANE_KEY = 'o-s-bottom-pane-height';
const readPaneHeight = (): number => {
    if (typeof window === 'undefined') return 380;
    try {
        const stored = localStorage.getItem(BOTTOM_PANE_KEY);
        if (stored) return Math.max(180, Math.min(900, parseInt(stored, 10) || 380));
    } catch { /* ignore */ }
    return 380;
};
const bottomPaneHeight = ref(readPaneHeight());
const isPaneResizing = ref(false);

watch(bottomPaneHeight, (h) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(BOTTOM_PANE_KEY, String(Math.round(h))); } catch { /* ignore */ }
});

const startPaneResize = (e: MouseEvent) => {
    isPaneResizing.value = true;
    const startY = e.clientY;
    const startHeight = bottomPaneHeight.value;

    const onMove = (ev: MouseEvent) => {
        const diff = startY - ev.clientY;
        bottomPaneHeight.value = Math.max(180, Math.min(900, startHeight + diff));
    };
    const onUp = () => {
        isPaneResizing.value = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

onBeforeUnmount(() => {
    isPaneResizing.value = false;
});

const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);
const filteredRequestHistory = computed(() => endpointStore.filteredRequestHistory);

const endpoint = computed(() => {
    if (!path.value || !method.value) return null;
    return openApiStore.getSelectedEndpoint(path.value, method.value);
});

const pathParameters = computed(() => {
    if (!endpoint.value || !endpoint.value.parameters) return [];
    return endpoint.value.parameters
        .map(openApiStore.resolveParameter)
        .filter((p): p is OpenAPIV3.ParameterObject => p !== null && p.in === 'path');
});

const queryParameters = computed(() => {
    if (!endpoint.value || !endpoint.value.parameters) return [];
    return endpoint.value.parameters
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

const requestBodySchema = computed(() => {
    if (!endpoint.value) return null;
    return openApiStore.getRequestBodySchema(endpoint.value);
});

const requestBodySchemaDisplay = computed(() => {
    if (!requestBodySchema.value || !openApiStore.openApiSpec) return null;
    return openApiStore.formatSchemaForDisplay(requestBodySchema.value, openApiStore.openApiSpec);
});

const toggleRequestBodyViewMode = () => {
    requestBodyViewMode.value = !requestBodyViewMode.value;
};

const securitySchemes = computed(() => openApiStore.securitySchemes);

const availableSecuritySchemes = computed(() => {
    if (!endpoint.value) return [];
    return openApiStore.getAvailableSecuritySchemes(endpoint.value);
});

const hasBearerScheme = computed(() => {
    const schemesToCheck = endpoint.value ? availableSecuritySchemes.value : securitySchemes.value;
    return schemesToCheck.some(item =>
        item.scheme.type === 'http' &&
        (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'bearer'
    );
});

const displayedSecuritySchemes = computed(() => {
    const schemes = endpoint.value
        ? [...availableSecuritySchemes.value]
        : [...securitySchemes.value];

    if (hasBearerScheme.value && clerkAvailable) {
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

const endpointRequiresSecurity = (operation: OpenAPIV3.OperationObject): boolean => {
    return openApiStore.endpointRequiresSecurity(operation);
};

const selectSecurityScheme = (schemeName: string | null) => {
    endpointStore.toggleSelectedAuthScheme(schemeName);
};

const buildCurrentRequestItem = (): RequestHistoryItem => {
    const SERVICE_HOST = config.serviceHost || '';
    let url = `${SERVICE_HOST}${path.value || ''}`;
    for (const [key, value] of Object.entries(requestUrlParams.value)) {
        if (value !== '' && value != null) {
            url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
        }
    }
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(requestQuery.value)) {
        if (value !== '' && value != null) {
            queryParams.append(key, String(value));
        }
    }
    if (queryParams.toString()) url += `?${queryParams.toString()}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) {
        headers['Authorization'] = 'Bearer <CLERK_TOKEN>';
    } else if (selectedAuthScheme.value) {
        headers['Authorization'] = `<${selectedAuthScheme.value}>`;
    }

    let body: any = null;
    if (method.value && ['POST', 'PUT', 'PATCH'].includes(method.value) && requestBody.value.trim()) {
        try { body = JSON.parse(requestBody.value); }
        catch { body = requestBody.value; }
    }

    return {
        id: 'current',
        timestamp: new Date(),
        method: method.value || 'GET',
        path: path.value || '',
        url,
        requestBody: body,
        requestQuery: { ...requestQuery.value },
        requestUrlParams: { ...requestUrlParams.value },
        headers,
        response: null,
        responseError: null,
        authScheme: selectedAuthScheme.value || null,
    };
};

const liveCurl = computed(() => formatAsCurl(buildCurrentRequestItem()));

const copyLiveCurl = async () => {
    try {
        await navigator.clipboard.writeText(liveCurl.value);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
};

const currentResponseAsJson = computed(() => {
    if (!response.value) return null;
    if (typeof response.value.body === 'string') {
        try { return JSON.parse(response.value.body); }
        catch { return { text: response.value.body }; }
    }
    return response.value.body || {};
});

const currentResponseStatus = computed(() => response.value?.status as number | undefined);

const isStatusSuccess = (status: number | undefined) => status !== undefined && status >= 200 && status < 300;
const isStatusError = (status: number | undefined) => status !== undefined && status >= 400;
const isStatusRedirect = (status: number | undefined) => status !== undefined && status >= 300 && status < 400;

const sendRequest = async () => {
    if (!path.value || !method.value) return;

    sendingRequest.value = true;
    response.value = null;
    responseError.value = null;

    const historyItem: RequestHistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        method: method.value,
        path: path.value || '',
        url: '',
        requestBody: requestBody.value.trim() ? (() => {
            try {
                return JSON.parse(requestBody.value);
            } catch {
                return requestBody.value;
            }
        })() : null,
        requestQuery: { ...requestQuery.value },
        requestUrlParams: { ...requestUrlParams.value },
        headers: {},
        response: null,
        responseError: null,
        authScheme: selectedAuthScheme.value || null,
    };

    try {
        const SERVICE_HOST = config.serviceHost || '';
        let url = `${SERVICE_HOST}${path.value}`;

        for (const [key, value] of Object.entries(requestUrlParams.value)) {
            if (value !== '' && value != null) {
                url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
            }
        }

        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(requestQuery.value)) {
            if (value !== '' && value != null) {
                queryParams.append(key, String(value));
            }
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

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
        } else if (selectedAuthScheme.value && openApiStore.openApiSpec?.components?.securitySchemes) {
            const scheme = openApiStore.openApiSpec.components.securitySchemes[selectedAuthScheme.value];
            if (scheme && typeof scheme === 'object' && !('$ref' in scheme)) {
                const credentials = authCredentials.value[selectedAuthScheme.value];

                if (scheme.type === 'apiKey') {
                    const apiKeyScheme = scheme as OpenAPIV3.ApiKeySecurityScheme;
                    if (credentials?.value) {
                        if (apiKeyScheme.in === 'header') {
                            headers[apiKeyScheme.name] = credentials.value;
                        } else if (apiKeyScheme.in === 'query') {
                            queryParams.append(apiKeyScheme.name, credentials.value);
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
                        if (credentials?.token) {
                            headers['Authorization'] = `Bearer ${credentials.token}`;
                        }
                    }
                } else if (scheme.type === 'oauth2') {
                    if (credentials?.accessToken) {
                        headers['Authorization'] = `Bearer ${credentials.accessToken}`;
                    }
                } else if (scheme.type === 'openIdConnect') {
                    if (credentials?.idToken) {
                        headers['Authorization'] = `Bearer ${credentials.idToken}`;
                    }
                }
            }
        }

        if (queryParams.toString()) {
            url += `?${queryParams.toString()}`;
        }

        historyItem.url = url;
        historyItem.headers = { ...headers };

        const options: RequestInit = {
            method: method.value,
            headers,
        };

        if (['POST', 'PUT', 'PATCH'].includes(method.value) && requestBody.value.trim()) {
            try {
                options.body = JSON.stringify(JSON.parse(requestBody.value));
            } catch (e) {
                const error = 'Invalid JSON in request body';
                responseError.value = error;
                historyItem.responseError = error;
                endpointStore.addRequestHistory(historyItem);
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
        endpointStore.addRequestHistory(historyItem);
        bottomTab.value = 'response';
    }
};

const formatAsCurl = (item: RequestHistoryItem): string => {
    const parts: string[] = ['curl'];

    if (item.method !== 'GET') {
        parts.push(`-X ${item.method}`);
    }

    for (const [key, value] of Object.entries(item.headers || {})) {
        const escapedValue = value.replace(/"/g, '\\"');
        parts.push(`-H "${key}: ${escapedValue}"`);
    }

    if (['POST', 'PUT', 'PATCH'].includes(item.method) && item.requestBody) {
        const bodyStr = typeof item.requestBody === 'string'
            ? item.requestBody
            : JSON.stringify(item.requestBody, null, 2);
        const escapedBody = bodyStr
            .replace(/'/g, "'\\''")
            .replace(/\n/g, '\\n');
        parts.push(`-d '${escapedBody}'`);
    }

    parts.push(`"${item.url}"`);

    return parts.join(' \\\n  ');
};

const copyCurlToClipboard = async (item: RequestHistoryItem) => {
    const curlCommand = formatAsCurl(item);
    try {
        await navigator.clipboard.writeText(curlCommand);
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
    }
};

const clearCurrentEndpointHistory = () => {
    if (!path.value || !method.value) return;
    endpointStore.clearEndpointHistory(path.value, method.value);
};

const saveCurrentFormState = () => {
    if (!path.value || !method.value) return;
    endpointStore.saveEndpointFormState(path.value, method.value, {
        requestQuery: { ...requestQuery.value },
        requestUrlParams: { ...requestUrlParams.value },
        requestBody: requestBody.value,
        selectedAuthScheme: selectedAuthScheme.value,
    });
};

watch([path, method], ([newPath, newMethod], [oldPath, oldMethod]) => {
    if (newPath !== oldPath || newMethod !== oldMethod) {
        response.value = null;
        responseError.value = null;
        expandedCurlSections.value.clear();
        bottomTab.value = 'response';

        const savedState = endpointStore.getEndpointFormState(newPath || '', newMethod || '');
        const hasRestoredState = !!savedState;

        if (hasRestoredState && savedState) {
            requestQuery.value = { ...savedState.requestQuery };
            requestUrlParams.value = { ...savedState.requestUrlParams };
            requestBody.value = savedState.requestBody;
            endpointStore.setSelectedAuthScheme(savedState.selectedAuthScheme);
        } else {
            requestQuery.value = {};
            requestUrlParams.value = {};
            requestBody.value = '';
            endpointStore.setSelectedAuthScheme(null);
        }

        if (endpoint.value?.parameters) {
            for (const param of endpoint.value.parameters) {
                const resolved = openApiStore.resolveParameter(param);
                if (resolved && resolved.in === 'query') {
                    if (!hasRestoredState || !(resolved.name in requestQuery.value)) {
                        requestQuery.value[resolved.name] = '';
                    }
                } else if (resolved && resolved.in === 'path') {
                    if (!hasRestoredState || !(resolved.name in requestUrlParams.value)) {
                        requestUrlParams.value[resolved.name] = '';
                    }
                }
            }
        } else if (!hasRestoredState) {
            requestQuery.value = {};
            requestUrlParams.value = {};
        }

        if (!hasRestoredState && endpoint.value?.requestBody) {
            let requestBodyObj: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined = endpoint.value.requestBody;

            if (requestBodyObj && typeof requestBodyObj === 'object' && '$ref' in requestBodyObj && requestBodyObj.$ref && openApiStore.openApiSpec) {
                const refValue = openApiStore.resolveReference<OpenAPIV3.RequestBodyObject>(requestBodyObj.$ref, openApiStore.openApiSpec);
                if (refValue && typeof refValue === 'object') {
                    requestBodyObj = refValue;
                }
            }

            if (requestBodyObj && typeof requestBodyObj === 'object' && 'content' in requestBodyObj && requestBodyObj.content) {
                const jsonContent = requestBodyObj.content['application/json'];
                if (jsonContent?.schema && openApiStore.openApiSpec) {
                    const example = openApiStore.generateExampleFromSchema(jsonContent.schema, openApiStore.openApiSpec);
                    requestBody.value = JSON.stringify(example || {}, null, 2);
                } else {
                    requestBody.value = JSON.stringify({}, null, 2);
                }
            }
        } else if (!hasRestoredState) {
            requestBody.value = '';
        }
    }
}, { immediate: true });

watch([requestQuery, requestUrlParams, requestBody, selectedAuthScheme], () => {
    if (path.value && method.value) {
        saveCurrentFormState();
    }
}, { deep: true });
</script>

<template>
    <main class="endpoint-tester">
        <header class="endpoint-head">
            <div class="endpoint-line" :class="`method-${(method ?? '').toLowerCase()}`">
                <span class="endpoint-method">{{ method }}</span>
                <span class="endpoint-path">{{ path }}</span>
                <Lock v-if="endpoint && endpointRequiresSecurity(endpoint)"
                    :size="12"
                    :stroke-width="1.5"
                    class="endpoint-lock"
                    title="Requires authentication" />
                <span v-if="endpoint?.summary" class="endpoint-summary">{{ endpoint.summary }}</span>
                <div v-if="displayedSecuritySchemes.length > 0" class="endpoint-auth">
                    <span class="endpoint-auth-label">AUTH</span>
                    <button
                        v-for="scheme in displayedSecuritySchemes"
                        :key="scheme.name"
                        class="chip small"
                        :class="{ active: selectedAuthScheme === scheme.name }"
                        @click="selectSecurityScheme(scheme.name)"
                    >
                        <Lock :size="10" :stroke-width="1.5" />
                        <span>{{ scheme.name === CLERK_BEARER_SCHEME ? 'Clerk' : scheme.name }}</span>
                    </button>
                </div>
            </div>
            <p v-if="endpoint?.description" class="endpoint-description">
                {{ endpoint.description }}
            </p>
        </header>

        <div class="canvas">
            <section class="top-pane">
                <h2 class="section-title">Request</h2>

                <div v-if="pathParameters.length > 0" class="params-block">
                    <h3 class="block-label">Path Parameters</h3>
                    <div class="params-list">
                        <div v-for="param in pathParameters" :key="param.name" class="param-row">
                            <label class="param-label">
                                <span class="param-name">{{ param.name }}</span>
                                <span v-if="param.required" class="param-required">*</span>
                                <span v-if="param.description" class="param-desc"> — {{ param.description }}</span>
                            </label>
                            <input
                                v-model="requestUrlParams[param.name]"
                                type="text"
                                class="text-input"
                                :placeholder="param.schema && 'default' in param.schema ? String(param.schema.default) : ''"
                            />
                        </div>
                    </div>
                </div>

                <div v-if="queryParameters.length > 0" class="params-block">
                    <h3 class="block-label">Query Parameters</h3>
                    <div class="params-list">
                        <div v-for="param in queryParameters" :key="param.name" class="param-row">
                            <label class="param-label">
                                <span class="param-name">{{ param.name }}</span>
                                <span v-if="param.required" class="param-required">*</span>
                                <span v-if="param.description" class="param-desc"> — {{ param.description }}</span>
                            </label>
                            <input
                                v-model="requestQuery[param.name]"
                                type="text"
                                class="text-input"
                                :placeholder="param.schema && 'default' in param.schema ? String(param.schema.default) : ''"
                            />
                        </div>
                    </div>
                </div>

                <div v-if="endpoint && endpoint.requestBody" class="params-block">
                    <header class="block-head">
                        <h3 class="block-label">Request Body</h3>
                        <div class="segmented">
                            <button
                                @click="toggleRequestBodyViewMode"
                                :class="{ active: !requestBodyViewMode }"
                                class="segment"
                            >Edit</button>
                            <button
                                @click="toggleRequestBodyViewMode"
                                :class="{ active: requestBodyViewMode }"
                                class="segment"
                            >Schema</button>
                        </div>
                    </header>
                    <div v-if="requestBodyViewMode && requestBodySchemaDisplay" class="schema-display">
                        <pre class="schema-text">{{ requestBodySchemaDisplay }}</pre>
                    </div>
                    <div v-else-if="!requestBodyViewMode" class="json-editor-wrapper">
                        <JsonEditorVue
                            v-model:text="requestBodyJson"
                            mode="text"
                            :mainMenuBar="false"
                            :navigationBar="false"
                            :statusBar="false"
                            :darkTheme="theme === 'dark'"
                        />
                    </div>
                </div>

                <div class="send-row sticky-send">
                    <button @click="sendRequest" class="send-btn" :disabled="sendingRequest">
                        <span v-if="sendingRequest">[SENDING...]</span>
                        <span v-else>Send Request →</span>
                    </button>
                </div>
            </section>

            <div
                class="pane-divider"
                :class="{ resizing: isPaneResizing }"
                @mousedown="startPaneResize"
                title="Drag to resize"
            ><span class="pane-divider-grip"></span></div>

            <section
                class="bottom-pane"
                :class="{ resizing: isPaneResizing }"
                :style="{ height: bottomPaneHeight + 'px' }"
            >
                <nav class="bottom-tabs">
                    <button class="bottom-tab" :class="{ active: bottomTab === 'response' }" @click="bottomTab = 'response'">
                        <span>Response</span>
                        <span
                            v-if="currentResponseStatus !== undefined"
                            class="bottom-tab-status"
                            :class="{
                                success: isStatusSuccess(currentResponseStatus),
                                error: isStatusError(currentResponseStatus),
                                redirect: isStatusRedirect(currentResponseStatus)
                            }"
                        >{{ currentResponseStatus }}</span>
                        <span v-else-if="responseError" class="bottom-tab-status error">ERR</span>
                    </button>
                    <button class="bottom-tab" :class="{ active: bottomTab === 'history' }" @click="bottomTab = 'history'">
                        <span>History</span>
                        <span v-if="filteredRequestHistory.length" class="bottom-tab-count">{{ filteredRequestHistory.length }}</span>
                    </button>
                    <button class="bottom-tab" :class="{ active: bottomTab === 'curl' }" @click="bottomTab = 'curl'">
                        <span>cURL</span>
                    </button>
                    <div class="bottom-tabs-spacer"></div>
                    <button
                        v-if="bottomTab === 'history' && filteredRequestHistory.length > 0"
                        @click="clearCurrentEndpointHistory"
                        class="ghost-btn"
                    >Clear History</button>
                    <button
                        v-if="bottomTab === 'curl'"
                        @click="copyLiveCurl"
                        class="ghost-btn"
                        title="Copy cURL"
                    >
                        <Copy :size="12" :stroke-width="1.5" />
                        <span>Copy</span>
                    </button>
                </nav>

                <div class="bottom-content">
                    <div v-show="bottomTab === 'response'" class="tab-pane">
                        <p v-if="!response && !responseError && !sendingRequest" class="empty-state subtle">
                            [SEND A REQUEST TO SEE THE RESPONSE]
                        </p>
                        <p v-else-if="sendingRequest && !response && !responseError" class="empty-state subtle">
                            [WAITING...]
                        </p>
                        <div v-else-if="responseError" class="error-block">
                            <p class="error-message">[ERROR] {{ responseError }}</p>
                        </div>
                        <div v-else-if="response" class="response-view">
                            <header class="response-head">
                                <span
                                    class="response-status"
                                    :class="{
                                        success: isStatusSuccess(response.status),
                                        error: isStatusError(response.status),
                                        redirect: isStatusRedirect(response.status)
                                    }"
                                >{{ response.status }}</span>
                                <span class="response-status-text">{{ response.statusText }}</span>
                            </header>
                            <div class="json-editor-wrapper full">
                                <JsonEditorVue
                                    :model-value="currentResponseAsJson"
                                    mode="text"
                                    :readOnly="true"
                                    :mainMenuBar="false"
                                    :navigationBar="false"
                                    :statusBar="false"
                                    :darkTheme="theme === 'dark'"
                                />
                            </div>
                        </div>
                    </div>

                    <div v-show="bottomTab === 'history'" class="tab-pane">
                        <p v-if="!path || !method" class="empty-state subtle">
                            [SELECT AN ENDPOINT]
                        </p>
                        <p v-else-if="filteredRequestHistory.length === 0" class="empty-state subtle">
                            [NO REQUESTS YET — SEND ONE TO BEGIN]
                        </p>
                        <div v-else class="history-list">
                            <article v-for="item in filteredRequestHistory" :key="item.id" class="history-item">
                                <header class="history-head">
                                    <div class="history-status-row">
                                        <span
                                            class="history-status"
                                            :class="{
                                                success: item.status && item.status >= 200 && item.status < 300,
                                                error: item.status && item.status >= 400,
                                                redirect: item.status && item.status >= 300 && item.status < 400
                                            }"
                                        >{{ item.status || 'N/A' }}</span>
                                        <span class="history-url">{{ item.url }}</span>
                                    </div>
                                    <div class="history-meta">
                                        <span class="history-auth">
                                            <Lock v-if="item.authScheme" :size="11" :stroke-width="1.5" />
                                            <Unlock v-else :size="11" :stroke-width="1.5" />
                                            {{ item.authScheme === CLERK_BEARER_SCHEME ? 'Clerk' : (item.authScheme || 'Anonymous') }}
                                        </span>
                                        <span class="history-time">{{ new Date(item.timestamp).toLocaleTimeString() }}</span>
                                    </div>
                                </header>

                                <div class="curl-row">
                                    <button
                                        class="curl-toggle"
                                        @click="expandedCurlSections.has(item.id) ? expandedCurlSections.delete(item.id) : expandedCurlSections.add(item.id)"
                                    >
                                        <ChevronDown v-if="expandedCurlSections.has(item.id)" :size="12" :stroke-width="1.5" />
                                        <ChevronRight v-else :size="12" :stroke-width="1.5" />
                                        <span class="block-label">cURL Command</span>
                                    </button>
                                    <button @click.stop="copyCurlToClipboard(item)" class="ghost-btn" title="Copy cURL">
                                        <Copy :size="12" :stroke-width="1.5" />
                                        <span>Copy</span>
                                    </button>
                                </div>
                                <pre v-if="expandedCurlSections.has(item.id)" class="curl-pre">{{ formatAsCurl(item) }}</pre>

                                <div v-if="item.requestBody" class="history-block">
                                    <h4 class="block-label">Request Body</h4>
                                    <div class="json-editor-wrapper">
                                        <JsonEditorVue
                                            :model-value="item.requestBody"
                                            mode="text"
                                            :readOnly="true"
                                            :mainMenuBar="false"
                                            :navigationBar="false"
                                            :statusBar="false"
                                            :darkTheme="theme === 'dark'"
                                        />
                                    </div>
                                </div>

                                <div v-if="item.responseError" class="history-block">
                                    <h4 class="block-label error">Error</h4>
                                    <p class="error-message">[ERROR] {{ item.responseError }}</p>
                                </div>

                                <div v-else-if="item.response" class="history-block">
                                    <h4 class="block-label">Response</h4>
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
                                            :darkTheme="theme === 'dark'"
                                        />
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>

                    <div v-show="bottomTab === 'curl'" class="tab-pane">
                        <pre class="curl-pre full">{{ liveCurl }}</pre>
                        <p class="curl-hint">Auth tokens shown as placeholders — actual tokens are sent when you click Send.</p>
                    </div>
                </div>
            </section>
        </div>
    </main>
</template>

<style scoped lang="scss">
@use '@/styles/shared' as *;

.endpoint-tester {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    background: var(--black);
    display: flex;
    flex-direction: column;
}

// ─── HEADER / SECURITY (non-scrolling) ────────────────────────────────

.endpoint-head {
    padding: $space-sm $space-2xl;
    flex-shrink: 0;
}

// ─── CANVAS (top + divider + bottom) ──────────────────────────────────

.canvas {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

.top-pane {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: $space-md $space-2xl $space-md;
    @include dot-grid-subtle;
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.pane-divider {
    height: 1px;
    background: var(--border);
    cursor: row-resize;
    flex-shrink: 0;
    position: relative;
    @include transition-micro(background);

    &::before {
        content: '';
        position: absolute;
        top: -4px;
        bottom: -4px;
        left: 0;
        right: 0;
    }

    &:hover,
    &.resizing {
        background: var(--text-disabled);
    }
}

.pane-divider-grip {
    position: absolute;
    top: -1px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 3px;
    background: var(--border-visible);
    border-radius: 2px;

    .pane-divider:hover &,
    .pane-divider.resizing & {
        background: var(--text-disabled);
    }
}

.bottom-pane {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--black);
    min-height: 180px;

    &.resizing {
        user-select: none;
    }
}

.bottom-tabs {
    display: flex;
    align-items: center;
    gap: $space-lg;
    padding: 0 $space-2xl;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.bottom-tab {
    @include type-label;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: $space-sm 0;
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    @include transition-micro;

    &:hover {
        color: var(--text-primary);
    }

    &.active {
        color: var(--text-display);
        border-bottom-color: var(--text-display);
    }
}

.bottom-tab-status,
.bottom-tab-count {
    @include type-label;
    font-size: 10px;
    padding: 1px 6px;
    border: 1px solid var(--border-visible);
    border-radius: 3px;
    color: var(--text-secondary);
}

.bottom-tab-status {
    &.success { color: var(--success); border-color: var(--success); }
    &.error { color: var(--accent); border-color: var(--accent); }
    &.redirect { color: var(--warning); border-color: var(--warning); }
}

.bottom-tabs-spacer {
    flex: 1;
}

.bottom-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.tab-pane {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: $space-md $space-2xl;
    display: flex;
    flex-direction: column;
}

// ─── RESPONSE VIEW ────────────────────────────────────────────────────

.response-view {
    display: flex;
    flex-direction: column;
    gap: $space-md;
    flex: 1;
    min-height: 0;
}

.response-head {
    display: flex;
    align-items: baseline;
    gap: $space-md;
}

.response-status {
    @include type-data;
    font-size: 24px;
    color: var(--text-primary);

    &.success { color: var(--success); }
    &.error { color: var(--accent); }
    &.redirect { color: var(--warning); }
}

.response-status-text {
    @include type-label;
    color: var(--text-secondary);
}

.json-editor-wrapper.full {
    flex: 1;
    min-height: 160px;
}

.empty-state.subtle {
    border: none;
    color: var(--text-disabled);
    padding: $space-xl 0;
    text-align: center;
}

.error-block {
    padding: $space-md $space-lg;
    border: 1px solid var(--accent);
    background: var(--accent-subtle);
}

.curl-pre.full {
    margin: 0;
    padding: $space-md $space-lg;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-family: $font-data;
    font-size: $body-sm;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
    flex: 1;
    min-height: 0;
    overflow: auto;
}

.curl-hint {
    @include type-caption;
    color: var(--text-disabled);
    margin: $space-sm 0 0 0;
}

// ─── STICKY SEND ──────────────────────────────────────────────────────

.send-row.sticky-send {
    position: sticky;
    bottom: 0;
    background: var(--black);
    padding-top: $space-md;
    padding-bottom: $space-2xs;
    margin-top: $space-md;
    border-top: 1px solid var(--border);
    z-index: 2;
}

// ─── ENDPOINT HEAD ────────────────────────────────────────────────────

.endpoint-head {
    display: flex;
    flex-direction: column;
    gap: $space-2xs;
    border-bottom: 1px solid var(--border);
}

.endpoint-line {
    display: flex;
    align-items: center;
    gap: $space-md;
    flex-wrap: wrap;
    row-gap: $space-xs;
}

.endpoint-method {
    @include type-label;
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid currentColor;
    border-radius: 3px;
    color: var(--text-secondary);
    flex-shrink: 0;

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
    font-size: 16px;
    color: var(--text-display);
    word-break: break-all;
    flex-shrink: 0;
}

.endpoint-lock {
    color: var(--text-disabled);
    flex-shrink: 0;
}

.endpoint-summary {
    @include type-body-sm;
    color: var(--text-secondary);
    margin: 0;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.endpoint-description {
    @include type-caption;
    color: var(--text-disabled);
    margin: 0;
    max-width: 880px;
}

.endpoint-auth {
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    flex-shrink: 0;
    margin-left: auto;
}

.endpoint-auth-label {
    @include type-label;
    font-size: 10px;
    color: var(--text-disabled);
}

.chip {
    @include type-label;
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    padding: $space-xs $space-md;
    background: transparent;
    border: 1px solid var(--border-visible);
    border-radius: 999px;
    color: var(--text-secondary);
    cursor: pointer;
    @include transition-micro;

    &:hover {
        color: var(--text-primary);
        border-color: var(--text-primary);
    }

    &.active {
        background: var(--text-display);
        border-color: var(--text-display);
        color: var(--black);
    }

    &.small {
        font-size: 9px;
        padding: 2px $space-sm;
        gap: 3px;
    }
}

// ─── SECTIONS ──────────────────────────────────────────────────────────

.section-title {
    @include type-display-md;
    font-size: 28px;
    color: var(--text-display);
    margin: 0 0 $space-md 0;
    font-weight: 500;
}

.block-label {
    @include type-label;
    color: var(--text-secondary);
    margin: 0;

    &.error {
        color: var(--accent);
    }
}

.block-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-md;
    margin-bottom: $space-md;
    padding-bottom: $space-sm;
    border-bottom: 1px solid var(--border);
}

.params-block {
    display: flex;
    flex-direction: column;
    gap: $space-sm;
    padding: $space-md $space-lg;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 2px solid var(--border-visible);
    @include transition-micro(border-color);

    &:hover {
        border-left-color: var(--text-disabled);
    }

    > .block-label:first-child {
        padding-bottom: $space-sm;
        margin-bottom: $space-sm;
        border-bottom: 1px solid var(--border);
    }
}

.params-list {
    display: flex;
    flex-direction: column;
}

.param-row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) 2fr;
    gap: $space-md;
    align-items: baseline;
    padding: $space-sm 0;
    border-bottom: 1px solid var(--border);

    &:last-child {
        border-bottom: none;
    }
}

.param-label {
    @include type-body-sm;
    color: var(--text-secondary);
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
}

.param-name {
    font-family: $font-data;
    color: var(--text-primary);
}

.param-required {
    color: var(--accent);
    margin-left: $space-2xs;
}

.param-desc {
    color: var(--text-disabled);
    font-family: $font-body;
}

.text-input {
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-primary);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-visible);
    padding: $space-xs 0;
    outline: none;
    @include transition-micro(border-color);

    &::placeholder {
        color: var(--text-disabled);
    }

    &:focus {
        border-color: var(--text-display);
    }
}

// ─── SEGMENTED ─────────────────────────────────────────────────────────

.segmented {
    display: inline-flex;
    border: 1px solid var(--border-visible);
    border-radius: 999px;
    overflow: hidden;
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

// ─── SEND BUTTON ───────────────────────────────────────────────────────

.send-row {
    display: flex;
    justify-content: flex-start;
    padding-top: $space-md;
}

.send-btn {
    @include type-label;
    font-size: 13px;
    height: 48px;
    padding: 0 $space-xl;
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

// ─── HISTORY ───────────────────────────────────────────────────────────

.ghost-btn {
    @include type-label;
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: $space-xs $space-sm;
    @include transition-micro(color);

    &:hover {
        color: var(--text-display);
    }
}

.empty-state {
    @include type-caption;
    color: var(--text-disabled);
    padding: $space-xl 0;
    margin: 0;
    text-align: center;
    border-top: 1px dashed var(--border);
    border-bottom: 1px dashed var(--border);
}

.history-list {
    display: flex;
    flex-direction: column;
}

.history-item {
    padding: $space-lg 0;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: $space-md;

    &:first-child {
        border-top: none;
        padding-top: 0;
    }
}

.history-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: $space-md;
    flex-wrap: wrap;
}

.history-status-row {
    display: flex;
    align-items: baseline;
    gap: $space-md;
    flex: 1 1 0;
    min-width: 240px;
}

.history-status {
    @include type-data;
    font-size: $body;
    min-width: 48px;
    color: var(--text-primary);

    &.success { color: var(--success); }
    &.error { color: var(--accent); }
    &.redirect { color: var(--warning); }
}

.history-url {
    font-family: $font-data;
    font-size: $body-sm;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 0;
}

.history-meta {
    display: flex;
    gap: $space-md;
    align-items: baseline;
}

.history-auth,
.history-time {
    @include type-label;
    color: var(--text-disabled);
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
}

.curl-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-md;
}

.curl-toggle {
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: $space-xs 0;
    @include transition-micro(color);

    &:hover {
        color: var(--text-primary);
    }
}

.curl-pre {
    margin: 0;
    padding: $space-md;
    font-family: $font-data;
    font-size: $caption;
    line-height: 1.6;
    color: var(--text-primary);
    background: var(--surface);
    border: 1px solid var(--border);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
}

.history-block {
    display: flex;
    flex-direction: column;
    gap: $space-sm;
}

.error-message {
    @include type-data;
    color: var(--accent);
    margin: 0;
    padding: $space-sm 0;
}

// ─── SCHEMA / JSON SHARED ──────────────────────────────────────────────

.schema-display {
    background: var(--surface);
    border: 1px solid var(--border);
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

.json-editor-wrapper {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
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
