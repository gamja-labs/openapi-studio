/**
 * Validates that a global prefix is properly formatted
 */
export function validateGlobalPrefix(globalPrefix: string): boolean {
  if (!globalPrefix) {
    return false;
  }
  return globalPrefix.startsWith('/');
}
