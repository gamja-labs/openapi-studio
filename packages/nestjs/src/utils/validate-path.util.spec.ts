import { validatePath } from './validate-path.util.js';

describe('validatePath', () => {
  it('should return root path as-is', () => {
    expect(validatePath('/')).toBe('/');
  });

  it('should add leading slash when missing', () => {
    expect(validatePath('api')).toBe('/api');
  });

  it('should keep existing leading slash', () => {
    expect(validatePath('/api')).toBe('/api');
  });

  it('should remove trailing slash', () => {
    expect(validatePath('/api/')).toBe('/api');
  });

  it('should add leading slash and remove trailing slash', () => {
    expect(validatePath('api/')).toBe('/api');
  });

  it('should handle nested paths', () => {
    expect(validatePath('/api/v1/docs')).toBe('/api/v1/docs');
  });

  it('should handle nested paths with trailing slash', () => {
    expect(validatePath('/api/v1/docs/')).toBe('/api/v1/docs');
  });

  it('should not remove trailing slash from root path', () => {
    expect(validatePath('/')).toBe('/');
  });

  it('should throw if path is not a string', () => {
    expect(() => validatePath(123 as any)).toThrow('Path must be a string');
  });

  it('should throw if path is null', () => {
    expect(() => validatePath(null as any)).toThrow('Path must be a string');
  });

  it('should throw if path is undefined', () => {
    expect(() => validatePath(undefined as any)).toThrow('Path must be a string');
  });
});
