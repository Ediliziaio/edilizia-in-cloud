/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { caricaDossierEconomico } from "@/lib/orders/dossierEconomico";
import type { QuadroPagamenti } from "@/lib/orders/quadroPagamenti";
import { htmlContoEconomico } from "@/lib/orders/contoEconomicoHtml";
import { isValidElement } from "react";
import { createOrdinePDFDocument } from "@/components/orders/OrdinePDF";

function testo(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(testo).join(" ");
  if (isValidElement<{ children?: unknown }>(v)) return testo(v.props.children);
  return "";
}

// Database finto: ogni tabella risponde coi suoi dati, qualunque filtro.
function dbFinto(tabelle: Record<string, unknown>, rpc: unknown) {
  const query = (dati: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "order", "filter", "contains", "range", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: dati, error: null as null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(dati) ? dati : [], error: null as null }).then(ok);
    return q;
  };
  return { from: (t: string) => query(tabelle[t] ?? []), rpc: async () => ({ data: rpc, error: null as null }) };
}

const tabelle: Record<string, unknown> = {
  orders: { order_code: "DEMO-2026-N008", description: "Locali commerciali", percentuale_avanzamento: 50, work_start_date: "2026-02-01", work_end_date: "2026-07-31" },
  v_ordine_marginalita: { preventivo_contratto: 56648.71, variazioni_approvate: 0, preventivo_totale: 56648.71, costo_acquisti: 24189, costo_materiali_magazzino: 0,
    costo_manodopera: 15204.52, costo_provvigioni: 0, costo_rimborsi_km: 0, costo_errori: 0, costo_diretto: 1727.79, consuntivo: 41121.31, margine: 15527.4, margine_perc: 27.4 },
  order_employees: [{ phase_id: "f1", total_cost: 4000, cost_preventivo: 5000 }],
  order_external_teams: [{ phase_id: "f2", total_cost: 11204.52, cost_preventivo: 12000, vat_rate: 0 }],
  order_work_phases: [
    { id: "f1", name: "Demolizioni", position: 1, status: "completata", percentuale: 100, importo_venduto: 8000 },
    { id: "f2", name: "Impianti", position: 2, status: "in_corso", percentuale: 40, importo_venduto: 20000 },
  ],
  order_items: [{ id: "i1", phase_id: "f2", quantity: 1, unit_price: null, discount_percent: null, purchase_price: 25000, standard_cost: null }],
  company_costs: [{ id: "c1", order_id: "o", amount: 1727.79, allocations: [], purchase_order_id: null, order_external_team_id: null, suppliers: { tipo: "noli_servizi" } }],
};
const quadro: QuadroPagamenti = {
  oggi: "2026-10-31",
  rate: [{ id: "r1", label: "Acconto 30%", type: "deposit", amount: 18694.07, fattura: "1/2026", is_paid: true, scaduta: false, paid_date: "2026-03-15", expected_date: "2026-03-15" }],
  sal_cliente: [], mezzi_stimati: null,
  uscite: [{ stato: "da_pagare", chiave: "costo:c1", pagato: 0, fatture: "FT 9", importo: 2107.9, residuo: 2107.9, scadenza: "2026-11-20", categoria: "noleggi",
    contratto: null, pagato_il: null, quota_pct: 100, ripartito: false, origine_id: "c1", controparte: "Noleggi Srl", descrizione: "Gru", ha_ricevuta: false,
    riferimento: null, origine_tipo: "costo", senza_fattura: false, maturato_lordo: null, ritenute: null }],
};

describe("dossier economico della commessa", () => {
  it("il conto per voce torna col consuntivo della vista; fasi, incassi e pagamenti ci sono", async () => {
    const d = await caricaDossierEconomico(dbFinto(tabelle, quadro), "o", { strutturaMensile: 1000 });
    expect(d.conto.costiConsuntivo).toBe(41121.31);
    const per = Object.fromEntries(d.conto.righe.map((r) => [r.key, r.consuntivo]));
    expect(per).toMatchObject({ materiali: 24189, manodopera: 4000, subappalti: 11204.52, noleggi: 1727.79 });
    expect(d.conto.righe.find((r) => r.key === "subappalti")?.preventivo).toBe(12000);
    expect(d.fasi.map((f) => [f.nome, f.economia.venduto])).toEqual([["Demolizioni", 8000], ["Impianti", 20000]]);
    expect(d.totaliQuadro).toMatchObject({ incassato: 18694.07, daPagare: 2107.9 });
    expect(d.conto.struttura.consuntivo).not.toBeNull();

    const html = htmlContoEconomico(d, { ragione_sociale: "Demo Azienda 2 S.r.l." }, { mostraMargini: true, mostraIncassi: true });
    for (const t of ["Preventivo e consuntivo per voce", "Fasi di lavorazione", "Incassi dal cliente", "Pagamenti della commessa", "Margine netto", "Noleggi Srl", "Acconto 30%", "41.121,31"]) {
      expect(html).toContain(t);
    }
    if (process.env.CONTO_HTML_PROVA) writeFileSync(process.env.CONTO_HTML_PROVA, html);
  });

  it("senza i permessi su margini e incassi quelle parti non escono", async () => {
    const d = await caricaDossierEconomico(dbFinto(tabelle, quadro), "o");
    const html = htmlContoEconomico(d, { ragione_sociale: "Demo" }, { mostraMargini: false, mostraIncassi: false });
    expect(html).not.toContain("Margine netto");
    expect(html).not.toContain("Incassi dal cliente");
  });

  it("il Riepilogo commessa usa il dossier: conto per voce, fasi, pagamenti e margine dei costi registrati", async () => {
    const d = await caricaDossierEconomico(dbFinto(tabelle, quadro), "o");
    const doc = createOrdinePDFDocument({ order: { id: "o", order_code: "DEMO-2026-N008", total_amount: 56648.71, vat_rate: 10 }, items: [], showCosts: true, showMargins: true, dossier: d });
    const t = testo(doc).replace(/\s+/g, " ");
    for (const atteso of ["Conto economico per voce", "Economia delle fasi", "Pagamenti della commessa", "ANALISI MARGINE (COSTI REGISTRATI)", "Noleggi e mezzi", "Demolizioni"]) expect(t).toContain(atteso);
    expect(t).toContain("15.527,40");
    expect(t).not.toContain("Margine Lordo");
    const senza = testo(createOrdinePDFDocument({ order: { id: "o", order_code: "X", total_amount: 1000, vat_rate: 22 }, items: [], showCosts: false, showMargins: false, dossier: d }));
    expect(senza).not.toContain("Conto economico per voce");
  });
});
