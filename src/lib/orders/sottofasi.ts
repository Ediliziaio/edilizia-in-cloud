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

export function sottofaseDaRiga(r: Record<string, unknown>): Sottofase {
  return {
    id: String(r.id),
    phase_id: String(r.phase_id),
    name: typeof r.name === "string" ? r.name : "",
    position: Number(r.position) || 0,
    peso: pesoValido(Number(r.peso)),
    fatta: r.fatta === true,
    fatta_il: typeof r.fatta_il === "string" ? r.fatta_il : null,
  };
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
