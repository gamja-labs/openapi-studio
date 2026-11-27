<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, Lock, Unlock } from '@lucide/vue';
import type { OpenAPIV3 } from 'openapi-types';
import { useOpenApiStore } from '@/stores/openapi';
import { useEndpointStore } from '@/stores/endpoint';
import { useConfigStore } from '@/stores/config';
import { useConfigJson } from '@/composables/useConfigJson';

const CLERK_BEARER_SCHEME = '__clerk_bearer__';

const openApiStore = useOpenApiStore();
const endpointStore = useEndpointStore();
const config = useConfigStore();
const configJson = useConfigJson();

const clerkAvailable = computed(() => !!(config.clerkPublishableKey && config.clerkPublishableKey.trim()));

const securitySchemes = computed(() => openApiStore.securitySchemes);

const selectedAuthScheme = computed(() => endpointStore.selectedAuthScheme);

const authMenuOpen = computed(() => endpointStore.authMenuOpen);

const authCredentials = ref<Record<string, any>>({});

const selectedServiceHost = computed(() => config.selectedServiceHost);
const clerkKey = ref('');

watch(selectedServiceHost, (host) => {
    clerkKey.value = host?.clerkPublishableKey || '';
}, { immediate: true });

const hasSavedClerkKey = computed(() => {
    return !!(selectedServiceHost.value?.clerkPublishableKey?.trim());
});
const isClerkKeyReadOnly = computed(() => {
    const source = clerkKeySource.value;
    return source === 'config.json' || source === 'env';
});
const clerkKeySource = computed(() => {
    const configKey = config.clerkPublishableKey;
    const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    const mergedConfig = config.config;

    if (selectedServiceHost.value?.clerkPublishableKey) {
        return 'serviceHost';
    }

    if (configKey && mergedConfig.clerkPublishableKey === configKey && configKey !== envKey) {
        return 'config.json';
    }

    if (configKey && configKey === envKey) {
        return 'env';
    }

    return null;
});

const clerkKeySourceMessage = computed(() => {
    const source = clerkKeySource.value;
    if (source === 'config.json') {
        return `Key loaded from ${configJson.getConfigJsonPath()}`;
    } else if (source === 'env') {
        return 'Key loaded from environment variable';
    } else if (source === 'serviceHost') {
        return 'Key stored with service host';
    }
    return null;
});

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
    config.saveClerkPublishableKeyForSelectedHost(clerkKey.value);
    if (typeof window !== 'undefined') {
        window.location.reload();
    }
};

const clearClerkKey = () => {
    if (!selectedServiceHost.value) return;
    config.clearClerkPublishableKeyForSelectedHost();
    if (typeof window !== 'undefined') {
        window.location.reload();
    }
};

const closeMenu = () => {
    endpointStore.closeAuthMenu();
};

defineExpose({
    authCredentials,
});
</script>

<template>
    <aside v-if="authMenuOpen" class="auth-menu">
        <header class="auth-menu-head">
            <h2 class="auth-menu-title">Security Scheme</h2>
            <button @click="closeMenu" class="auth-menu-close" title="Close">
                <X :size="16" :stroke-width="1.5" />
            </button>
        </header>
        <div class="auth-menu-body">
            <div
                class="auth-card"
                :class="{ active: selectedAuthScheme === null }"
                @click="selectSecurityScheme(null)"
            >
                <div class="auth-card-head">
                    <div class="auth-card-title">
                        <Unlock :size="14" :stroke-width="1.5" />
                        <h3>Anonymous</h3>
                    </div>
                    <span class="auth-card-type">NONE</span>
                </div>
                <p class="auth-card-desc">Make requests without authentication.</p>
            </div>

            <div
                v-if="clerkAvailable"
                class="auth-card"
                :class="{ active: selectedAuthScheme === CLERK_BEARER_SCHEME }"
                @click="selectSecurityScheme(CLERK_BEARER_SCHEME)"
            >
                <div class="auth-card-head">
                    <div class="auth-card-title">
                        <Lock :size="14" :stroke-width="1.5" />
                        <h3>Clerk Bearer</h3>
                    </div>
                    <span class="auth-card-type">CLERK</span>
                </div>
                <p class="auth-card-desc">Use Clerk authentication token for bearer authentication.</p>
            </div>

            <div
                v-for="item in securitySchemes"
                :key="item.name"
                class="auth-card"
                :class="{ active: selectedAuthScheme === item.name }"
                @click="selectSecurityScheme(item.name)"
            >
                <div class="auth-card-head">
                    <div class="auth-card-title">
                        <Lock :size="14" :stroke-width="1.5" />
                        <h3>{{ item.name }}</h3>
                    </div>
                    <span class="auth-card-type">{{ item.scheme.type }}</span>
                </div>
                <p class="auth-card-desc" v-if="item.scheme.description">{{ item.scheme.description }}</p>

                <div v-if="item.scheme.type === 'apiKey'" class="auth-fields" @click.stop>
                    <label class="auth-field">
                        <span class="auth-label">
                            {{ (item.scheme as OpenAPIV3.ApiKeySecurityScheme).name }}
                            <span class="auth-label-aux">({{ (item.scheme as OpenAPIV3.ApiKeySecurityScheme).in }})</span>
                        </span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.value || ''"
                            @input="updateAuthCredential(item.name, 'value', ($event.target as HTMLInputElement).value)"
                            :placeholder="`Enter ${(item.scheme as OpenAPIV3.ApiKeySecurityScheme).name}`"
                            class="auth-input"
                        />
                    </label>
                    <button v-if="authCredentials[item.name]?.value" @click="clearAuthCredential(item.name)" class="ghost-btn">Clear</button>
                </div>

                <div v-else-if="item.scheme.type === 'http' && (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'basic'" class="auth-fields" @click.stop>
                    <label class="auth-field">
                        <span class="auth-label">Username</span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.username || ''"
                            @input="updateAuthCredential(item.name, 'username', ($event.target as HTMLInputElement).value)"
                            placeholder="Enter username"
                            class="auth-input"
                        />
                    </label>
                    <label class="auth-field">
                        <span class="auth-label">Password</span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.password || ''"
                            @input="updateAuthCredential(item.name, 'password', ($event.target as HTMLInputElement).value)"
                            placeholder="Enter password"
                            class="auth-input"
                        />
                    </label>
                    <button v-if="authCredentials[item.name]?.username || authCredentials[item.name]?.password" @click="clearAuthCredential(item.name)" class="ghost-btn">Clear</button>
                </div>

                <div v-else-if="item.scheme.type === 'http' && (item.scheme as OpenAPIV3.HttpSecurityScheme).scheme === 'bearer'" class="auth-fields" @click.stop>
                    <label class="auth-field">
                        <span class="auth-label">Bearer Token</span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.token || ''"
                            @input="updateAuthCredential(item.name, 'token', ($event.target as HTMLInputElement).value)"
                            placeholder="Enter bearer token"
                            class="auth-input"
                        />
                    </label>
                    <button v-if="authCredentials[item.name]?.token" @click="clearAuthCredential(item.name)" class="ghost-btn">Clear</button>
                </div>

                <div v-else-if="item.scheme.type === 'oauth2'" class="auth-fields" @click.stop>
                    <label class="auth-field">
                        <span class="auth-label">Access Token</span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.accessToken || ''"
                            @input="updateAuthCredential(item.name, 'accessToken', ($event.target as HTMLInputElement).value)"
                            placeholder="Enter OAuth2 access token"
                            class="auth-input"
                        />
                    </label>
                    <button v-if="authCredentials[item.name]?.accessToken" @click="clearAuthCredential(item.name)" class="ghost-btn">Clear</button>
                </div>

                <div v-else-if="item.scheme.type === 'openIdConnect'" class="auth-fields" @click.stop>
                    <label class="auth-field">
                        <span class="auth-label">ID Token</span>
                        <input
                            type="text"
                            :value="authCredentials[item.name]?.idToken || ''"
                            @input="updateAuthCredential(item.name, 'idToken', ($event.target as HTMLInputElement).value)"
                            placeholder="Enter OpenID Connect ID token"
                            class="auth-input"
                        />
                    </label>
                    <button v-if="authCredentials[item.name]?.idToken" @click="clearAuthCredential(item.name)" class="ghost-btn">Clear</button>
                </div>
            </div>

            <div v-if="selectedServiceHost" class="clerk-key-card">
                <h3 class="clerk-key-title">Clerk Publishable Key</h3>
                <p class="clerk-key-desc">
                    <span v-if="clerkKeySourceMessage">{{ clerkKeySourceMessage }}</span>
                    <span v-else>Stored with the selected service host.</span>
                </p>
                <label class="auth-field">
                    <span class="auth-label">Publishable Key</span>
                    <input
                        v-model="clerkKey"
                        type="text"
                        placeholder="pk_test_..."
                        class="auth-input"
                        :disabled="hasSavedClerkKey || isClerkKeyReadOnly"
                    />
                </label>
                <button
                    v-if="!hasSavedClerkKey && !isClerkKeyReadOnly"
                    @click="saveClerkKey"
                    class="primary-btn"
                >Save & reload</button>
                <button
                    v-else-if="hasSavedClerkKey && !isClerkKeyReadOnly"
                    @click="clearClerkKey"
                    class="primary-btn"
                >Clear & reload</button>
            </div>
        </div>
    </aside>
</template>

<style lang="scss" scoped>
@use '@/styles/shared' as *;

.auth-menu {
    position: fixed;
    top: 0;
    right: 0;
    width: 420px;
    height: 100vh;
    background: var(--surface-raised);
    border-left: 1px solid var(--border-visible);
    z-index: 1000;
    display: flex;
    flex-direction: column;
}

.auth-menu-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-md $space-lg;
    border-bottom: 1px solid var(--border);
}

.auth-menu-title {
    @include type-label;
    color: var(--text-secondary);
    margin: 0;
}

.auth-menu-close {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    @include transition-micro(color);

    &:hover {
        color: var(--text-display);
    }
}

.auth-menu-body {
    flex: 1;
    overflow-y: auto;
    padding: $space-md $space-lg $space-lg;
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.auth-card {
    border: 1px solid var(--border);
    padding: $space-md $space-md $space-md $space-md;
    cursor: pointer;
    position: relative;
    border-left: 2px solid transparent;
    @include transition-micro;

    &:hover {
        border-color: var(--border-visible);
    }

    &.active {
        border-color: var(--border-visible);
        border-left-color: var(--text-display);

        .auth-card-title h3 {
            color: var(--text-display);
        }
    }
}

.auth-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-md;
}

.auth-card-title {
    display: flex;
    align-items: center;
    gap: $space-sm;
    color: var(--text-secondary);

    h3 {
        @include type-body-sm;
        font-weight: 500;
        margin: 0;
        color: var(--text-primary);
        @include transition-micro(color);
    }
}

.auth-card-type {
    @include type-label;
    color: var(--text-disabled);
}

.auth-card-desc {
    @include type-caption;
    color: var(--text-secondary);
    margin: $space-sm 0 0 0;
}

.auth-fields {
    display: flex;
    flex-direction: column;
    gap: $space-md;
    margin-top: $space-md;
    padding-top: $space-md;
    border-top: 1px solid var(--border);
}

.auth-field {
    display: flex;
    flex-direction: column;
    gap: $space-xs;
}

.auth-label {
    @include type-label;
    color: var(--text-secondary);
}

.auth-label-aux {
    color: var(--text-disabled);
}

.auth-input {
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

    &:focus:not(:disabled) {
        border-color: var(--text-display);
    }

    &:disabled {
        color: var(--text-disabled);
        cursor: not-allowed;
    }
}

.ghost-btn {
    @include type-label;
    align-self: flex-start;
    background: transparent;
    border: 1px solid var(--border-visible);
    color: var(--text-secondary);
    height: 28px;
    padding: 0 $space-md;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;

    &:hover {
        color: var(--text-primary);
        border-color: var(--text-primary);
    }
}

.primary-btn {
    @include type-label;
    align-self: flex-start;
    height: 36px;
    padding: 0 $space-lg;
    background: var(--text-display);
    color: var(--black);
    border: none;
    border-radius: 999px;
    cursor: pointer;
    @include transition-micro;
    margin-top: $space-md;

    &:hover {
        background: var(--text-primary);
    }
}

.clerk-key-card {
    margin-top: auto;
    padding: $space-md 0 0 0;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: $space-sm;
}

.clerk-key-title {
    @include type-label;
    color: var(--text-secondary);
    margin: 0;
}

.clerk-key-desc {
    @include type-caption;
    color: var(--text-disabled);
    margin: 0 0 $space-sm 0;
}
</style>
