<template>
    <div class="not-found">
        <div class="not-found-content">
            <p class="not-found-eyebrow">ERROR / 404</p>
            <h1 class="not-found-code">404</h1>
            <p class="not-found-title">Page not found.</p>
            <p class="not-found-desc">The page you requested does not exist or has been moved.</p>
            <button class="not-found-btn" @click="goHome">
                Return Home →
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const goHome = () => {
    router.replace('/');
};
</script>

<style scoped lang="scss">
@use '@/styles/shared' as *;

.not-found {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $space-xl;
    background: var(--black);
    @include dot-grid-subtle;
}

.not-found-content {
    max-width: 560px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: $space-md;
}

.not-found-eyebrow {
    @include type-label;
    color: var(--text-disabled);
    margin: 0;
}

.not-found-code {
    font-family: $font-display;
    font-size: 128px;
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: var(--text-display);
    margin: 0;
    font-weight: 500;
}

.not-found-title {
    @include type-heading;
    color: var(--text-primary);
    margin: 0;
}

.not-found-desc {
    @include type-body;
    color: var(--text-secondary);
    margin: 0 0 $space-lg 0;
}

.not-found-btn {
    @include type-label;
    align-self: flex-start;
    height: 48px;
    padding: 0 $space-xl;
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
</style>
