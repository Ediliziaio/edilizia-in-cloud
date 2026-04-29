import "@testing-library/jest-dom";

import.meta.env.VITE_SUPABASE_URL ??= "http://127.0.0.1:54321";
import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null as MediaQueryList["onchange"],
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
