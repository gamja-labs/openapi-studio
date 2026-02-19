# OpenAPI Studio

A modern, interactive OpenAPI testing and exploration tool built with Vue, TypeScript, and Electron. OpenAPI Studio allows you to load, explore, and test any OpenAPI 3.0 specification with an intuitive interface.

![Screenshot](/screenshot.png)

## Features

- 📋 **Endpoint Explorer** - Browse all endpoints organized by path and method
- 🧪 **API Testing** - Test endpoints with customizable requests, parameters, and body
- 🔐 **Clerk** - Integrated Clerk authentication with bearer token support
- 📊 **Schema Viewer** - Explore request/response schemas with detailed type information
- 💡 **Example Generation** - Auto-generate example requests from OpenAPI schemas
- 📝 **Request History** - Track and review your API test history

## Installation & Setup for NestJS

### Prerequisites

- NestJS application (v11+)
- `@nestjs/swagger` package installed
- Express or Fastify adapter

### Step 1: Install the Package

```bash
npm install @openapi-studio/nestjs
# or
yarn add @openapi-studio/nestjs
# or
pnpm add @openapi-studio/nestjs
```

### Step 2: Setup in Your NestJS Application

In your `main.ts` file, import and configure OpenAPI Studio:

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { OpenApiStudioModule } from '@openapi-studio/nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Create your OpenAPI document
  const config = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('API Description')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);

  // Setup OpenAPI Studio
  OpenApiStudioModule.setup('/api-docs', app, document, {
    serviceHost: 'http://localhost:3000', // Optional: Your API base URL
    clerkPublishableKey: 'pk_test_...',    // Optional: Clerk publishable key
  });

  await app.listen(3000);
}
bootstrap();
```

### Step 3: Navigate to interface in browser

After setup, navigate to the path you configured (e.g., `http://localhost:3000/api-docs`) to access the OpenAPI Studio interface.


## Config

The `OpenApiStudioModule.setup()` method accepts the following options:

```typescript
interface OpenApiStudioOptions {
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
```