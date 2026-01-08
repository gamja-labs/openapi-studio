export interface Config {
    serviceHost?: string
    clerkPublishableKey?: string
    openApiSpecUrl?: string
}

// Service host type, stored in localStorage
export interface ServiceHost {
    id: string
    baseUrl: string
    openApiPath?: string
    label?: string
    clerkPublishableKey?: string
}