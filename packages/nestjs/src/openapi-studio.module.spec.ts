import * as path from 'path';
import { OpenApiStudioModule } from './openapi-studio.module.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

vi.mock('./utils/get-core-dist-path.util.js', () => ({
  getCoreDistAbsoluteFSPath: vi.fn(() => '/mock/core/dist'),
}));

vi.mock('./utils/resolve-path.util.js', () => ({
  resolvePath: vi.fn((p: string) => `/resolved/${p}`),
}));

import { readFileSync } from 'fs';
import { getCoreDistAbsoluteFSPath } from './utils/get-core-dist-path.util.js';
import { resolvePath } from './utils/resolve-path.util.js';

const mockedReadFileSync = vi.mocked(readFileSync);

function createMockApp(options?: { globalPrefix?: string; adapterType?: string }) {
  const prefix = options?.globalPrefix || '';
  const adapterType = options?.adapterType || 'express';

  const httpAdapter = {
    get: vi.fn(),
    getType: vi.fn(() => adapterType),
  };

  const app = {
    config: {
      getGlobalPrefix: vi.fn(() => prefix),
    },
    getHttpAdapter: vi.fn(() => httpAdapter),
    useStaticAssets: vi.fn(),
  };

  return { app: app as any, httpAdapter };
}

const sampleDocument = {
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
};

const sampleHtml = [
  '<html><head>',
  '<link rel="icon" href="/favicon.ico">',
  '<link rel="stylesheet" href="/assets/app-DiS_moJx.css">',
  '<script src="/assets/app-Cj5cXHUH.js"></script>',
  '<style>@font-face{src:url(/assets/open-sans-abc.woff2)}</style>',
  '</head><body><div id="app"></div></body></html>',
].join('');

describe('OpenApiStudioModule', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCoreDistAbsoluteFSPath).mockReturnValue('/mock/core/dist');
    vi.mocked(resolvePath).mockImplementation((p: string) => `/resolved/${p}`);
    mockedReadFileSync.mockReturnValue('<html>index</html>');
  });

  describe('setup()', () => {
    it('should register static assets, config.json, openapi.json, and index.html routes', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      // Static assets via express
      expect(app.useStaticAssets).toHaveBeenCalledWith('/mock/core/dist', {
        prefix: '/docs',
      });

      // config.json, openapi.json, index.html root, and trailing-slash attempt = 4 httpAdapter.get calls
      // Note: validatePath('/docs/') strips trailing slash → '/docs', so both index routes use same path
      expect(httpAdapter.get).toHaveBeenCalledTimes(4);

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/openapi-studio-config.json');
      expect(registeredPaths).toContain('/openapi.json');
      expect(registeredPaths).toContain('/docs');
    });

    it('should apply global prefix when present', () => {
      const { app, httpAdapter } = createMockApp({ globalPrefix: '/api' });

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      // Static assets path should include prefix
      expect(app.useStaticAssets).toHaveBeenCalledWith('/mock/core/dist', {
        prefix: '/api/docs',
      });

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/api/openapi-studio-config.json');
      expect(registeredPaths).toContain('/api/openapi.json');
      expect(registeredPaths).toContain('/api/docs');
    });

    it('should skip global prefix when useGlobalPrefix is false', () => {
      const { app, httpAdapter } = createMockApp({ globalPrefix: '/api' });

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        useGlobalPrefix: false,
      });

      expect(app.useStaticAssets).toHaveBeenCalledWith('/mock/core/dist', {
        prefix: '/docs',
      });

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/openapi-studio-config.json');
      expect(registeredPaths).toContain('/openapi.json');
    });

    it('should use custom jsonDocumentUrl', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        jsonDocumentUrl: '/custom-spec.json',
      });

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/custom-spec.json');
      expect(registeredPaths).not.toContain('/openapi.json');
    });

    it('should use custom configJsonPath', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        configJsonPath: '/my-config.json',
      });

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/my-config.json');
      expect(registeredPaths).not.toContain('/openapi-studio-config.json');
    });

    it('should serve static assets via fastify adapter', () => {
      const { app } = createMockApp({ adapterType: 'fastify' });

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      expect(app.useStaticAssets).toHaveBeenCalledWith({
        root: '/mock/core/dist',
        prefix: '/docs',
        decorateReply: false,
      });
    });

    it('should use customStaticPath when provided', () => {
      const { app } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        customStaticPath: 'my/custom/path',
      });

      expect(resolvePath).toHaveBeenCalledWith('my/custom/path');
      expect(app.useStaticAssets).toHaveBeenCalledWith('/resolved/my/custom/path', {
        prefix: '/docs',
      });
    });

    it('should serve config.json with correct default options', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      // Find the config.json route handler
      const configCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/openapi-studio-config.json'
      );
      expect(configCall).toBeDefined();

      const handler = configCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      expect(mockRes.type).toHaveBeenCalledWith('application/json');
      const sentConfig = JSON.parse(mockRes.send.mock.calls[0][0]);
      expect(sentConfig).toEqual({
        defaultServiceHostToWindowOrigin: true,
        serviceHost: '/',
      });
    });

    it('should include clerkPublishableKey in config when provided', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        clerkPublishableKey: 'pk_test_123',
      });

      const configCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/openapi-studio-config.json'
      );
      const handler = configCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      const sentConfig = JSON.parse(mockRes.send.mock.calls[0][0]);
      expect(sentConfig.clerkPublishableKey).toBe('pk_test_123');
    });

    it('should include serviceHost and openApiSpecUrl in config', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        serviceHost: 'https://api.example.com',
        openApiSpecUrl: 'https://api.example.com/spec.json',
      });

      const configCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/openapi-studio-config.json'
      );
      const handler = configCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      const sentConfig = JSON.parse(mockRes.send.mock.calls[0][0]);
      expect(sentConfig.serviceHost).toBe('https://api.example.com');
      expect(sentConfig.openApiSpecUrl).toBe('https://api.example.com/spec.json');
    });

    it('should set defaultServiceHostToWindowOrigin to false when specified', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        defaultServiceHostToWindowOrigin: false,
      });

      const configCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/openapi-studio-config.json'
      );
      const handler = configCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      const sentConfig = JSON.parse(mockRes.send.mock.calls[0][0]);
      expect(sentConfig.defaultServiceHostToWindowOrigin).toBe(false);
    });

    it('should serve the OpenAPI document as JSON', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      const specCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/openapi.json'
      );
      expect(specCall).toBeDefined();

      const handler = specCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      expect(mockRes.type).toHaveBeenCalledWith('application/json');
      const sentDoc = JSON.parse(mockRes.send.mock.calls[0][0]);
      expect(sentDoc).toEqual(sampleDocument);
    });

    it('should serve index.html with text/html content type', () => {
      const { app, httpAdapter } = createMockApp();
      mockedReadFileSync.mockReturnValue('<html>test content</html>');

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      const indexCall = httpAdapter.get.mock.calls.find(
        (c: any[]) => c[0] === '/docs'
      );
      expect(indexCall).toBeDefined();

      const handler = indexCall![1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      expect(mockRes.type).toHaveBeenCalledWith('text/html');
      expect(mockRes.send).toHaveBeenCalledWith('<html>test content</html>');
    });

    it('should handle missing index.html gracefully', () => {
      const { app, httpAdapter } = createMockApp();
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read index.html')
      );

      // Config and openapi routes should still be registered, but index.html routes should not
      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/openapi-studio-config.json');
      expect(registeredPaths).toContain('/openapi.json');
      // index routes not registered since index.html is missing
      expect(registeredPaths).not.toContain('/docs');
    });

    it('should apply global prefix to jsonDocumentUrl and configJsonPath', () => {
      const { app, httpAdapter } = createMockApp({ globalPrefix: '/api' });

      OpenApiStudioModule.setup('/docs', app, sampleDocument as any, {
        jsonDocumentUrl: '/spec.json',
        configJsonPath: '/config.json',
      });

      const registeredPaths = httpAdapter.get.mock.calls.map((c: any[]) => c[0]);
      expect(registeredPaths).toContain('/api/spec.json');
      expect(registeredPaths).toContain('/api/config.json');
    });
  });

  describe('registerCatchAllRoute()', () => {
    it('should register a wildcard catch-all route', () => {
      const { app, httpAdapter } = createMockApp();

      OpenApiStudioModule.registerCatchAllRoute('/docs', app);

      expect(httpAdapter.get).toHaveBeenCalledTimes(1);
      expect(httpAdapter.get.mock.calls[0][0]).toBe('/docs/*');
    });

    it('should serve index.html with text/html content type', () => {
      const { app, httpAdapter } = createMockApp();
      mockedReadFileSync.mockReturnValue('<html>catch-all</html>');

      OpenApiStudioModule.registerCatchAllRoute('/docs', app);

      const handler = httpAdapter.get.mock.calls[0][1];
      const mockRes = { type: vi.fn(), send: vi.fn() };
      handler({}, mockRes);

      expect(mockRes.type).toHaveBeenCalledWith('text/html');
      expect(mockRes.send).toHaveBeenCalledWith('<html>catch-all</html>');
    });

    it('should include global prefix in catch-all pattern', () => {
      const { app, httpAdapter } = createMockApp({ globalPrefix: '/api' });

      OpenApiStudioModule.registerCatchAllRoute('/docs', app);

      expect(httpAdapter.get.mock.calls[0][0]).toBe('/api/docs/*');
    });

    it('should skip global prefix when useGlobalPrefix is false', () => {
      const { app, httpAdapter } = createMockApp({ globalPrefix: '/api' });

      OpenApiStudioModule.registerCatchAllRoute('/docs', app, {
        useGlobalPrefix: false,
      });

      expect(httpAdapter.get.mock.calls[0][0]).toBe('/docs/*');
    });

    it('should not register route when index.html is missing', () => {
      const { app, httpAdapter } = createMockApp();
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      OpenApiStudioModule.registerCatchAllRoute('/docs', app);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read index.html')
      );
      expect(httpAdapter.get).not.toHaveBeenCalled();
    });

    it('should read index.html from core dist path', () => {
      const { app } = createMockApp();

      OpenApiStudioModule.registerCatchAllRoute('/docs', app);

      expect(mockedReadFileSync).toHaveBeenCalledWith(
        path.join('/mock/core/dist', 'index.html'),
        'utf-8'
      );
    });
  });
});
