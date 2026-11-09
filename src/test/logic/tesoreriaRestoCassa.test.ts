// Tesoreria (09/11/2026): la prova vera è sul database, qui la forma e il conto del credito.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { creditoCliente, residuoDaIncassare } from "@/lib/fatturazione/incassi";

const sql = readFileSync("supabase/migrations/20290203100000_tesoreria_resto_bonifici_e_cassa_ricevute.sql", "utf8");

describe("credito del cliente dopo una nota di credito", () => {
  it("fattura incassata e poi stornata in parte: credito pari allo storno", () => {
    const d = { totale_da_pagare: 1220, importo_pagato: 1220, stornato: 122 };
    expect(creditoCliente(d)).toBe(122);
    expect(residuoDaIncassare(d)).toBe(-122);
  });
  it("nessun credito finché resta da incassare", () => {
    expect(creditoCliente({ totale_da_pagare: 1220, importo_pagato: 500, stornato: 122 })).toBe(0);
  });
});

describe("tesoreria", () => {
  it("un accredito con resto non si chiude e resta abbinabile", () => {
    expect(sql).toContain("v_parziale := abs(t.amount) - v_importo > 0.01");
    expect(sql).toContain("matched_at, matched_by, notes, ripartita");
  });
  it("segnare pagata scrive la cassa, e togliere il segno la storna", () => {
    expect(sql).toContain("public.registra_pagamento_costo(v_costo, pg_catalog.gen_random_uuid()");
    expect(sql).toContain("public.storna_pagamenti_costo(v_costo, current_date)");
  });
  it("l'addebito della banca aggancia il pagamento già registrato e chiude i costi senza cassa", () => {
    expect(sql).toContain("if p_banca is null and ((c.is_paid and pagato=0)");
    expect(sql).toContain("v_esistente uuid := p_esistente");
  });
});
