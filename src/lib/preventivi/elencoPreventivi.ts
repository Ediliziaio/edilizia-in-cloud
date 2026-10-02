/**
 * Regole dell'elenco Preventivi (UnifiedPreventiviList), senza interfaccia:
 * quali righe sono «bozze vuote», quali vanno seguite, come si scrive «quanto
 * tempo fa». Stanno qui per poterle provare con dei test.
 */

/** Il minimo che serve a queste regole: la riga dell'elenco ne ha di più. */
export interface RigaElenco {
  stato_unif: string;
  totale: number | null;
  /** Ultimo aggiornamento (o creazione, se mai aggiornato). */
  data: string;
}

/** Oltre quanti giorni un preventivo in corso, fermo, va richiamato. */
export const GIORNI_DA_SEGUIRE = 7;

export type VistaElenco = "tutte" | "da_seguire" | "bozze_vuote";

export const VISTE_ELENCO: readonly VistaElenco[] = ["tutte", "da_seguire", "bozze_vuote"];

export function vistaDaTesto(v: string | null | undefined): VistaElenco {
  return (VISTE_ELENCO as readonly string[]).includes(v ?? "") ? (v as VistaElenco) : "tutte";
}

const GIORNO_MS = 86_400_000;

/** Giorni interi trascorsi; null se la data non è valida. Mai negativo. */
export function giorniDa(data: string, adesso: Date = new Date()): number | null {
  const t = new Date(data).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((adesso.getTime() - t) / GIORNO_MS));
}

/** Bozza senza un importo: non c'è niente da inviare, spesso è un tentativo abbandonato. */
export function eBozzaVuota(r: RigaElenco): boolean {
  return r.stato_unif === "bozza" && !(Number(r.totale) > 0);
}

/** In corso e fermo da almeno `soglia` giorni: è quello da richiamare. */
export function eDaSeguire(r: RigaElenco, adesso: Date = new Date(), soglia: number = GIORNI_DA_SEGUIRE): boolean {
  if (r.stato_unif !== "in_corso") return false;
  const g = giorniDa(r.data, adesso);
  return g != null && g >= soglia;
}

export function appartieneAllaVista(r: RigaElenco, vista: VistaElenco, adesso: Date = new Date()): boolean {
  if (vista === "da_seguire") return eDaSeguire(r, adesso);
  if (vista === "bozze_vuote") return eBozzaVuota(r);
  return true;
}

/** «oggi», «ieri», «3 giorni fa», «2 sett. fa», «4 mesi fa»; null se la data non è valida. */
export function etichettaEta(data: string, adesso: Date = new Date()): string | null {
  const g = giorniDa(data, adesso);
  if (g == null) return null;
  if (g === 0) return "oggi";
  if (g === 1) return "ieri";
  if (g < 14) return `${g} giorni fa`;
  if (g < 60) return `${Math.floor(g / 7)} sett. fa`;
  if (g < 365) return `${Math.floor(g / 30)} mesi fa`;
  const anni = Math.floor(g / 365);
  return anni === 1 ? "1 anno fa" : `${anni} anni fa`;
}

/** Conta le righe per stato, «altro» compreso: la somma deve tornare col totale. */
export function contaPerStato<T extends { stato_unif: string }>(righe: readonly T[]): Record<string, number> & { all: number } {
  const out: Record<string, number> = {};
  for (const r of righe) out[r.stato_unif] = (out[r.stato_unif] ?? 0) + 1;
  return { ...out, all: righe.length };
}
