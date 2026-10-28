import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderViewTransition } from "@/components/orders/OrderViewTransition";

const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("Transizioni delle viste della commessa", () => {
  it("usa una dissolvenza unica, senza spostamenti o animazioni dell’altezza", () => {
    const { rerender, unmount } = render(
      <OrderViewTransition viewKey="lavorazioni">
        Lavorazioni
      </OrderViewTransition>,
    );
    expect(animate).toHaveBeenCalledWith([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
    rerender(
      <OrderViewTransition viewKey="lavorazioni">
        Dati aggiornati
      </OrderViewTransition>,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    rerender(
      <OrderViewTransition viewKey="ufficio">Ufficio</OrderViewTransition>,
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("non rimonta i componenti e non cancella i valori al cambio di vista", () => {
    const { rerender } = render(
      <OrderViewTransition viewKey="uno">
        <input aria-label="Note" defaultValue="" />
      </OrderViewTransition>,
    );
    const input = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(input, { target: { value: "Da conservare" } });
    rerender(
      <OrderViewTransition viewKey="due">
        <input aria-label="Note" defaultValue="" />
      </OrderViewTransition>,
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toBe(input);
    expect(input).toHaveValue("Da conservare");
  });

  it("rispetta la preferenza di movimento ridotto", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(
      <OrderViewTransition viewKey="panoramica">Contenuto</OrderViewTransition>,
    );
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByText("Contenuto")).toBeVisible();
  });

  it("funziona anche senza Web Animations", () => {
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: undefined,
    });
    render(
      <OrderViewTransition viewKey="panoramica">Contenuto</OrderViewTransition>,
    );
    expect(screen.getByText("Contenuto")).toBeVisible();
  });

  it("sovrascrive l’effetto standard solo in questa commessa e uniforma i due livelli di navigazione", () => {
    const css = readFileSync(
      "src/components/orders/order-view-transition.css",
      "utf8",
    );
    expect(css).toContain(
      '#order-detail-overview .order-detail-tab-panel[data-state="active"]',
    );
    expect(css).toContain("animation: none");
    expect(css).toContain("transition-duration: 180ms");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
