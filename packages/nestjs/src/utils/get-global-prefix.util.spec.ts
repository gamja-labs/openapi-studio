import { getGlobalPrefix } from './get-global-prefix.util.js';

describe('getGlobalPrefix', () => {
  it('should return the global prefix from app config', () => {
    const app = {
      config: {
        getGlobalPrefix: vi.fn().mockReturnValue('/api'),
      },
    } as any;

    expect(getGlobalPrefix(app)).toBe('/api');
  });

  it('should return empty string when getGlobalPrefix returns empty', () => {
    const app = {
      config: {
        getGlobalPrefix: vi.fn().mockReturnValue(''),
      },
    } as any;

    expect(getGlobalPrefix(app)).toBe('');
  });

  it('should return empty string when getGlobalPrefix returns null', () => {
    const app = {
      config: {
        getGlobalPrefix: vi.fn().mockReturnValue(null),
      },
    } as any;

    expect(getGlobalPrefix(app)).toBe('');
  });

  it('should return empty string when config is undefined', () => {
    const app = {} as any;

    expect(getGlobalPrefix(app)).toBe('');
  });

  it('should return empty string when config has no getGlobalPrefix', () => {
    const app = {
      config: {},
    } as any;

    expect(getGlobalPrefix(app)).toBe('');
  });
});
