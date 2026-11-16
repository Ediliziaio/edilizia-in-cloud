import { describe, expect, it } from "vitest";
import { voceCosto } from "@/lib/costi/voceCosto";
import { buildCategoryDistribution } from "@/lib/costsUtils";
import { TIPI_FORNITORE } from "@/lib/fornitori/tipiFornitore";

describe("voce di un costo (15/11/2026)", () => {
  it("riunisce i modi diversi di scrivere la stessa spesa", () => {
    expect(voceCosto("stipendi")).toBe("Personale");
    expect(voceCosto("Personale")).toBe("Personale");
    expect(voceCosto("subappalti")).toBe("Squadre esterne");
    expect(voceCosto("trasporti_noleggi")).toBe("Veicoli, mezzi e noleggi");
    expect(voceCosto("assicurazioni")).toBe("Assicurazioni");
    expect(voceCosto("costi_vari")).toBe("Costi vari");
    expect(voceCosto(null)).toBe("Altro");
  });
  // 16/11/2026 — da quando la categoria del costo viene dal tipo del fornitore
  // (migrazione 20290417160000) queste otto stringhe arrivano in Panoramica per davvero.
  it("ognuna delle otto famiglie del fornitore ha la sua voce", () => {
    const atteso: Record<(typeof TIPI_FORNITORE)[number], string> = {
      materiali: "Materiali & fornitori",
      subappalto: "Squadre esterne",
      noli_servizi: "Noli e servizi di cantiere",
      professionisti: "Professionisti e tecnici",
      mezzi: "Veicoli, mezzi e noleggi",
      agenti: "Provvigioni",
      generali: "Spese generali",
      finanza_enti: "Banche, assicurazioni ed enti",
    };
    for (const tipo of TIPI_FORNITORE) expect(voceCosto(tipo)).toBe(atteso[tipo]);
    // Una famiglia nuova senza voce uscirebbe con l'etichetta ripulita: qui si vedrebbe.
    expect(Object.keys(atteso).sort()).toEqual([...TIPI_FORNITORE].sort());
  });

  it("«agenti» e «provvigioni» sono la stessa voce, non due", () => {
    expect(voceCosto("agenti")).toBe(voceCosto("provvigioni"));
  });

  // Le categorie dell'AI delle fatture non restano voci a sé quando hanno una famiglia ovvia.
  it("le categorie dell'AI si uniscono alla famiglia giusta", () => {
    expect(voceCosto("consulenze_professionali")).toBe("Professionisti e tecnici");
    expect(voceCosto("carburanti")).toBe("Veicoli, mezzi e noleggi");
    expect(voceCosto("servizi_generali")).toBe("Spese generali");
    expect(voceCosto("trasporti")).toBe("Noli e servizi di cantiere");
  });

  it("nella distribuzione per categoria un solo «Altro»", () => {
    const righe = ["a", "b", "c", "d", "e", "f", "g", "h", null].map((category, i) => ({ category, amount: 100 - i }));
    const d = buildCategoryDistribution(righe);
    expect(d.filter((x) => x.name === "Altro")).toHaveLength(1);
    expect(d.reduce((s, x) => s + x.value, 0)).toBe(righe.reduce((s, r) => s + r.amount, 0));
  });
});
