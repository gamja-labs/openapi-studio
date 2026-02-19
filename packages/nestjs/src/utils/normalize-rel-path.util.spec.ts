import { normalizeRelPath } from './normalize-rel-path.util.js';

describe('normalizeRelPath', () => {
  it('should return "./" for empty string', () => {
    expect(normalizeRelPath('')).toBe('./');
  });

  it('should remove leading slash and add ./ prefix', () => {
    expect(normalizeRelPath('/api')).toBe('./api/');
  });

  it('should add ./ prefix to bare path', () => {
    expect(normalizeRelPath('api')).toBe('./api/');
  });

  it('should add trailing slash for directory-like paths (no dot)', () => {
    expect(normalizeRelPath('assets')).toBe('./assets/');
  });

  it('should not add trailing slash for file-like paths (has dot)', () => {
    expect(normalizeRelPath('index.html')).toBe('./index.html');
  });

  it('should preserve existing ./ prefix (dot triggers file-like detection)', () => {
    // ./docs contains a dot, so path.includes('.') is true → no trailing slash
    expect(normalizeRelPath('./docs')).toBe('./docs');
  });

  it('should preserve existing ../ prefix (dot triggers file-like detection)', () => {
    // ../docs contains a dot, so path.includes('.') is true → no trailing slash
    expect(normalizeRelPath('../docs')).toBe('../docs');
  });

  it('should handle path with leading slash and file extension', () => {
    expect(normalizeRelPath('/config.json')).toBe('./config.json');
  });

  it('should handle nested paths', () => {
    expect(normalizeRelPath('api/v1')).toBe('./api/v1/');
  });

  it('should handle path that already ends with slash', () => {
    expect(normalizeRelPath('api/')).toBe('./api/');
  });
});
