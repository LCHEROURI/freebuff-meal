import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyTheme } from '../src/hooks/useTheme';

describe('useTheme / applyTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('applies dark class and data-theme when mode is dark', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes dark class when mode is light', () => {
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves system theme matching prefers-color-scheme', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    matchMediaSpy.mockRestore();
  });
});
