<script setup lang="ts">
    import { ref, computed, watch } from 'vue';
    import type { OpenAPIV3 } from 'openapi-types';
    import JsonEditorVue from 'vue3-ts-jsoneditor';
    import { Lock, Unlock, Rocket, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next';
    import { useOpenApiStore } from '@/stores/openapi';
    import { useEndpointStore, type RequestHistoryItem } from '@/stores/endpoint';
    import { useConfigStore } from '@/stores/config';
    import { useAuth } from '@clerk/vue';
    
    const CLERK_BEARER_SCHEME = '__clerk_bearer__';
    
    // Stores and composables
    const openApiStore = useOpenApiStore();
    const endpointStore = useEndpointStore();
    
    // Get path and method from store
    const path = computed(() => endpointStore.selectedPath);
    const method = computed(() => endpointStore.selectedMethod);
    const config = useConfigStore();
    // Clerk auth state
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
    
    // State
    const requestQuery = ref<Record<string, any>>({});
    const requestUrlParams = ref<Record<string, any>>({});
    const requestBody = ref<string>('');
    const response = ref<any>(null);
    const responseError = ref<string | null>(null);
    const sendingRequest = ref(false);
    const authCredentials = ref<Record<string, any>>({});
    const expandedCurlSections = ref<Set<string>>(new Set());
    const requestBodyViewMode = ref(false); // false = example, true = schema
    
    // Use endpoint store for shared state
    const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);
    const filteredRequestHistory = computed(() => endpointStore.filteredRequestHistory);
    
    // Computed
    const endpoint = computed(() => {
        if (!path.value || !method.value) return null;
        return openApiStore.getSelectedEndpoint(path.value, method.value);
    });
    
    const endpointSpec = computed(() => {
        if (!path.value || !method.value) return null;
        return openApiStore.endpoints.find(e => e.path === path.value && e.method === method.value);
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
    
    // Methods
    const endpointRequiresSecurity = (operation: OpenAPIV3.OperationObject): boolean => {
        return openApiStore.endpointRequiresSecurity(operation);
    };
    
    const selectSecurityScheme = (schemeName: string | null) => {
        endpointStore.toggleSelectedAuthScheme(schemeName);
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
    
            // Apply path parameters
            for (const [key, value] of Object.entries(requestUrlParams.value)) {
                if (value !== '' && value != null) {
                    url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
                }
            }
    
            // Build query parameters
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
    
    // Save form state before switching endpoints
    const saveCurrentFormState = () => {
        // console.log('Saving form state', path.value, method.value, requestQuery.value, requestUrlParams.value, requestBody.value, selectedAuthScheme.value);
        if (!path.value || !method.value) return;
        endpointStore.saveEndpointFormState(path.value, method.value, {
            requestQuery: { ...requestQuery.value },
            requestUrlParams: { ...requestUrlParams.value },
            requestBody: requestBody.value,
            selectedAuthScheme: selectedAuthScheme.value,
        });
    };
    
    // Initialize request params and body when endpoint changes
    watch([path, method], ([newPath, newMethod], [oldPath, oldMethod]) => {
        if (newPath !== oldPath || newMethod !== oldMethod) {
            // console.log('Endpoint changed', newPath, newMethod, oldPath, oldMethod);
           
            // Clear response state
            response.value = null;
            responseError.value = null;
            expandedCurlSections.value.clear();
    
            // Try to restore saved form state
            const savedState = endpointStore.getEndpointFormState(newPath || '', newMethod || '');
            const hasRestoredState = !!savedState;
            // console.log('hasRestoredState', hasRestoredState, savedState);

            if (hasRestoredState && savedState) {
                // Restore saved state
                requestQuery.value = { ...savedState.requestQuery };
                requestUrlParams.value = { ...savedState.requestUrlParams };
                requestBody.value = savedState.requestBody;
                endpointStore.setSelectedAuthScheme(savedState.selectedAuthScheme);
            } else {
                // Reset state when no saved state
                requestQuery.value = {};
                requestUrlParams.value = {};
                requestBody.value = '';
                endpointStore.setSelectedAuthScheme(null);
            }
    
            // Initialize params from endpoint (merge with restored state)
            if (endpoint.value?.parameters) {
                for (const param of endpoint.value.parameters) {
                    const resolved = openApiStore.resolveParameter(param);
                    if (resolved && resolved.in === 'query') {
                        // Only initialize if not already in restored state
                        if (!hasRestoredState || !(resolved.name in requestQuery.value)) {
                            requestQuery.value[resolved.name] = '';
                        }
                    } else if (resolved && resolved.in === 'path') {
                        // Only initialize if not already in restored state
                        if (!hasRestoredState || !(resolved.name in requestUrlParams.value)) {
                            requestUrlParams.value[resolved.name] = '';
                        }
                    }
                }
            } else if (!hasRestoredState) {
                // Clear params if no endpoint params and no restored state
                requestQuery.value = {};
                requestUrlParams.value = {};
            }
    
            // Initialize request body (only if no restored state)
            if (!hasRestoredState && endpoint.value?.requestBody) {
                // console.log('Initializing request body', endpoint.value.requestBody);
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
                // Clear request body if no endpoint request body and no restored state
                requestBody.value = '';
            }
        }
    }, { immediate: true });
    
    // Auto-save form state when it changes
    watch([requestQuery, requestUrlParams, requestBody, selectedAuthScheme], () => {
        if (path.value && method.value) {
            saveCurrentFormState();
        }
    }, { deep: true });
</script>

<template>
    <main class="endpoint-tester">
        <div class="endpoint-header">
            <div class="endpoint-title">
                <span class="method-badge large"
                    :style="{ backgroundColor: getMethodColor(method || '') }">
                    {{ method }}
                </span>
                <span class="endpoint-path">{{ path }}</span>
                <Lock v-if="endpoint && endpointRequiresSecurity(endpoint)" 
                    :size="18" 
                    class="security-indicator-large"
                    title="Requires authentication" />
            </div>
            <div v-if="endpoint && (endpoint.summary || endpoint.description)" class="endpoint-info">
                <p v-if="endpoint.summary" class="endpoint-summary-text">
                    {{ endpoint.summary }}
                </p>
                <p v-if="endpoint.description" class="endpoint-description">
                    {{ endpoint.description }}
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
                            <input v-model="requestUrlParams[param.name]" type="text"
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
                            <input v-model="requestQuery[param.name]" type="text"
                                :placeholder="param.schema && 'default' in param.schema ? String(param.schema.default) : ''" />
                        </dd>
                    </div>
                </dl>
            </div>

            <!-- Request Body -->
            <div v-if="endpoint && endpoint.requestBody" class="body-section">
                <div class="body-section-header">
                    <h4>Request Body</h4>
                    <div class="view-toggle">
                        <button 
                            @click="toggleRequestBodyViewMode" 
                            :class="{ active: !requestBodyViewMode }"
                            class="toggle-btn small"
                        >
                            Edit
                        </button>
                        <button 
                            @click="toggleRequestBodyViewMode" 
                            :class="{ active: requestBodyViewMode }"
                            class="toggle-btn small"
                        >
                            Schema
                        </button>
                    </div>
                </div>
                <div v-if="requestBodyViewMode && requestBodySchemaDisplay" class="schema-display">
                    <pre class="schema-text">{{ requestBodySchemaDisplay }}</pre>
                </div>
                <div v-else-if="!requestBodyViewMode" class="json-editor-wrapper">
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
            <div v-if="!path || !method" class="no-response">
                Select an endpoint to view request history.
            </div>
            <div v-else-if="filteredRequestHistory.length === 0" class="no-response">
                No requests sent yet. Click "Send Request" to test the endpoint.
            </div>
            <div v-else class="request-history-list">
                <div v-for="item in filteredRequestHistory" :key="item.id" class="history-item">
                    <div class="history-item-header">
                        <div class="history-item-title">
                            <span class="status-code" :class="{
                                success: item.status && item.status >= 200 && item.status < 300,
                                error: item.status && item.status >= 400,
                                redirect: item.status && item.status >= 300 && item.status < 400
                            }">
                                {{ item.status || 'N/A' }}
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
</template>



<style scoped lang="scss">
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

.security-indicator-large {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0.8;
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

    &:hover {
        background-color: hsl(var(--muted) / 0.7);
        border-color: hsl(var(--muted-foreground) / 0.3);
    }

    &.selected {
        border-color: hsl(var(--primary));
        background-color: hsla(var(--primary) / 0.1);
        box-shadow: 0 0 0 2px hsla(var(--primary) / 0.2);
    }

    &.selected .security-card-icon {
        color: hsl(var(--primary));
        opacity: 1;
    }

    &.selected .scheme-name {
        color: hsl(var(--primary));
    }
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
        margin-bottom: 0;
        margin-top: 0;
        font-weight: 600;
        color: hsl(var(--foreground));
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
}

.body-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
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

.schema-display {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--input));
    max-height: 400px;
    min-height: 150px;
    overflow-y: auto;
    overflow-x: auto;
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

.response-section {
    margin-bottom: 1.5rem;

    h3 {
        font-size: 1.125rem;
        margin-bottom: 1.25rem;
        margin-top: 0;
        font-weight: 600;
        color: hsl(var(--foreground));
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

.no-response {
    padding: 1.5rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    border: 1px dashed hsl(var(--border));
    border-radius: var(--radius);
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

.history-curl-section {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: hsl(var(--input));
    border-radius: calc(var(--radius) - 2px);

    .curl-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
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

.app-footer {
    margin-top: auto;
    text-align: center;

    p {
        margin: 0;
        font-size: 0.875rem;
        color: hsl(var(--muted-foreground));
    }
}
</style>
