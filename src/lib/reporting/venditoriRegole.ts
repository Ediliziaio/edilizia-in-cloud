import { differenceInCalendarDays, endOfDay, endOfMonth, isLastDayOfMonth, startOfDay, subDays, subMonths } from "date-fns";
import type { VendorKPI } from "@/hooks/useVendorReport";

/*
 * Le regole del report Venditori, in un posto solo.
 *
 * Prima ogni riquadro aveva le sue: le soglie del semaforo erano scritte in
 * cinque file con numeri diversi (il ciclo di vendita era «lento» da 45 giorni
 * in un riquadro e «ok» fino a 60 in quello accanto), e il «Totale team» della
 * classifica era la media semplice dei tassi dei venditori, dove chi aveva
 * fatto un appuntamento pesava quanto chi ne aveva fatti ottanta.
 */

export type Semaforo = "buono" | "medio" | "critico";

/**
 * Tassi in %: buono da `buono` in su, critico sotto `critico`.
 * Ciclo di vendita in giorni: buono sotto `buono`, critico da `critico` in su.
 */
export const SOGLIE_VENDITORI = {
  tasso_chiusura: { buono: 35, critico: 20 },
  tasso_show_up: { buono: 70, critico: 50 },
  tasso_app_to_close: { buono: 25, critico: 12 },
  avg_giorni_chiusura: { buono: 30, critico: 60 },
} as const;

export type CampoConSoglia = keyof typeof SOGLIE_VENDITORI;

/** null quando il numero non c'è: un tasso non calcolabile, o nessuna vendita, non è «rosso». */
export function semaforoVenditori(campo: CampoConSoglia, valore: number | null | undefined): Semaforo | null {
  if (valore == null || !Number.isFinite(valore)) return null;
  const s = SOGLIE_VENDITORI[campo];
  if (campo === "avg_giorni_chiusura") {
    if (valore <= 0) return null;
    return valore < s.buono ? "buono" : valore < s.critico ? "medio" : "critico";
  }
  return valore >= s.buono ? "buono" : valore >= s.critico ? "medio" : "critico";
}

/** Un tasso in %, o «—» quando non si può calcolare (niente chiuso, nessun appuntamento con esito). */
export function tassoTesto(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v.toLocaleString("it-IT")}%`;
}

/** Giorni di ciclo, o «—» quando nel periodo non c'è una vendita da misurare. */
export function giorniTesto(v: number | null | undefined, conVendite = (v ?? 0) > 0): string {
  return v == null || !conVendite ? "—" : `${v.toLocaleString("it-IT")} gg`;
}

/*
 * Totale del team dalle righe dei venditori, con le STESSE regole del database
 * (vendite_opportunita / vendite_appuntamenti, 20280915410001): i tassi si
 * ricompongono dai conteggi, non come media dei tassi. Dove la riga porta solo
 * il tasso (conversione, App → Opportunità, App → Chiusura) il conteggio si
 * ricava come tasso × base / 100, che è il numeratore della riga; le basi sono
 * quelle di get_vendor_kpi_per_agent (20280915410002): opportunità create per
 * la conversione, appuntamenti effettuati per App → Opportunità / Chiusura.
 */
export function aggregateTeamKPI(list: VendorKPI[]): VendorKPI | null {
  if (!list.length) return null;
  const num = (v: unknown) => Number(v) || 0;
  const sum = (f: keyof VendorKPI) => list.reduce((a, k) => a + num(k[f]), 0);
  const numeratore = (tasso: keyof VendorKPI, base: keyof VendorKPI) =>
    list.reduce((a, k) => a + (num(k[tasso]) * num(k[base])) / 100, 0);
  const tassoDi = (parte: number, tutto: number) => (tutto > 0 ? Math.round((1000 * parte) / tutto) / 10 : null);
  // Media sulle singole vendite (o perdite), come nel database: il ciclo di
  // chi ha chiuso dieci contratti pesa dieci volte quello di chi ne ha chiuso uno.
  const mediaPesata = (valore: keyof VendorKPI, peso: keyof VendorKPI) => {
    const pesi = sum(peso);
    return pesi > 0 ? Math.round((list.reduce((a, k) => a + num(k[valore]) * num(k[peso]), 0) / pesi) * 10) / 10 : 0;
  };
  const vinte = sum("opp_vinte");
  const perse = sum("opp_perse");
  const create = sum("opp_totali");
  const effettuati = sum("appuntamenti_effettuati");
  const noShow = sum("appuntamenti_no_show");
  const fatturato = sum("fatturato_generato");
  const conVendite = list.filter((k) => num(k.opp_vinte) > 0);

  return {
    agent_id: "team",
    nome_agente: "Team completo",
    email_agente: "",
    opp_totali: create,
    opp_vinte: vinte,
    opp_perse: perse,
    opp_aperte: sum("opp_aperte"),
    tasso_chiusura: tassoDi(vinte, vinte + perse),
    tasso_conversione: tassoDi(numeratore("tasso_conversione", "opp_totali"), create),
    fatturato_generato: fatturato,
    importo_medio_chiusura: vinte > 0 ? Math.round(fatturato / vinte) : 0,
    pipeline_valore: sum("pipeline_valore"),
    fatturato_perso: sum("fatturato_perso"),
    appuntamenti_fissati: sum("appuntamenti_fissati"),
    appuntamenti_effettuati: effettuati,
    appuntamenti_no_show: noShow,
    tasso_show_up: tassoDi(effettuati, effettuati + noShow),
    tasso_app_to_opp: tassoDi(numeratore("tasso_app_to_opp", "appuntamenti_effettuati"), effettuati),
    tasso_app_to_close: tassoDi(numeratore("tasso_app_to_close", "appuntamenti_effettuati"), effettuati),
    avg_giorni_chiusura: mediaPesata("avg_giorni_chiusura", "opp_vinte"),
    avg_giorni_chiusura_perse: mediaPesata("avg_giorni_chiusura_perse", "opp_perse"),
    min_giorni_chiusura: conVendite.length ? Math.min(...conVendite.map((k) => num(k.min_giorni_chiusura))) : 0,
    max_giorni_chiusura: conVendite.length ? Math.max(...conVendite.map((k) => num(k.max_giorni_chiusura))) : 0,
    nuovi_contatti: sum("nuovi_contatti"),
  };
}

/*
 * Il periodo con cui confrontare. Si confronta solo la parte già trascorsa:
 * «Questo mese» all'11 settembre sono undici giorni, e undici giorni contro un
 * agosto intero darebbero sempre il segno meno.
 *
 * - periodi a mesi (mese, trimestre, semestre, anno): gli stessi giorni tanti
 *   mesi prima — 1–11 settembre contro 1–11 agosto, l'anno in corso contro lo
 *   stesso tratto dell'anno scorso;
 * - periodo libero: altrettanti giorni subito prima.
 */
export function periodoPrecedente(
  inizio: Date,
  fine: Date,
  mesi: number | null = null,
  oggi: Date = new Date(),
): { inizio: Date; fine: Date } {
  const fineEffettiva = fine.getTime() > endOfDay(oggi).getTime() && inizio.getTime() <= oggi.getTime()
    ? endOfDay(oggi)
    : fine;
  if (mesi && mesi > 0) {
    // un mese finito si confronta con un mese finito: settembre (30) con agosto (31)
    const fineP = isLastDayOfMonth(fineEffettiva)
      ? endOfMonth(subMonths(fineEffettiva, mesi))
      : endOfDay(subMonths(fineEffettiva, mesi));
    return { inizio: startOfDay(subMonths(inizio, mesi)), fine: fineP };
  }
  const giorni = Math.max(1, differenceInCalendarDays(fineEffettiva, inizio) + 1);
  const fineP = endOfDay(subDays(startOfDay(inizio), 1));
  return { inizio: startOfDay(subDays(fineP, giorni - 1)), fine: fineP };
}
