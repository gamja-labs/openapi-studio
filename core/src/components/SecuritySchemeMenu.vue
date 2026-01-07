<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, Lock, Unlock } from 'lucide-vue-next';
import type { OpenAPIV3 } from 'openapi-types';
import { useClerkStore } from '@/stores/clerk';
import { useOpenApiStore } from '@/stores/openapi';
import { useEndpointStore } from '@/stores/endpoint';
import { useConfigStore } from '@/stores/config';

const CLERK_BEARER_SCHEME = '__clerk_bearer__';

// Get stores and composables
const clerkStore = useClerkStore();
const openApiStore = useOpenApiStore();
const endpointStore = useEndpointStore();
const config = useConfigStore();

// Check if Clerk is available
const clerkAvailable = computed(() => clerkStore.hasClerkKey);

// Get security schemes
const securitySchemes = computed(() => openApiStore.securitySchemes);

// Get selected auth scheme
const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);

// Get auth menu open state
const authMenuOpen = computed(() => endpointStore.authMenuOpen);

// Auth credentials state
const authCredentials = ref<Record<string, any>>({});

// Get selected security scheme display name
const selectedSchemeName = computed(() => {
    if (!selectedAuthScheme.value) return 'Anonymous';
    if (selectedAuthScheme.value === CLERK_BEARER_SCHEME) return 'Clerk Bearer';
    const scheme = securitySchemes.value.find(s => s.name === selectedAuthScheme.value);
    return scheme ? scheme.name : 'Anonymous';
});

// Get selected service host's clerk key
const selectedServiceHost = computed(() => config.getSelectedServiceHost);
const clerkKey = ref('');

// Watch selected service host to update clerk key
watch(selectedServiceHost, (host) => {
    clerkKey.value = host?.clerkKey || '';
}, { immediate: true });

// Clerk key related computed properties
const hasSavedClerkKey = computed(() => {
    return !!(selectedServiceHost.value?.clerkKey?.trim());
});
const isClerkKeyReadOnly = computed(() => {
    // Check if key is from config.json or env (not editable)
    return config.isClerkKeyFromConfig() || config.isClerkKeyFromEnv();
});
const clerkKeySource = computed(() => {
    if (config.isClerkKeyFromConfig()) {
        return 'config.json';
    } else if (config.isClerkKeyFromEnv()) {
        return 'env';
    } else if (selectedServiceHost.value?.clerkKey) {
        return 'serviceHost';
    }
    return null;
});

// Get message for clerk key source
const clerkKeySourceMessage = computed(() => {
    const source = clerkKeySource.value;
    if (source === 'config.json') {
        return `Key loaded from ${config.getConfigJsonPath()}`;
    } else if (source === 'env') {
        return 'Key loaded from environment variable';
    } else if (source === 'serviceHost') {
        return 'Key stored with service host';
    }
    return null;
});

// Methods
const updateAuthCredential = (schemeName: string, field: string, value: any) => {
    if (!authCredentials.value[schemeName]) {
        authCredentials.value[schemeName] = {};
    }
    authCredentials.value[schemeName][field] = value;
};

const clearAuthCredential = (schemeName: string) => {
    delete authCredentials.value[schemeName];
};

const selectSecurityScheme = (schemeName: string | null) => {
    endpointStore.toggleSelectedAuthScheme(schemeName);
};

const saveClerkKey = () => {
    if (!selectedServiceHost.value) return;
    // Save clerk key to the selected service host
    config.saveClerkKeyForSelectedHost(clerkKey.value);
    // Reload the page to apply the new Clerk key
    if (typeof window !== 'undefined') {
        window.location.reload();
    }
};

const clearClerkKey = () => {
    if (!selectedServiceHost.value) return;
    // Clear clerk key from the selected service host
    config.clearClerkKeyForSelectedHost();
    // Reload the page
    if (typeof window !== 'undefined') {
        window.location.reload();
    }
};

const closeMenu = () => {
    endpointStore.closeAuthMenu();
};

// Expose authCredentials for parent component access if needed
defineExpose({
    authCredentials,
});
</script>

<template>
    <aside v-if="authMenuOpen" class="auth-side-menu">
        <div class="auth-menu-header">
            <h2>Security Scheme</h2>
            <button @click="closeMenu" class="close-auth-menu" title="Close">
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
            <div v-if="selectedServiceHost" class="clerk-key-card">
                <div class="clerk-key-header">
                    <h3>Clerk Publishable Key</h3>
                </div>
                <div class="clerk-key-description">
                    <span v-if="clerkKeySourceMessage">
                        {{ clerkKeySourceMessage }}
                    </span>
                    <span v-else>
                        Enter your Clerk publishable key to enable authentication. This will be stored with the selected service host.
                    </span>
                </div>
                <div class="clerk-key-fields">
                    <label>
                        <span>Publishable Key</span>
                            <input
                                v-model="clerkKey"
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
</template>

<style lang="scss" scoped>
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
</style>
