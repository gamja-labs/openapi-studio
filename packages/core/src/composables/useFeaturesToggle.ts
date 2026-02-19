/**
 * Features Toggle Composable
 * 
 * Provides reactive logic for enabling/disabling features based on environment variables.
 */
export function useFeaturesToggle() {
    /**
     * Checks if the service host picker feature is enabled.
     * Enabled if VITE_SERVICE_HOST or VITE_ENABLE_SERVICE_HOST_SELECTION is set.
     */
    const isServiceHostPickerEnabled = ((): boolean => {
        const enableSelection = import.meta.env.VITE_ENABLE_SERVICE_HOST_SELECTION
        if (enableSelection) return true;

        const defaultServiceHostToWindowOrigin = import.meta.env.VITE_DEFAULT_SERVICE_HOST_TO_WINDOW_ORIGIN === 'true'
        if (defaultServiceHostToWindowOrigin) return false;

        const serviceHost = import.meta.env.VITE_SERVICE_HOST
        if (serviceHost) return false;
        return true;
    })()


    /**
     * Checks if Clerk is enabled (opposite of isClerkDisabled).
     */
    const isClerkEnabled = ((): boolean => {
        return !import.meta.env.VITE_DISABLE_CLERK
    })()


    /**
     * Checks if changing the Clerk publishable key is enabled.
     * Enabled if VITE_CLERK_PUBLISHABLE_KEY is not set OR VITE_ENABLE_CLERK_PUB_KEY_SELECTION is set.
     */
    const isClerkPublishableKeyChangeEnabled = ((): boolean => {
        if (!isClerkEnabled) return false;

        const enableSelection = import.meta.env.VITE_ENABLE_CLERK_PUB_KEY_SELECTION
        if (enableSelection) return true;

        const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
        if (clerkKey) return false;
        return true;
    })()


    return {
        isServiceHostPickerEnabled,
        isClerkPublishableKeyChangeEnabled,
        isClerkEnabled,
    }
}
