/**
 * L'indice dell'editor del preventivo generico (10/10/2026): come scorre.
 *
 * Su computer la colonna dei campi ha la sua altezza e scorre da sola; l'indice le sta in cima. Con
 * `scrollIntoView` il browser scorre ANCHE la pagina per portare il riquadro in cima alla finestra, e l'indice
 * finisce sotto la barra: ora scorre solo il contenitore che scorre davvero. Dove nessuno scorre da solo
 * (telefono: scorre la pagina) si ricade su `scrollIntoView`, che tiene conto del margine `scroll-mt-16`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useVaiAlRiquadro } from "@/pages/azienda/settings/SettingsQuoteTemplates/useVaiAlRiquadro";

const scorriIntoView = vi.fn();
const scorriContenitore = vi.fn();
const stili = new Map<Element, Record<string, string>>();

function Prova({ senzaContenitore = false }: { senzaContenitore?: boolean }) {
  const { vai, evidenziato } = useVaiAlRiquadro();
  const corpo = (
    <>
      <button onClick={() => vai("riquadro")}>vai</button>
      <div id="riquadro" data-testid="riquadro" data-evidenziato={evidenziato === "riquadro" ? "si" : "no"}>riquadro</div>
    </>
  );
  return senzaContenitore ? <div>{corpo}</div> : <div data-testid="colonna">{corpo}</div>;
}

/** jsdom non disegna: si dice com'è fatto il contenitore (scorre da solo, è alto 300, il riquadro sta a 500 px, il margine è 64). */
function descriviLayout() {
  const veroGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const base = veroGetComputedStyle(el, pseudo);
    const mio = stili.get(el);
    return mio ? new Proxy(base, { get: (t, p: string | symbol) => (typeof p === "string" && p in mio ? mio[p] : Reflect.get(t, p)) }) : base;
  });
}
function renderizza(senzaContenitore = false) {
  const vista = render(<Prova senzaContenitore={senzaContenitore} />);
  const colonna = screen.queryByTestId("colonna");
  const riquadro = screen.getByTestId("riquadro");
  if (colonna) {
    stili.set(colonna, { overflowY: "auto" });
    Object.defineProperty(colonna, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(colonna, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(colonna, "scrollTop", { configurable: true, writable: true, value: 100 });
    colonna.getBoundingClientRect = () => ({ top: 200, bottom: 500, left: 0, right: 600, width: 600, height: 300, x: 0, y: 200, toJSON: () => ({}) });
    colonna.scrollTo = scorriContenitore as unknown as typeof colonna.scrollTo;
  }
  stili.set(riquadro, { scrollMarginTop: "64px" });
  riquadro.getBoundingClientRect = () => ({ top: 500, bottom: 700, left: 0, right: 600, width: 600, height: 200, x: 0, y: 500, toJSON: () => ({}) });
  return vista;
}

beforeEach(() => {
  scorriIntoView.mockReset();
  scorriContenitore.mockReset();
  stili.clear();
  Element.prototype.scrollIntoView = scorriIntoView;
  descriviLayout();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useVaiAlRiquadro", () => {
  it("se la colonna scorre da sola, scorre solo lei (la pagina resta ferma) e il riquadro si ferma sotto l'indice", () => {
    renderizza();
    fireEvent.click(screen.getByText("vai"));
    expect(scorriIntoView).not.toHaveBeenCalled();
    // top attuale 100 + (500 − 200) di distanza − 64 di margine
    expect(scorriContenitore).toHaveBeenCalledWith({ top: 336, behavior: "smooth" });
  });

  it("chi chiede meno movimento ottiene lo scatto, non lo scorrimento morbido", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: query.includes("reduce"), media: query } as unknown as MediaQueryList));
    renderizza();
    fireEvent.click(screen.getByText("vai"));
    expect(scorriContenitore).toHaveBeenCalledWith({ top: 336, behavior: "auto" });
  });

  it("se nessun contenitore scorre da solo (telefono) si ricade su scrollIntoView, che rispetta il margine del riquadro", () => {
    renderizza(true);
    fireEvent.click(screen.getByText("vai"));
    expect(scorriContenitore).not.toHaveBeenCalled();
    expect(scorriIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(scorriIntoView.mock.instances[0]).toBe(screen.getByTestId("riquadro"));
  });

  it("un contenitore che ha lo stile di scorrimento ma non scorre (contenuto più basso dell'altezza) non conta", () => {
    renderizza();
    Object.defineProperty(screen.getByTestId("colonna"), "scrollHeight", { configurable: true, value: 300 });
    fireEvent.click(screen.getByText("vai"));
    expect(scorriContenitore).not.toHaveBeenCalled();
    expect(scorriIntoView).toHaveBeenCalledOnce();
  });

  it("il riquadro si evidenzia e dopo due secondi e mezzo si spegne", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderizza();
    fireEvent.click(screen.getByText("vai"));
    expect(screen.getByTestId("riquadro")).toHaveAttribute("data-evidenziato", "si");
    await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    expect(screen.getByTestId("riquadro")).toHaveAttribute("data-evidenziato", "si");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByTestId("riquadro")).toHaveAttribute("data-evidenziato", "no");
  });

  it("un riquadro che non esiste non rompe niente (la ricerca, un indirizzo vecchio, un riquadro tolto)", () => {
    const { result } = renderHook(() => useVaiAlRiquadro());
    expect(() => act(() => { result.current.vai("non-esiste"); })).not.toThrow();
    expect(scorriIntoView).not.toHaveBeenCalled();
    expect(scorriContenitore).not.toHaveBeenCalled();
    expect(result.current.evidenziato).toBe("non-esiste");
  });

  it("toccando di nuovo mentre è acceso, il conto dei due secondi e mezzo riparte", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderizza();
    fireEvent.click(screen.getByText("vai"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    fireEvent.click(screen.getByText("vai"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByTestId("riquadro")).toHaveAttribute("data-evidenziato", "si");
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(screen.getByTestId("riquadro")).toHaveAttribute("data-evidenziato", "no");
  });
});
