import { validateGlobalPrefix } from './validate-global-prefix.util.js';

describe('validateGlobalPrefix', () => {
  it('should return true for prefix starting with /', () => {
    expect(validateGlobalPrefix('/api')).toBe(true);
  });

  it('should return true for root prefix /', () => {
    expect(validateGlobalPrefix('/')).toBe(true);
  });

  it('should return false for prefix not starting with /', () => {
    expect(validateGlobalPrefix('api')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(validateGlobalPrefix('')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(validateGlobalPrefix(null as any)).toBe(false);
    expect(validateGlobalPrefix(undefined as any)).toBe(false);
  });

  it('should return true for nested prefix', () => {
    expect(validateGlobalPrefix('/api/v1')).toBe(true);
  });
});
