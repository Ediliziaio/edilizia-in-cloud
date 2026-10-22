import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import CommessaFlowSection from "@/components/landing/SolutionSection";

let host: HTMLDivElement;
let root: Root;
function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter><CommessaFlowSection /></MemoryRouter>));
}
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); });

describe("Dal preventivo al margine", () => {
  it("lets the visitor explore all six steps and follows the selected feature", () => {
    mount();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(buttons).toHaveLength(6);
    const region = host.querySelector("#commessa-flow-detail")!;
    for (const button of buttons) {
      act(() => button.click());
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(host.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
      expect(region.getAttribute("aria-labelledby")).toBe(button.id);
      expect(region.querySelector("a")?.getAttribute("href")).toMatch(/^\/funzionalita\/.+\/$/);
    }
    expect(region.textContent).toContain("5.500 € · 27,5%");
    expect(region.textContent).toContain("Non è un risultato garantito");
  });

  it("distinguishes unpriced deliveries, costs, payments and the projected margin", () => {
    mount();
    const buttons = host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]");
    act(() => buttons[3].click());
    expect(host.querySelector("#commessa-flow-detail")?.textContent).toContain("non trattati come zero");
    act(() => buttons[4].click());
    expect(host.querySelector("#commessa-flow-detail")?.textContent).toContain("non si sommano una seconda volta");
    expect(host.textContent).toContain("Dati ipotetici · importi al netto dell’IVA");
    expect(host.textContent).toContain("3.500 € manodopera + 2.500 € materiali");
    expect(host.textContent).toContain("8.500 €");
    expect(host.textContent).toContain("5.500 €");
    expect(host.textContent).toContain("Il margine previsto non è denaro disponibile in banca");
  });
});
