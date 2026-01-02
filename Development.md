## Setup
```
yarn install
yarn dlx @yarnpkg/sdks vscode
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
VITE_SERVICE_HOST=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_OPENAPI_SPEC_URL=http://localhost:3000/openapi.json
```

### Environment Variables Explained

- `VITE_SERVICE_HOST` - The base URL of your API backend (used for making API requests)
- `VITE_CLERK_PUBLISHABLE_KEY` - (Optional) Your Clerk publishable key for authentication. If not provided, authentication features will be disabled.
- `VITE_OPENAPI_SPEC_URL` - (Optional) Override the URL to the JSON OpenAPI spec. If not provided, defaults to `${VITE_SERVICE_HOST}/openapi.json`