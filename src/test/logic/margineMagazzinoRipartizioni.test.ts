import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateCompanyStructureSnapshot,
  quotaNonRipartita,
} from "@/lib/controlloGestione/strutturaCommessa";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20281019360000_margine_magazzino_ripartizioni.sql"),
  "utf8",
);

describe("Margine di commessa: magazzino coperto, ripartizioni, semaforo, quantità intere", () => {
  it("toglie dal costo dell'ODA il materiale rientrato in magazzino, in proporzione", () => {
    expect(migration).toMatch(/- k\.valore_oda \* LEAST\(1::numeric, k\.rientrato \/ NULLIF\(GREATEST\(k\.scaricato, k\.coperta, k\.rientrato\)/);
    // la quota spostata tra le fasi resta della commessa
    expect(migration).toMatch(/LIKE 'Divisione tra le fasi:%'/);
    expect(migration).toMatch(/AS costo_acquisti/);
  });

  it("non ripete lo scarico della merce di un ODA caricata senza riga", () => {
    expect(migration).toMatch(/AS da_oda/);
    expect(migration).toMatch(/LEAST\(u\.da_oda, u\.netto\)/);
  });

  it("conta la ripartizione tra commesse e lascia fuori i costi che pagano una squadra", () => {
    expect(migration).toMatch(/jsonb_array_elements\(cc_1\.allocations\)/);
    expect(migration).toMatch(/order_external_team_id IS NULL/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS order_external_team_id uuid/);
  });

  it("valuta il semaforo su tutte le voci, anche magazzino e km, a ogni movimento", () => {
    expect(migration).toMatch(/'materiali di magazzino', +coalesce\(m\.costo_materiali_magazzino, 0\)/);
    expect(migration).toMatch(/'rimborsi chilometrici', +coalesce\(m\.costo_rimborsi_km, 0\)/);
    for (const tabella of ["warehouse_movements", "hr_rimborsi_km"]) {
      for (const op of ["INSERT", "UPDATE", "DELETE"]) {
        expect(migration).toMatch(new RegExp(`AFTER ${op} ON public\\.${tabella}\\s+REFERENCING[^;]*FOR EACH STATEMENT`));
      }
    }
  });

  it("rifiuta le quantità con decimali prima di muovere il magazzino", () => {
    expect(migration).toMatch(/if v_delta <> trunc\(v_delta\) then/);
    expect(migration).toMatch(/coalesce\(p_quantita, 0\) <> trunc\(coalesce\(p_quantita, 0\)\)/);
  });
});

describe("quotaNonRipartita", () => {
  it("lascia alla struttura solo la parte non ripartita sulle commesse", () => {
    expect(quotaNonRipartita(1000, [])).toBe(1000);
    expect(quotaNonRipartita(1000, null)).toBe(1000);
    expect(quotaNonRipartita(1000, [{ order_id: "a", pct: 60 }, { order_id: "b", pct: 40 }])).toBe(0);
    expect(quotaNonRipartita(1000, [{ order_id: "a", pct: 25 }])).toBe(750);
    expect(quotaNonRipartita("1000", [{ order_id: "a", pct: 150 }])).toBe(0);
  });

  it("la struttura aziendale non ripete i costi ripartiti", () => {
    const snap = calculateCompanyStructureSnapshot({
      fixedCosts: [
        { amount: 1000, recurrence: "monthly", allocations: [{ order_id: "a", pct: 100 }] },
        { amount: 500, recurrence: "monthly", allocations: [] },
      ],
      employees: [],
      operationalEmployeeIds: [],
      orders: [],
      today: "2026-10-19",
      parametri: undefined,
    } as Parameters<typeof calculateCompanyStructureSnapshot>[0]);
    expect(snap.fixedCostsMonthly).toBe(500);
  });
});
