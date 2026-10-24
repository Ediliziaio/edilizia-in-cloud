import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildForecastLedger, emptyForecastSources } from "@/lib/finance/forecastLedger";

/**
 * Nota di credito PARZIALE (più piccola della fattura): non storna, ma riduce
 * il dovuto. Deve abbassare il residuo ovunque, e non comparire come rimborso
 * in uscita. Prima lo faceva solo il motore dei solleciti.
 */
describe("previsionale: nota di credito parziale collegata", () => {
  it("riduce il dovuto della fattura e non è un'uscita a sé", () => {
    const s = emptyForecastSources();
    s.invoices = [
      { id: "f", total: 1000, paid_amount: 0, due_date: "2026-11-10", status: "issued", document_type: "invoice" },
      { id: "nc", total: 300, paid_amount: 0, due_date: "2026-11-10", status: "issued", document_type: "credit_note", credited_invoice_id: "f" },
    ];
    const { movements } = buildForecastLedger(s, "2026-10-24");
    const fattura = movements.find((m) => m.id === "fattura:f");
    // 1000 − 300 = 700
    expect(fattura?.cents).toBe(70000);
    expect(fattura?.direction).toBe("in");
    // La nota collegata non produce un'uscita/rimborso.
    expect(movements.some((m) => m.id === "fattura:nc")).toBe(false);
  });

  it("sulla scadenza della fattura toglie l'importo della nota collegata", () => {
    const s = emptyForecastSources();
    s.invoices = [
      { id: "f", total: 1000, paid_amount: 0, due_date: "2026-11-10", status: "issued", document_type: "invoice" },
      { id: "nc", total: 300, paid_amount: 0, due_date: "2026-11-10", status: "issued", document_type: "credit_note", credited_invoice_id: "f" },
    ];
    s.deadlines = [
      { id: "sf", description: "Fattura", amount: 1000, paid_amount: 0, due_date: "2026-11-10", direction: "entrata", status: "da_pagare", invoice_id: "f" },
      { id: "snc", description: "Nota", amount: 300, paid_amount: 0, due_date: "2026-11-10", direction: "uscita", status: "da_pagare", invoice_id: "nc" },
    ];
    const { movements } = buildForecastLedger(s, "2026-10-24");
    const scad = movements.find((m) => m.id === "scadenza:sf");
    expect(scad?.cents).toBe(70000);
    // La scadenza della nota collegata non è un'uscita.
    expect(movements.some((m) => m.id === "scadenza:snc")).toBe(false);
  });
});

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("note_credito_parziali_riducono_il_dovuto"));
if (!nome) throw new Error("migrazione note_credito_parziali_riducono_il_dovuto non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("migrazione: residuo al netto delle note collegate", () => {
  it("c'è la funzione che somma le note collegate, chiusa ad anon", () => {
    expect(sql).toMatch(/FUNCTION public\.nc_collegate_importo\(p_invoice_id uuid\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.nc_collegate_importo\(uuid\) FROM PUBLIC, anon/);
  });
  it("le tre RPC sottraggono le note collegate dal residuo", () => {
    const occ = (sql.match(/nc_collegate_importo\(i\.id\)/g) || []).length;
    expect(occ).toBeGreaterThanOrEqual(4); // scadenzario (x2), cruscotto, cash flow
  });
  it("lo scadenzario non espone più le note di credito come credito da incassare", () => {
    expect(sql).toMatch(/NOT IN \('credit_note', 'nota_credito'\)/);
  });
});
