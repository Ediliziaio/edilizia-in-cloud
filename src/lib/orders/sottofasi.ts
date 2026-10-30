// src/lib/orders/sottofasi.ts
/**
 * Sottofasi di una fase di lavoro (07/10/2026).
 *
 * Una fase che ha sottofasi ne deriva l'avanzamento: la parte di peso già
 * fatta. Il calcolo vero lo fa il database (fase_avanzamento_derivato, applicato
 * da un trigger a ogni scrittura della fase); qui c'è lo specchio, per mostrare
 * l'anteprima e per tenere le regole scritte e provate in un posto solo.
 * Modulo puro: nessun React, nessun Supabase.
 */
import type { PhaseStatus } from "@/hooks/useOrderWorkPhases";

export interface Sottofase {
  id: string;
  phase_id: string;
  name: string;
  position: number;
  /** Intero 1–100: quanto pesa nel calcolo della fase. */
  peso: number;
  fatta: boolean;
  fatta_il: string | null;
  /** Finestra prevista, giorni «yyyy-MM-dd» (29/10/2026). */
  data_inizio?: string | null;
  data_fine?: string | null;
  /** Tempo necessario, in giorni di lavoro: può essere meno della finestra. */
  giorni?: number | null;
}

const pesoValido = (peso: number): number => (Number.isFinite(peso) && peso >= 1 ? peso : 1);

/** Avanzamento 0–100 di una fase dalle sue sottofasi; `null` se non ne ha. */
export function avanzamentoDaSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "peso" | "fatta">>): number | null {
  if (sottofasi.length === 0) return null;
  let totale = 0;
  let fatto = 0;
  for (const s of sottofasi) {
    const peso = pesoValido(s.peso);
    totale += peso;
    if (s.fatta) fatto += peso;
  }
  return Math.round((100 * fatto) / totale);
}

/**
 * Lo stato in cui il database lascia una fase con sottofasi: sopra lo 0% decide
 * il calcolo (100 chiude, il resto è «in corso»); a 0% l'ufficio sceglie tra «da
 * iniziare» e «in corso», e una fase che era chiusa si riapre.
 */
export function statoFaseDaAvanzamento(
  precedente: PhaseStatus,
  percentuale: number,
  proposto: PhaseStatus = precedente,
): PhaseStatus {
  if (percentuale >= 100) return "completata";
  if (percentuale > 0) return "in_corso";
  if (proposto === "da_iniziare" || proposto === "in_corso") return proposto;
  return precedente === "completata" ? "in_corso" : precedente;
}

export function faseHaSottofasi(sottofasi: ReadonlyArray<unknown> | undefined): boolean {
  return (sottofasi?.length ?? 0) > 0;
}

export function riepilogoSottofasi(sottofasi: ReadonlyArray<Pick<Sottofase, "fatta">>): { fatte: number; totale: number } {
  return { fatte: sottofasi.filter((s) => s.fatta).length, totale: sottofasi.length };
}

export function sottofasiPerFase<T extends Pick<Sottofase, "phase_id" | "position">>(righe: ReadonlyArray<T>): Map<string, T[]> {
  const mappa = new Map<string, T[]>();
  for (const riga of righe) {
    const lista = mappa.get(riga.phase_id);
    if (lista) lista.push(riga);
    else mappa.set(riga.phase_id, [riga]);
  }
  for (const lista of mappa.values()) lista.sort((a, b) => a.position - b.position);
  return mappa;
}

/**
 * Le sottofasi si leggono partendo dalle fasi (12/10/2026): un `select` su
 * order_work_phases filtrato per commessa (o per azienda), con le sottofasi
 * annidate. Così le regole di accesso si valutano solo sulle fasi richieste e
 * sulle loro sottofasi: pochi millisecondi anche con molte commesse.
 */
export const SOTTOFASI_NELLA_FASE = "sottofasi:order_work_subphases(id, phase_id, name, position, peso, fatta, fatta_il, data_inizio, data_fine, giorni)";

/** Le sottofasi annidate nelle fasi (vedi SOTTOFASI_NELLA_FASE), in ordine di posizione. */
export function sottofasiDalleFasi(fasi: ReadonlyArray<Record<string, unknown>> | null | undefined): Sottofase[] {
  return (fasi ?? [])
    .flatMap((f) => (Array.isArray(f.sottofasi) ? (f.sottofasi as Record<string, unknown>[]) : []))
    .map(sottofaseDaRiga)
    .sort((a, b) => a.position - b.position);
}

export function sottofaseDaRiga(r: Record<string, unknown>): Sottofase {
  return {
    id: String(r.id),
    phase_id: String(r.phase_id),
    name: typeof r.name === "string" ? r.name : "",
    position: Number(r.position) || 0,
    peso: pesoValido(Number(r.peso)),
    fatta: r.fatta === true,
    fatta_il: typeof r.fatta_il === "string" ? r.fatta_il : null,
    data_inizio: giornoValido(r.data_inizio),
    data_fine: giornoValido(r.data_fine),
    giorni: giorniValidi(r.giorni),
  };
}

const giornoValido = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null;
const giorniValidi = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isInteger(n) && n >= 1 && n <= 3650 ? n : null;
};

/** Il giorno `giorni − 1` dopo `inizio`: la fine di un lavoro di `giorni` giorni. */
export function fineDaGiorni(inizio: string, giorni: number): string {
  const [a, m, g] = inizio.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + giorni - 1)).toISOString().slice(0, 10);
}

/** I giorni da `da` ad `a`, estremi compresi. */
export function giorniFinestra(da: string, a: string): number {
  const n = (d: string) => { const [y, m, g] = d.split("-").map(Number); return Date.UTC(y, m - 1, g) / 86_400_000; };
  return n(a) - n(da) + 1;
}

/**
 * Le date che il database scrive per una sottofase (sottofase_date_coerenti):
 * inizio e giorni senza fine → la fine; due date senza giorni → i giorni della finestra.
 */
export function pianoSottofase(p: { data_inizio: string | null; data_fine: string | null; giorni: number | null }) {
  const data_fine = p.data_inizio && !p.data_fine && p.giorni ? fineDaGiorni(p.data_inizio, p.giorni) : p.data_fine;
  const giorni = p.data_inizio && data_fine && !p.giorni ? giorniFinestra(p.data_inizio, data_fine) : p.giorni;
  return { data_inizio: p.data_inizio, data_fine, giorni };
}

/** L'intervallo previsto di una sottofase; con una data sola vale quel giorno. */
export function intervalloSottofase(s: Pick<Sottofase, "data_inizio" | "data_fine" | "giorni">): [string, string] | null {
  const p = pianoSottofase({ data_inizio: s.data_inizio ?? null, data_fine: s.data_fine ?? null, giorni: s.giorni ?? null });
  const da = p.data_inizio ?? p.data_fine;
  const a = p.data_fine ?? p.data_inizio;
  return da && a && a >= da ? [da, a] : null;
}

/**
 * Le date della fase dopo aver datato le sottofasi (specchio di
 * fase_allarga_a_sottofasi): la fase si allarga a contenerle, non si stringe mai.
 */
export function dateFaseConSottofasi(
  fase: { start_date: string | null; end_date: string | null },
  sottofasi: ReadonlyArray<Pick<Sottofase, "data_inizio" | "data_fine" | "giorni">>,
): { start_date: string | null; end_date: string | null } {
  let { start_date, end_date } = fase;
  for (const s of sottofasi) {
    const i = intervalloSottofase(s);
    if (!i) continue;
    if (!start_date || i[0] < start_date) start_date = i[0];
    if (!end_date || i[1] > end_date) end_date = i[1];
  }
  return { start_date, end_date };
}

/**
 * Pesare le sottofasi per il tempo necessario: il peso diventa i giorni (fino a
 * 100, il massimo del peso). Serve che TUTTE abbiano i giorni (una senza
 * resterebbe a peso 1 contro le altre in giorni) e che siano almeno due.
 * Restituisce solo quelle il cui peso cambia.
 */
export function pesiDaGiorni(sottofasi: ReadonlyArray<Pick<Sottofase, "id" | "peso" | "giorni">>): Array<{ id: string; peso: number }> {
  if (sottofasi.length < 2 || sottofasi.some((s) => s.giorni == null || s.giorni < 1)) return [];
  return sottofasi
    .map((s) => ({ id: s.id, peso: Math.min(100, s.giorni as number) }))
    .filter((x) => x.peso !== sottofasi.find((s) => s.id === x.id)?.peso);
}

/**
 * Il messaggio di un errore da mostrare. Gli errori di Supabase sono oggetti
 * semplici, non `Error`: senza questo il testo scritto dal database («Le
 * sottofasi le spunta il capocantiere.») si perderebbe dietro un generico.
 */
export function messaggioErrore(e: unknown, predefinito = "Operazione non riuscita. Riprova."): string {
  const m = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m : predefinito;
}

// `type` e non `interface`: il campo del database è un Json, e un'interfaccia non è assegnabile a una firma d'indice.
export type FaseLavorata = {
  phase_id: string;
  percentuale: number;
  /** Solo per le fasi con sottofasi: quelle spuntate in questo rapportino. */
  sottofasi_fatte?: string[];
};

/**
 * Cosa si scrive in campo_rapportini.fasi_lavorate. Per una fase con sottofasi:
 * le spunte NUOVE di questo rapportino e l'avanzamento che ne deriverebbe (un'anteprima:
 * all'approvazione lo ricalcola il database). Una voce per fase dichiarata, sempre: chi
 * legge le voci senza conoscere le sottofasi (il costo della manodopera attribuito alla
 * fase quando la voce è una sola, il cronoprogramma) vede phase_id e percentuale.
 */
export function fasiLavorateDelRapportino(
  dichiarate: Readonly<Record<string, number>>,
  sottofasi: ReadonlyMap<string, ReadonlyArray<Pick<Sottofase, "id" | "peso" | "fatta">>>,
  spunte: ReadonlyArray<string>,
): FaseLavorata[] {
  return Object.entries(dichiarate).map(([phase_id, percentuale]): FaseLavorata => {
    const delle = sottofasi.get(phase_id) ?? [];
    if (delle.length === 0) return { phase_id, percentuale };
    const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id)).map((s) => s.id);
    const anteprima = avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s.id) }))) ?? percentuale;
    return { phase_id, percentuale: anteprima, sottofasi_fatte: nuove };
  });
}

/** Gli id delle sottofasi spuntate in un rapportino già salvato (per riaprirlo in modifica). */
export function sottofasiSpuntate(fasiLavorate: unknown): string[] {
  if (!Array.isArray(fasiLavorate)) return [];
  return fasiLavorate.flatMap((voce) => {
    const spunte = (voce as { sottofasi_fatte?: unknown } | null)?.sottofasi_fatte;
    return Array.isArray(spunte) ? spunte.filter((x): x is string => typeof x === "string") : [];
  });
}
