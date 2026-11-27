/**
 * La ricerca della tendina accetta lo spazio (27/11/2026).
 *
 * Provato nel browser sulla commessa demo: scrivendo «SIM RG Esc» nella tendina dei
 * mezzi arrivavano solo «SIM», poi lo spazio finiva alla lista, che sceglieva la voce
 * evidenziata e chiudeva la tendina. Con nomi come «SIM RG Escavatore 16qli» o
 * «FORD TRANSIT» la ricerca non serviva a niente.
 */
import { describe, expect, it } from "vitest";
import { tastoVaNellaRicerca } from "@/components/ui/select";

const tasto = (key: string, mod: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mod }) as KeyboardEvent;

describe("il campo «Cerca…» della tendina", () => {
  it("prende le lettere, con o senza ricerca già scritta", () => {
    expect(tastoVaNellaRicerca(tasto("S"), "")).toBe(true);
    expect(tastoVaNellaRicerca(tasto("c"), "SIM")).toBe(true);
    expect(tastoVaNellaRicerca(tasto("3"), "SIM")).toBe(true);
  });

  it("prende lo spazio quando la ricerca è cominciata: «SIM RG Escavatore» si scrive tutto", () => {
    expect(tastoVaNellaRicerca(tasto(" "), "SIM")).toBe(true);
    let ricerca = "";
    for (const k of "SIM RG Esc") {
      if (tastoVaNellaRicerca(tasto(k), ricerca)) ricerca += k;
    }
    expect(ricerca).toBe("SIM RG Esc");
  });

  it("a ricerca vuota lo spazio resta della lista, dove sceglie la voce", () => {
    expect(tastoVaNellaRicerca(tasto(" "), "")).toBe(false);
  });

  it("le scorciatoie e i tasti di spostamento non si scrivono", () => {
    expect(tastoVaNellaRicerca(tasto("ArrowDown"), "SIM")).toBe(false);
    expect(tastoVaNellaRicerca(tasto("Enter"), "SIM")).toBe(false);
    expect(tastoVaNellaRicerca(tasto("Backspace"), "SIM")).toBe(false);
    expect(tastoVaNellaRicerca(tasto("a", { metaKey: true }), "SIM")).toBe(false);
    expect(tastoVaNellaRicerca(tasto("c", { ctrlKey: true }), "SIM")).toBe(false);
  });
});
