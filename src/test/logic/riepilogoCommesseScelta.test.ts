import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOGO_RIQUADRI, commesseInRitardo, margineDelPeriodo, usaGenerali, riquadriVisibili, sceltaDaRiga, serieVisibili, SCELTA_PREDEFINITA,
} from "@/lib/orders/riepilogoCommesse";

const tutto = { importi: true, costi: true, margini: true };
const nessuno = { importi: false, costi: false, margini: false };

describe("riepilogo commesse scelto dall'azienda", () => {
  it("senza riga valgono i quattro riquadri di sempre", () => {
    expect(sceltaDaRiga(null)).toEqual(SCELTA_PREDEFINITA);
    expect(SCELTA_PREDEFINITA.riquadri).toEqual(["commesse", "venduto", "incassato", "da_incassare"]);
  });

  it("scarta valori sconosciuti e doppioni, al massimo quattro", () => {
    const s = sceltaDaRiga({ riquadri: ["margine", "boh", "margine", "aperte", "costi", "venduto", "in_ritardo"], grafico_serie: ["x"], grafico_vista: "numero", grafico_forma: "barre" });
    expect(s.riquadri).toEqual(["margine", "aperte", "costi", "venduto"]);
    expect(s.graficoSerie).toEqual(["venduto", "incassato"]);
    expect(s).toMatchObject({ graficoVista: "numero", graficoForma: "barre" });
  });

  it("chi non vede gli importi non riceve mai un riquadro con cifre: al loro posto riquadri operativi", () => {
    const visti = riquadriVisibili(["venduto", "commesse", "margine", "costi"], nessuno);
    expect(visti).toEqual(["aperte", "commesse", "in_ritardo", "assistenza"]);
    expect(visti).toHaveLength(4);
  });

  it("i costi e i margini seguono il loro permesso, separato dagli importi", () => {
    expect(riquadriVisibili(["venduto", "costi", "margine"], { importi: true, costi: true, margini: false }))
      .toEqual(["venduto", "costi", "commesse"]);
    expect(riquadriVisibili(["venduto", "costi", "margine"], tutto)).toEqual(["venduto", "costi", "margine"]);
  });

  it("i riquadri delle commesse generali compaiono solo se l'azienda ha acceso quel modello", () => {
    const scelti = ["appalti_valore", "unita_vendute", "venduto"] as const;
    expect(riquadriVisibili([...scelti], tutto)).toEqual(["commesse", "aperte", "venduto"]);
    expect(riquadriVisibili([...scelti], { ...tutto, appalti: true, operazioni: true })).toEqual([...scelti]);
    // Acceso ma senza permesso degli importi: le unità (un conteggio) sì, il valore degli appalti no.
    expect(riquadriVisibili([...scelti], { ...nessuno, appalti: true, operazioni: true })).toEqual(["commesse", "unita_vendute", "aperte"]);
  });

  it("il fatturato vuole il permesso della fatturazione", () => {
    expect(riquadriVisibili(["fatturato"], tutto)).toEqual(["commesse"]);
    expect(riquadriVisibili(["fatturato"], { ...tutto, fatturazione: true })).toEqual(["fatturato"]);
  });

  it("i numeri delle generali si chiedono solo se servono", () => {
    expect(usaGenerali(["commesse", "venduto"])).toBe(false);
    expect(usaGenerali(["commesse", "capitale_impegnato"])).toBe(true);
  });

  it("ogni riquadro del catalogo è ammesso dal vincolo del database", () => {
    const sql = readFileSync("supabase/migrations/20290329100100_riepilogo_commesse_indicatori_generali.sql", "utf8");
    for (const v of CATALOGO_RIQUADRI) expect(sql).toContain(`'${v.id}'`);
  });

  it("il grafico è tutto importi: senza permesso nessuna serie", () => {
    expect(serieVisibili(["venduto", "da_incassare"], nessuno)).toEqual([]);
    expect(serieVisibili(["venduto", "da_incassare"], tutto)).toEqual(["venduto", "da_incassare"]);
  });

  it("in ritardo: aperte con posa prevista passata", () => {
    const righe = [
      { id: "a", expected_date: "2026-11-01", current_status_id: "lavori" },
      { id: "b", expected_date: "2026-11-01", current_status_id: "fine" },
      { id: "c", expected_date: "2026-12-01", current_status_id: "lavori" },
      { id: "d", expected_date: null, current_status_id: "lavori" },
    ];
    expect(commesseInRitardo(righe, new Set(["fine", "assist"]), "2026-11-15")).toBe(1);
  });

  it("il margine conta solo le commesse con costi registrati", () => {
    const r = margineDelPeriodo([
      { id: "a", preventivo_totale: 1000, consuntivo: 700, margine: 300, margine_perc: 30 },
      { id: "b", preventivo_totale: 500, consuntivo: 0, margine: 500, margine_perc: 100 },
      { id: "c", preventivo_totale: 900, consuntivo: 100, margine: 800, margine_perc: 88 },
    ], new Set(["a", "b"]));
    expect(r).toEqual({ margine: 300, percentuale: 30, conCosti: 1, senzaCosti: 1 });
  });

  it("la tabella si scrive solo con la funzione, col permesso delle impostazioni commesse", () => {
    const sql = readFileSync("supabase/migrations/20290329100000_riepilogo_commesse_scelta_azienda.sql", "utf8");
    expect(sql).toMatch(/grant select on public\.company_riepilogo_commesse to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*company_riepilogo_commesse/i);
    expect(sql).toMatch(/'can_edit_settings_orders', p_company_id/);
    expect(sql).toMatch(/revoke all on function public\.riepilogo_commesse_salva\([^)]*\) from public, anon/);
  });
});
