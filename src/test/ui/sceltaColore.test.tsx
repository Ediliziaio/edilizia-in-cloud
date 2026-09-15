/**
 * Colore interno ed esterno nel preventivo serramenti: la stessa tendina delle
 * varianti, con i colori del listino divisi per fascia e il colore scritto a
 * mano. Prima era il suggeritore del browser, grigio e senza fasce.
 */
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SceltaColore } from "@/components/serramenti/SceltaColore";

const gruppi = [
  { titolo: "Colore", voci: ["Bianco"] },
  { titolo: "Colore Standard", voci: ["51 - Golden Oak (rovere dorato)", "21 - Nussbaum (noce)"] },
  { titolo: "Colore Fuori Standard", voci: ["97 - mattGrey_cleanCOOL (grigio opaco)"] },
];

beforeAll(() => {
  // cmdk e Radix misurano e scorrono gli elementi: jsdom non lo sa fare.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

afterEach(() => cleanup());

const apri = () => fireEvent.click(screen.getByRole("button", { name: "Colore interno" }));

describe("SceltaColore", () => {
  it("mostra i colori del listino divisi per fascia e sceglie quello cliccato", () => {
    const onChange = vi.fn();
    render(<SceltaColore value={null} onChange={onChange} gruppi={gruppi} placeholder="Bianco" aria-label="Colore interno" />);
    apri();

    expect(screen.getByText("Colore Standard")).toBeTruthy();
    expect(screen.getByText("Colore Fuori Standard")).toBeTruthy();
    fireEvent.click(screen.getByText("21 - Nussbaum (noce)"));
    expect(onChange).toHaveBeenCalledWith("21 - Nussbaum (noce)");
  });

  it("un colore che il listino non ha si scrive a mano", () => {
    const onChange = vi.fn();
    render(<SceltaColore value={null} onChange={onChange} gruppi={gruppi} aria-label="Colore interno" />);
    apri();

    fireEvent.change(screen.getByPlaceholderText("Cerca o scrivi un colore…"), { target: { value: "Verde RAL 6005" } });
    fireEvent.click(screen.getByText("Usa «Verde RAL 6005»"));
    expect(onChange).toHaveBeenCalledWith("Verde RAL 6005");
  });

  it("il colore scritto sulla riga si toglie, e torna quello della variante", () => {
    const onChange = vi.fn();
    render(<SceltaColore value="21 - Nussbaum (noce)" onChange={onChange} gruppi={gruppi} aria-label="Colore interno" />);
    apri();

    fireEvent.click(screen.getByText("Togli il colore scritto"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
