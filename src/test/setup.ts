import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { svuotaTutteLeMemorie } from "@/lib/memorieDaSvuotare";

import.meta.env.VITE_SUPABASE_URL ??= "http://127.0.0.1:54321";
import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testStorage = (() => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
})();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
});

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

// Le memorie del PDF vero (link firmati, immagini, miniature, archivio): ogni test parte senza (07/11/2026).
beforeEach(() => { svuotaTutteLeMemorie(); });

// Nell'app il pannello di destra dei preventivatori mostra di serie il PDF vero (07/11/2026). jsdom non sa
// disegnare un PDF: le prove partono dall'anteprima veloce, che è quella che controllano. Chi prova la scelta
// di serie lo toglie (guscioPdfVeroDiSerie.test.tsx).
(globalThis as typeof globalThis & { __anteprimaDiSerie?: string }).__anteprimaDiSerie = "veloce";
