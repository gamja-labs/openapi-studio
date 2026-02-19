/**
 * Normalizes a relative path for use in URLs
 */
export function normalizeRelPath(path: string): string {
  if (!path) {
    return './';
  }

  // Remove leading slash if present
  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  // Ensure it ends with / if it's a directory
  if (!path.endsWith('/') && !path.includes('.')) {
    path = `${path}/`;
  }

  // Add ./ prefix for relative paths
  if (!path.startsWith('./') && !path.startsWith('../')) {
    path = `./${path}`;
  }

  return path;
}
