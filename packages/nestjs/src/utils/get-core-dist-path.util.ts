import * as path from 'path';
import { createRequire } from 'module';

/**
 * Gets the absolute filesystem path to the @openapi-studio/core dist directory
 * Uses require.resolve to find the package location
 */
export function getCoreDistAbsoluteFSPath(): string {
    try {
        // Use createRequire to get require in ES module context
        const require = createRequire(import.meta.url);
        
        // Resolve the @openapi-studio/core package
        const corePackagePath = require.resolve('@openapi-studio/core/package.json');
        
        // Get the directory containing package.json
        const corePackageDir = path.dirname(corePackagePath);
        
        // Return the dist directory path
        return path.join(corePackageDir, 'dist');
    } catch (error) {
        throw new Error(
            `Failed to resolve @openapi-studio/core package path. ` +
            `Make sure @openapi-studio/core is installed. Error: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
