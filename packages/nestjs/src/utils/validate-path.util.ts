/**
 * Validates and normalizes a path string
 */
export function validatePath(path: string): string {
  if (typeof path !== 'string') {
    throw new Error('Path must be a string');
  }

  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  // Remove trailing slash except for root
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
}
