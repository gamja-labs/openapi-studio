import type { INestApplication } from '@nestjs/common';
import type { HttpServer } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { getGlobalPrefix } from './utils/get-global-prefix.util.js';
import { validateGlobalPrefix } from './utils/validate-global-prefix.util.js';
import { validatePath } from './utils/validate-path.util.js';
import { getCoreDistAbsoluteFSPath } from './utils/get-core-dist-path.util.js';
import { resolvePath } from './utils/resolve-path.util.js';

/**
 * Options for OpenApiStudio setup
 */
export interface OpenApiStudioOptions {
    /**
     * URL path where the OpenAPI JSON document will be served
     * @default '/openapi.json'
     */
    jsonDocumentUrl?: string;

    /**
     * Clerk publishable key for authentication
     */
    clerkPublishableKey?: string;

    /**
     * Service host URL for API requests
     */
    serviceHost?: string;

    /**
     * OpenAPI spec URL (full URL to the OpenAPI JSON document)
     * If not provided, will be constructed from serviceHost + jsonDocumentUrl
     */
    openApiSpecUrl?: string;

    /**
     * Whether to use the global prefix
     * @default true
     */
    useGlobalPrefix?: boolean;

    /**
     * Custom path to the static assets directory
     * If not provided, will use the default from @openapi-studio/core
     */
    customStaticPath?: string;

    /**
     * Custom path for the config.json file
     * @default '/openapi-studio-config.json'
     */
    configJsonPath?: string;
}

/**
 * @publicApi
 */
export class OpenApiStudioModule {
    /**
     * Sets up OpenApiStudio to serve the static application and OpenAPI document
     * @param path - The path where OpenApiStudio will be served
     * @param app - The NestJS application instance
     * @param document - The OpenAPI document object
     * @param options - Configuration options
     */
    public static setup(
        path: string,
        app: INestApplication,
        document: OpenAPIObject,
        options?: OpenApiStudioOptions
    ) {

        console.log('options', options);
        const globalPrefix = getGlobalPrefix(app);
        const finalPath = validatePath(
            options?.useGlobalPrefix !== false && validateGlobalPrefix(globalPrefix)
                ? `${globalPrefix}${validatePath(path)}`
                : path
        );
        const validatedGlobalPrefix =
            options?.useGlobalPrefix !== false && validateGlobalPrefix(globalPrefix)
                ? validatePath(globalPrefix)
                : '';

        const jsonDocumentUrl = options?.jsonDocumentUrl
            ? `${validatedGlobalPrefix}${validatePath(options.jsonDocumentUrl)}`
            : `${validatedGlobalPrefix}/openapi.json`;

        console.log('jsonDocumentUrl', jsonDocumentUrl);

        const configJsonPath = options?.configJsonPath
            ? `${validatedGlobalPrefix}${validatePath(options.configJsonPath)}`
            : `${validatedGlobalPrefix}/openapi-studio-config.json`;

        const httpAdapter = app.getHttpAdapter();

        // Serve static files
        OpenApiStudioModule.serveStatic(finalPath, app, options?.customStaticPath);

        // Serve config.json
        OpenApiStudioModule.serveConfigJson(
            httpAdapter,
            configJsonPath,
            options || {}
        );

        // Serve OpenAPI document
        OpenApiStudioModule.serveOpenApiDocument(httpAdapter, jsonDocumentUrl, document);

        // Serve the main HTML file for all routes (SPA routing)
        OpenApiStudioModule.serveIndexHtml(finalPath, httpAdapter);
    }

    /**
     * Serves static assets from the core/dist directory
     */
    protected static serveStatic(
        finalPath: string,
        app: INestApplication,
        customStaticPath?: string
    ) {
        const httpAdapter = app.getHttpAdapter();

        const staticAssetsPath = customStaticPath
            ? resolvePath(customStaticPath)
            : getCoreDistAbsoluteFSPath();

        if (httpAdapter && httpAdapter.getType() === 'fastify') {
            (app as NestFastifyApplication).useStaticAssets({
                root: staticAssetsPath,
                prefix: finalPath,
                decorateReply: false
            });
        } else {
            (app as NestExpressApplication).useStaticAssets(staticAssetsPath, {
                prefix: finalPath
            });
        }
    }

    /**
     * Serves the config.json file with the provided configuration
     */
    protected static serveConfigJson(
        httpAdapter: HttpServer,
        configJsonPath: string,
        options: OpenApiStudioOptions
    ) {
        const normalizedPath = validatePath(configJsonPath);
        httpAdapter.get(normalizedPath, (_req, res) => {
            res.type('application/json');
            const config = {
                ...(options.serviceHost && { serviceHost: options.serviceHost }),
                ...(options.clerkPublishableKey && { clerkKey: options.clerkPublishableKey }),
                ...(options.openApiSpecUrl && { openApiSpecUrl: options.openApiSpecUrl })
            };
            res.send(JSON.stringify(config));
        });
    }

    /**
     * Serves the OpenAPI document at the specified path
     */
    protected static serveOpenApiDocument(
        httpAdapter: HttpServer,
        jsonDocumentUrl: string,
        document: OpenAPIObject
    ) {
        const normalizedPath = validatePath(jsonDocumentUrl);
        httpAdapter.get(normalizedPath, (_req, res) => {
            res.type('application/json');
            res.send(JSON.stringify(document));
        });
    }

    /**
     * Serves the index.html file for SPA routing
     * This ensures that all routes under the finalPath serve the Vue app
     */
    protected static serveIndexHtml(
        finalPath: string,
        httpAdapter: HttpServer
    ) {
        const distPath = getCoreDistAbsoluteFSPath();
        const indexHtmlPath = path.join(distPath, 'index.html');

        // Read index.html once
        let indexHtml: string | null = null;
        try {
            indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        } catch (err) {
            console.warn(`Could not read index.html from ${indexHtmlPath}`);
            return;
        }

        const serveIndex = (_req: any, res: any) => {
            res.type('text/html');
            res.send(indexHtml);
        };

        // Serve index.html for the root path
        httpAdapter.get(finalPath, serveIndex);

        // Also serve for paths that might not match static files (SPA routing)
        // This is a catch-all for the SPA - Vue Router will handle routing client-side
        try {
            const pathWithSlash = validatePath(`${finalPath}/`);
            httpAdapter.get(pathWithSlash, serveIndex);
        } catch {
            // Ignore errors if route already exists
        }
    }

    /**
     * Registers a catch-all route for SPA routing
     * This should be called after all other routes are registered
     * to ensure that any unmatched routes serve the Vue app
     * 
     * @param setupPath - The path prefix where OpenApiStudio is served
     * @param app - The NestJS application instance
     * @param options - Configuration options (must match the options used in setup)
     */
    public static registerCatchAllRoute(
        setupPath: string,
        app: INestApplication,
        options?: OpenApiStudioOptions
    ) {
        const globalPrefix = getGlobalPrefix(app);
        const finalPath = validatePath(
            options?.useGlobalPrefix !== false && validateGlobalPrefix(globalPrefix)
                ? `${globalPrefix}${validatePath(setupPath)}`
                : setupPath
        );

        const httpAdapter = app.getHttpAdapter();
        const distPath = getCoreDistAbsoluteFSPath();
        const indexHtmlPath = path.join(distPath, 'index.html');

        // Read index.html
        let indexHtml: string | null = null;
        try {
            indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        } catch (err) {
            console.warn(`Could not read index.html from ${indexHtmlPath}`);
            return;
        }

        // Register catch-all route for SPA
        // This matches any route under finalPath that doesn't match a static file
        const catchAllPattern = `${finalPath}/*`;
        httpAdapter.get(catchAllPattern, (_req: any, res: any) => {
            res.type('text/html');
            res.send(indexHtml);
        });
    }
}
