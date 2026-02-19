import type { INestApplication } from '@nestjs/common';

/**
 * Gets the global prefix from the NestJS application
 */
export function getGlobalPrefix(app: INestApplication): string {
  const config = (app as any).config;
  if (config && config.getGlobalPrefix) {
    return config.getGlobalPrefix() || '';
  }
  return '';
}
