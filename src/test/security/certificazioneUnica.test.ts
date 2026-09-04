import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Il secondo sottosistema paghe orfano: la Certificazione Unica.
 *
 * Provato su produzione e poi ripulito (anno 2096):
 *   nessun cedolino ............ rifiuta: «non c'è niente da certificare»,
 *                                e non lascia una riga vuota in fiscal_reports
 *   solo bozze ................. motivo diverso: «ce ne sono 2 in bozza»
 *   due mesi emessi ............ 1 percipiente, lordo 3.600,00, ritenute 300,20
 *   riga del dipendente ........ «Marco Operaio: 2 mesi»
 *   documento .................. finisce in fiscal_reports con le righe dentro
 *   secondo giro ............... aggiorna, non duplica
 *   CU già inviata ............. non si ricompone
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("certificazione_unica_non_vuota"));
if (!nome) throw new Error("migrazione certificazione_unica_non_vuota non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("il difetto era lo stesso dell'F24", () => {
  it("è documentato con il codice che faceva prima", () => {
    const testo = sql.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/Nessun dipendente, nessun imponibile, nessuna ritenuta/);
    expect(testo).toMatch(/la stessa cosa che faceva `silvio_tool_genera_f24_mese`/);
  });

  it("l'ingresso storico ora delega alla composizione vera", () => {
    expect(sql).toMatch(
      /silvio_tool_genera_cu_anno[\s\S]{0,300}RETURN public\.cu_componi\(p_company_id, p_year\)/);
  });
});

describe("non produce documenti vuoti", () => {
  it("senza cedolini emessi rifiuta invece di scrivere una riga", () => {
    const corpo = sql.slice(sql.indexOf("IF v_quanti = 0 THEN"));
    expect(corpo.slice(0, 700)).toMatch(/'ok', false/);
    expect(corpo.slice(0, 700)).not.toMatch(/INSERT INTO public\.fiscal_reports/);
  });

  it("e distingue «nessun cedolino» da «solo bozze»", () => {
    expect(sql).toMatch(/non c''è niente da certificare/);
    expect(sql).toMatch(/una CU non si fa su cedolini non emessi/);
  });

  it("i cedolini in bozza non entrano nei totali", () => {
    expect(sql).toMatch(/AND c\.stato <> 'bozza'/);
    expect(sql).toMatch(/Un cedolino in bozza non ha certificato niente/);
  });
});

describe("quello che non copre è scritto", () => {
  it("le quattro voci mancanti sono elencate nel documento e nella risposta", () => {
    const elenchi = sql.match(/ritenute d''acconto ai professionisti/g) ?? [];
    expect(elenchi.length).toBe(2);
    expect(sql).toMatch(/addizionali regionali e comunali/);
    expect(sql).toMatch(/invio telematico/);
  });

  it("e il motivo per cui le addizionali non ci sono", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /il calcolo del cedolino esclude, quindi metterle qui sarebbe inventarle/);
  });
});

describe("un documento già inviato non si tocca", () => {
  it("solo lo stato draft si ricompone", () => {
    expect(sql).toMatch(/v_stato IS NOT NULL AND v_stato <> 'draft'/);
    expect(sql).toMatch(/non si ricompone/);
  });

  it("e il secondo giro aggiorna invece di duplicare", () => {
    expect(sql).toMatch(/ON CONFLICT \(company_id, report_type, period_start\) DO UPDATE/);
  });
});
