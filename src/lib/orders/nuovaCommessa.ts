// src/lib/orders/nuovaCommessa.ts
/**
 * Come parte una commessa (07/10/2026): cosa controlla il riquadro «Cantiere da
 * organizzare» e cosa ne esce. Modulo puro: nessun React, nessun Supabase.
 *
 * Ogni azienda sceglie cosa le interessa controllare (company_fasi_settings
 * .controlli_avvio): chi non usa le fasi non se le vede chiedere per sempre.
 */
export type ControlloAvvio = "indirizzo" | "date" | "fasi" | "chi" | "pagamenti";

export interface DefinizioneControllo {
  chiave: ControlloAvvio;
  /** Come si legge nelle impostazioni. */
  etichetta: string;
  /** Come si legge in «Mancano: …». */
  mancante: string;
  /** Il pulsante che porta a sistemarlo. */
  azione: string;
}

export const CONTROLLI_AVVIO: readonly DefinizioneControllo[] = [
  { chiave: "indirizzo", etichetta: "Indirizzo del cantiere", mancante: "l'indirizzo del cantiere", azione: "Aggiungi l'indirizzo" },
  { chiave: "date", etichetta: "Date di inizio e di fine lavori", mancante: "le date dei lavori", azione: "Imposta le date" },
  { chiave: "fasi", etichetta: "Fasi di lavoro", mancante: "le fasi di lavoro", azione: "Scegli le fasi" },
  { chiave: "chi", etichetta: "Chi lavora in cantiere", mancante: "chi lavora in cantiere", azione: "Scegli chi lavora" },
  { chiave: "pagamenti", etichetta: "Come si paga", mancante: "come si paga", azione: "Imposta i pagamenti" },
] as const;

/** Di partenza si controlla tutto: l'azienda toglie quello che non le serve. */
export const CONTROLLI_DI_PARTENZA: readonly ControlloAvvio[] = CONTROLLI_AVVIO.map((c) => c.chiave);

/**
 * I controlli come li legge il database (un elenco di testi). Quello che non si
 * riconosce si scarta; l'ordine è sempre quello della lista, senza doppioni.
 * Un valore che non è un elenco (colonna non ancora creata, lettura fallita)
 * vale «tutto», come di partenza.
 */
export function controlliValidi(valore: unknown): ControlloAvvio[] {
  if (!Array.isArray(valore)) return [...CONTROLLI_DI_PARTENZA];
  const presenti = new Set(valore.filter((v): v is string => typeof v === "string"));
  return CONTROLLI_DI_PARTENZA.filter((c) => presenti.has(c));
}

/** Quello che si sa di una commessa, già riassunto dal chiamante. */
export interface DatiCantiere {
  indirizzo: string | null | undefined;
  inizio: string | null | undefined;
  fine: string | null | undefined;
  /** Quante fasi di lavoro ha. */
  fasi: number;
  /** Quante persone o ditte lavorano in cantiere (accessi alla commessa). */
  persone: number;
  /** Quante rate ha il piano di pagamento. */
  rate: number;
}

export interface Mancanza {
  chiave: ControlloAvvio;
  mancante: string;
  azione: string;
}

const vuoto = (v: string | null | undefined): boolean => !v || v.trim() === "";

/** Cosa manca, tra le cose che l'azienda ha scelto di controllare, nell'ordine di sempre. */
export function cosaManca(dati: DatiCantiere, controlli: ReadonlyArray<ControlloAvvio>): Mancanza[] {
  const manca: Record<ControlloAvvio, boolean> = {
    indirizzo: vuoto(dati.indirizzo),
    date: vuoto(dati.inizio) || vuoto(dati.fine),
    fasi: dati.fasi <= 0,
    chi: dati.persone <= 0,
    pagamenti: dati.rate <= 0,
  };
  const scelti = new Set(controlli);
  return CONTROLLI_AVVIO
    .filter((c) => scelti.has(c.chiave) && manca[c.chiave])
    .map((c) => ({ chiave: c.chiave, mancante: c.mancante, azione: c.azione }));
}

/** «Manca: l'indirizzo del cantiere» · «Mancano: le fasi di lavoro e come si paga». */
export function testoMancano(mancanze: ReadonlyArray<Pick<Mancanza, "mancante">>): string {
  if (mancanze.length === 0) return "";
  const voci = mancanze.map((m) => m.mancante);
  if (voci.length === 1) return `Manca: ${voci[0]}`;
  return `Mancano: ${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}`;
}

/** Togliere un controllo dall'elenco, per «non mi serve più». */
export function senzaControllo(controlli: ReadonlyArray<ControlloAvvio>, chiave: ControlloAvvio): ControlloAvvio[] {
  return controlli.filter((c) => c !== chiave);
}

/**
 * Il modello di fasi con cui parte la commessa nel modulo di nuova commessa.
 * `scelto`: `null` = non ha toccato niente (vale quello di partenza dell'azienda),
 * `""` = ha scelto «Nessuna», un id = ha scelto quel modello. Un modello di partenza
 * che l'azienda ha poi eliminato non si trova tra quelli offerti: nessuna fase.
 */
export function modelloDiAvvio<T extends { id: string }>(
  offerti: ReadonlyArray<T>,
  scelto: string | null,
  dellAzienda: string | null,
): T | null {
  const id = scelto !== null ? scelto : dellAzienda;
  if (!id) return null;
  return offerti.find((m) => m.id === id) ?? null;
}
