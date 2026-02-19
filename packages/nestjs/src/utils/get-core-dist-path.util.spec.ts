import * as path from 'path';
import { getCoreDistAbsoluteFSPath } from './get-core-dist-path.util.js';

vi.mock('module', () => {
  const mockResolve = vi.fn();
  return {
    createRequire: vi.fn(() => ({
      resolve: mockResolve,
    })),
    __mockResolve: mockResolve,
  };
});

describe('getCoreDistAbsoluteFSPath', () => {
  let mockResolve: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const moduleMock = await import('module');
    mockResolve = (moduleMock as any).__mockResolve;
    mockResolve.mockReset();
  });

  it('should return the dist directory of @openapi-studio/core', () => {
    const fakePkgPath = path.join('/fake', 'node_modules', '@openapi-studio', 'core', 'package.json');
    mockResolve.mockReturnValue(fakePkgPath);

    const result = getCoreDistAbsoluteFSPath();

    expect(mockResolve).toHaveBeenCalledWith('@openapi-studio/core/package.json');
    expect(result).toBe(path.join('/fake', 'node_modules', '@openapi-studio', 'core', 'dist'));
  });

  it('should throw a descriptive error when package cannot be resolved', () => {
    mockResolve.mockImplementation(() => {
      throw new Error('Cannot find module');
    });

    expect(() => getCoreDistAbsoluteFSPath()).toThrow('Failed to resolve @openapi-studio/core package path');
    expect(() => getCoreDistAbsoluteFSPath()).toThrow('Cannot find module');
  });

  it('should handle non-Error thrown values', () => {
    mockResolve.mockImplementation(() => {
      throw 'string error';
    });

    expect(() => getCoreDistAbsoluteFSPath()).toThrow('Failed to resolve @openapi-studio/core package path');
    expect(() => getCoreDistAbsoluteFSPath()).toThrow('string error');
  });
});
