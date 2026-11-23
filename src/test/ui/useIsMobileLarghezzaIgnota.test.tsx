/**
 * La larghezza che non si sa ancora non è un telefono (23/11/2026).
 *
 * `window.innerWidth` vale 0 finché la finestra non è stata misurata: scheda
 * aperta in secondo piano, finestra che si sta aprendo, pagina ripresa dalla
 * cache del browser. Partendo da «telefono», le pagine che scelgono il layout
 * con `useIsMobile` si disegnavano prima in versione stretta e poi in versione
 * computer: in Fatture ricevute si vedeva per un attimo la testata blu al posto
 * dei sei numeri, e la barra laterale lampeggiava in ogni pagina dell'azienda.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSchermoStretto } from "@/hooks/useSchermoStretto";

const larghezza = (w: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
};

afterEach(() => { cleanup(); larghezza(1024); });

describe("useIsMobile", () => {
  it("larghezza non ancora nota (0): si parte da computer, non da telefono", () => {
    larghezza(0);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("partito senza larghezza, quando quella vera arriva ed è da telefono passa a telefono", () => {
    larghezza(0);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => { larghezza(390); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(true);
  });

  it("finestra larga: computer; finestra stretta: telefono", () => {
    larghezza(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => { larghezza(500); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(true);
    act(() => { larghezza(1200); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(false);
  });

  it("la soglia passata vale ancora: gli elenchi includono i tablet", () => {
    larghezza(900);
    const { result } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(true);
    act(() => { larghezza(1440); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(false);
  });
});

describe("useSchermoStretto", () => {
  it("larghezza non ancora nota: non è uno schermo stretto", () => {
    larghezza(0);
    const { result } = renderHook(() => useSchermoStretto());
    expect(result.current).toBe(false);
  });

  it("sotto i 1024 px è stretto, sopra no", () => {
    larghezza(800);
    const { result } = renderHook(() => useSchermoStretto());
    expect(result.current).toBe(true);
    act(() => { larghezza(1280); window.dispatchEvent(new Event("resize")); });
    expect(result.current).toBe(false);
  });
});
