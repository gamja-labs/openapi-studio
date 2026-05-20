import { ref, watch } from 'vue';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'o-s-theme';

const readInitial = (): Theme => {
    if (typeof window === 'undefined') return 'dark';
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // ignore
    }
    return 'dark';
};

const theme = ref<Theme>('dark');
let initialized = false;

const applyTheme = (value: Theme) => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', value);
};

export function useTheme() {
    if (!initialized && typeof window !== 'undefined') {
        theme.value = readInitial();
        applyTheme(theme.value);
        watch(theme, value => {
            applyTheme(value);
            try {
                localStorage.setItem(STORAGE_KEY, value);
            } catch {
                // ignore
            }
        });
        initialized = true;
    }

    const toggle = () => {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
    };

    const setTheme = (value: Theme) => {
        theme.value = value;
    };

    return { theme, toggle, setTheme };
}
