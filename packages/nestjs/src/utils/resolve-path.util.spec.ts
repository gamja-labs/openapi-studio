import * as path from 'path';
import { resolvePath } from './resolve-path.util.js';

describe('resolvePath', () => {
  it('should return absolute paths as-is', () => {
    const absPath = path.resolve('/usr/local/static');
    expect(resolvePath(absPath)).toBe(absPath);
  });

  it('should resolve relative paths against cwd', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');

    const result = resolvePath('relative/path');
    expect(result).toBe(path.resolve('/mock/cwd', 'relative/path'));

    cwdSpy.mockRestore();
  });

  it('should resolve dot-relative paths against cwd', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');

    const result = resolvePath('./relative/path');
    expect(result).toBe(path.resolve('/mock/cwd', './relative/path'));

    cwdSpy.mockRestore();
  });

  it('should throw for empty string', () => {
    expect(() => resolvePath('')).toThrow('Custom path must be a non-empty string');
  });

  it('should throw for whitespace-only string', () => {
    expect(() => resolvePath('   ')).toThrow('Custom path must be a non-empty string');
  });

  it('should throw for non-string input', () => {
    expect(() => resolvePath(123 as any)).toThrow('Custom path must be a non-empty string');
  });

  it('should throw for null', () => {
    expect(() => resolvePath(null as any)).toThrow('Custom path must be a non-empty string');
  });
});
