import * as path from 'path';

/**
 * Resolves a custom path to an absolute filesystem path
 * @param customPath - The custom path to resolve (can be relative or absolute)
 * @returns The absolute filesystem path
 */
export function resolvePath(customPath: string): string {
    if (typeof customPath !== 'string' || !customPath.trim()) {
        throw new Error('Custom path must be a non-empty string');
    }

    // If it's already an absolute path, return it as-is
    if (path.isAbsolute(customPath)) {
        return customPath;
    }

    // Otherwise, resolve it relative to the current working directory
    return path.resolve(process.cwd(), customPath);
}
