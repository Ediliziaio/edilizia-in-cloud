import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateOrderEconomics } from "@/lib/orders/economics";
import { buildExternalTeamCosts } from "@/lib/costsUtils";
import { externalLaborNet } from "@/lib/orders/laborEconomics";

// Le ditte esterne lavorano in reverse charge: un'IVA vuota vale 0 dappertutto. Prima la vista del margine,
// il conto economico e la pagina Costi toglievano il 22%, la scheda Lavorazioni no: la stessa ditta dava
// due costi diversi. Il database ora rifiuta l'IVA vuota (order_external_teams.vat_rate NOT NULL DEFAULT 0);
// qui si tiene fermo il codice, perché una ripresa del «?? 22» rifarebbe i due conti.
describe("IVA delle ditte esterne: un solo valore quando manca", () => {
  it("il conto economico e la pagina Costi contano 0, non 22", () => {
    const econ = calculateOrderEconomics({ totalAmount: 1000, items: [], employees: [], salespeople: [], errors: [],
      teams: [{ total_cost: 500, vat_rate: null }] });
    expect(econ.laborNet).toBe(500);
    const [costo] = buildExternalTeamCosts([{ id: "t", total_cost: 500, vat_rate: null }]);
    expect(costo.amount).toBe(500);
    expect(costo.vat_rate).toBe(0);
  });

  it("il riepilogo Manodopera conta 0, non 22", () => {
    expect(externalLaborNet({ id: "t", cost_preventivo: 0, total_cost: 500, vat_rate: null, team: null })).toBe(500);
    expect(readFileSync("src/lib/orders/laborEconomics.ts", "utf8")).not.toMatch(/vat_rate\s*==\s*null\s*\?\s*22/);
  });

  it("con l'IVA scritta si toglie quella", () => {
    const [costo] = buildExternalTeamCosts([{ id: "t", total_cost: 122, vat_rate: 22 }]);
    expect(costo.amount).toBe(100);
  });

  // Per ogni file, il nome con cui chiama la riga della ditta.
  it.each([
    ["src/lib/orders/economics.ts", "t"],
    ["src/lib/costsUtils.ts", "item"],
    ["src/hooks/useBreakEvenHistorical.ts", "team"],
    ["src/components/orders/DitteContrattiCommessa.tsx", "ditta"],
  ])("%s non riprende il 22%% per le ditte", (file, nome) => {
    const src = readFileSync(file, "utf8");
    const ditta = new RegExp(`\\b${nome}\\??\\.vat_rate\\s*\\?\\?\\s*(\\d+)`, "g");
    const valori = [...src.matchAll(ditta)].map((m) => m[1]);
    expect(valori.length).toBeGreaterThan(0);
    expect(valori.filter((v) => v !== "0")).toEqual([]);
  });
});
