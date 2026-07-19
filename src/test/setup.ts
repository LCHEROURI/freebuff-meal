import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship matchMedia or structuredClone by default.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) =>({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
