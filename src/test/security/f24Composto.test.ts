import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.8 — l'F24 composto dai dati veri.
 *
 * Provato su produzione e poi ripulito (anno 2094):
 *   mese senza dati ......... 0 voci, 2 mancanze dichiarate col motivo
 *   febbraio con IVA ........ tributo 6002, importo 1.100,00 (2.200 − 1.100)
 *   scadenza ................ 2094-03-16, che è un martedì
 *   riga scritta ............ 1 in f24_entries, stato da_pagare
 *   secondo giro ............ non duplica
 *   F24 già pagato .......... rifiutato con motivo
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("f24_composto_dai_dati_veri"));
if (!nome) throw new Error("migrazione f24_composto_dai_dati_veri non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("l'F24 prende i numeri da dove esistono", () => {
  it("l'IVA dalla liquidazione, non da una stima", () => {
    expect(sql).toMatch(/v_iva := public\.liquidazione_iva_periodo\(p_company_id, 'mensile', p_anno, p_mese, NULL\)/);
  });

  it("le ritenute dai cedolini emessi, non dalle bozze", () => {
    expect(sql).toMatch(/FROM public\.hr_cedolini c[\s\S]{0,200}c\.stato <> 'bozza'/);
  });

  it("il codice tributo IVA segue il mese", () => {
    expect(sql).toMatch(/v_cod_iva := \(6000 \+ p_mese\)::text/);
  });

  it("un credito IVA non diventa un versamento", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /Un credito IVA non si versa: si riporta/);
  });
});

describe("quello che manca viene detto", () => {
  it("ogni voce mancante porta il motivo", () => {
    expect(sql).toMatch(/'voci_mancanti', v_mancanti/);
    expect(sql).toMatch(/'voce', 'IVA', 'motivo'/);
    expect(sql).toMatch(/'voce', 'ritenute IRPEF \(1001\)'/);
  });

  it("i cedolini in bozza sono un motivo diverso da «nessun cedolino»", () => {
    expect(sql).toMatch(/sono ancora in bozza: le ritenute non sono dovute finché non vengono emessi/);
    expect(sql).toMatch(/nessun cedolino emesso per il periodo/);
  });

  it("le voci fuori portata sono elencate, non taciute", () => {
    expect(sql).toMatch(/'non_incluso', jsonb_build_array\(/);
    expect(sql).toMatch(/contributi INPS/);
    expect(sql).toMatch(/metterle qui sarebbe inventarle/);
  });

  it("l'invio telematico è dichiarato non implementato", () => {
    expect(sql).toMatch(/'invio_telematico', 'non implementato/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /uno col tracciato giusto e i numeri incompleti viene accettato, ed è molto peggio/);
  });
});

describe("scadenza e idempotenza", () => {
  it("il 16 si sposta al primo giorno lavorativo", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.giorno_lavorativo_successivo/);
    expect(sql).toMatch(/public\.festivo_italiano\(d\) OR extract\(dow FROM d\) = 6/);
  });

  it("un tributo per periodo non si scrive due volte", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_f24_entries_periodo_tributo/);
    expect(sql).toMatch(/ON CONFLICT \(company_id, anno, mese, tributo_code\) DO NOTHING/);
  });

  it("un F24 già pagato non si ricompone", () => {
    expect(sql).toMatch(/AND stato = 'pagato'/);
    expect(sql).toMatch(/risulta già pagato: non si ricompone/);
  });

  it("rigenerare tocca solo le righe non ancora pagate", () => {
    expect(sql).toMatch(/DELETE FROM public\.f24_entries[\s\S]{0,150}AND stato = 'da_pagare'/);
  });
});

describe("l'ingresso storico non produce più un F24 vuoto", () => {
  it("delega alla composizione vera", () => {
    expect(sql).toMatch(
      /silvio_tool_genera_f24_mese[\s\S]{0,400}RETURN public\.f24_componi\(p_company_id, p_year, p_month, false\)/);
  });
});
