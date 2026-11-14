/**
 * Le modifiche in blocco sulle fatture ricevute: chi può ricevere quale azione, e l'esecuzione a
 * piccoli gruppi. Una fattura che non riesce non ferma le altre: finisce nel resoconto.
 */
import { inParallelo } from "@/lib/fatturazione/importMassivo";
import { nonSiPaga } from "@/lib/fatturazione/noteDiCredito";

export type AzioneRicevute = "pagate" | "da_pagare" | "verificate" | "da_verificare" | "contabilizza" | "commessa" | "mezzi";

export interface RicevutaInBlocco {
  id: string;
  numero: string;
  totale: number | null;
  stato: string;
  tipo: string | null;
  /** La data di pagamento segnata (sulla fattura o dalle rate). */
  pagataIl: string | null;
  /** Il costo risulta pagato, ma non da qui: si cambia dal costo. */
  pagataSulCosto: boolean;
  verificata: boolean;
  stornata: boolean;
  storico: boolean;
  /** Nota di credito senza ordine: va detto a mano quale fattura storna. */
  notaSenzaOrdine: boolean;
  /** Già legata a un ordine d'acquisto: la commessa la decide l'ordine. */
  conOrdine: boolean;
  scadenze: (string | null)[];
  /** Mezzi proposti dalla targa e non ancora confermati; assente = non si sa (si prova). */
  mezziDaConfermare?: number;
}

/** Perché una fattura resta fuori; null se l'azione vale per lei. */
export function motivoEsclusione(azione: AzioneRicevute, r: RicevutaInBlocco): string | null {
  const rifiutata = r.stato === "rifiutata";
  switch (azione) {
    case "pagate":
      if (rifiutata) return "rifiutata";
      if (nonSiPaga(r.tipo)) return "non si paga (nota di credito o autofattura)";
      if (r.stornata) return "stornata da una nota di credito";
      if (r.pagataIl || r.pagataSulCosto) return "già pagata";
      return null;
    case "da_pagare":
      if (!r.pagataIl) return r.pagataSulCosto ? "pagata dal costo: si cambia da lì" : "non è pagata";
      return null;
    case "verificate":
      if (rifiutata) return "rifiutata";
      return r.verificata ? "già verificata" : null;
    case "da_verificare":
      if (rifiutata) return "rifiutata";
      return r.verificata ? null : "già da verificare";
    case "contabilizza":
      if (rifiutata) return "rifiutata";
      if (r.stato === "contabilizzata") return "già contabilizzata";
      if (r.storico) return "storico già registrato";
      if (r.notaSenzaOrdine) return "nota di credito: va detto quale fattura storna";
      return null;
    case "commessa":
      if (rifiutata) return "rifiutata";
      if (r.conOrdine) return "legata a un ordine d'acquisto";
      return null;
    case "mezzi":
      if (rifiutata) return "rifiutata";
      if (r.mezziDaConfermare === 0) return "nessun mezzo da confermare";
      return null;
  }
}

export interface Selezione {
  idonee: RicevutaInBlocco[];
  /** Quante restano fuori per ogni motivo. */
  escluse: { motivo: string; quante: number }[];
}

export function dividiPerAzione(azione: AzioneRicevute, righe: readonly RicevutaInBlocco[]): Selezione {
  const idonee: RicevutaInBlocco[] = [];
  const conteggi = new Map<string, number>();
  for (const r of righe) {
    const motivo = motivoEsclusione(azione, r);
    if (motivo) conteggi.set(motivo, (conteggi.get(motivo) ?? 0) + 1);
    else idonee.push(r);
  }
  return { idonee, escluse: [...conteggi].map(([motivo, quante]) => ({ motivo, quante })) };
}

/**
 * Il giorno del pagamento quando si sceglie «alla scadenza»: l'ultima scadenza già passata; una
 * scadenza futura, o nessuna, vale oggi (il database non accetta date nel futuro).
 */
export function dataAllaScadenza(scadenze: readonly (string | null)[], oggi: string): string {
  const passate = scadenze.filter((s): s is string => !!s && s <= oggi).sort();
  return passate.length === scadenze.filter(Boolean).length && passate.length ? passate[passate.length - 1] : oggi;
}

export interface Esito<T> {
  riuscite: T[];
  fallite: { riga: T; motivo: string }[];
}

const testoErrore = (e: unknown): string => {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
};

export async function eseguiInBlocco<T>(
  righe: readonly T[],
  lavora: (riga: T) => Promise<unknown>,
  avanzamento?: (fatte: number) => void,
  quanti = 4,
): Promise<Esito<T>> {
  const esito: Esito<T> = { riuscite: [], fallite: [] };
  await inParallelo(righe, quanti, async (riga) => {
    try {
      await lavora(riga);
      esito.riuscite.push(riga);
    } catch (e) {
      esito.fallite.push({ riga, motivo: testoErrore(e) });
    }
  }, avanzamento);
  return esito;
}
