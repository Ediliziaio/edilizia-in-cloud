/**
 * Il cronoprogramma del PREVENTIVO (26/10/2026): le fasi del cantiere e quanto durano.
 *
 * Erano scritte una volta sola nel modello dell'azienda: tutti i preventivi raccontavano gli stessi tempi. Ora si
 * possono scrivere sul singolo preventivo, partendo da quelle del modello o dalle fasi tipiche del mestiere.
 * Senza fasi proprie, il PDF usa quelle del modello: niente cambia per chi non le tocca.
 *
 * Le fasi hanno la stessa forma del modello ({ fase, durata, descrizione }), così il PDF le disegna com'è.
 * Modulo puro: niente React, niente Supabase.
 */
import { giorniDellaDurata } from "@/components/preventivi/pdf/testoDocumento";

export interface FaseCrono {
  fase: string;
  /** Come la scrive chi vende: «3 giorni», «1-2 settimane», «un mese». Libera: il PDF la stampa così. */
  durata: string | null;
  descrizione: string | null;
}

export const MAX_FASI_CRONO = 20;
export const MAX_NOME_FASE = 80;

const testo = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};

/** Le fasi come sono salvate (sul preventivo o nel modello). Difensivo: dal database arriva di tutto. */
export function leggiCronoprogramma(raw: unknown): FaseCrono[] | null {
  if (!Array.isArray(raw)) return null;
  const fasi = raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, MAX_FASI_CRONO)
    .map((x): FaseCrono => ({
      fase: String(x.fase ?? "").trim().slice(0, MAX_NOME_FASE),
      durata: testo(x.durata, 40),
      descrizione: testo(x.descrizione, 200),
    }));
  return fasi.length > 0 ? fasi : null;
}

/** Solo le fasi che hanno un nome: una riga vuota lasciata a metà non finisce nel preventivo del cliente. */
export function fasiDaStampare(fasi: FaseCrono[] | null | undefined): FaseCrono[] {
  return (fasi ?? []).filter((f) => f.fase.trim().length > 0);
}

/** «Circa 5 settimane»: la somma delle durate, detta nell'unità che si legge meglio. Null se non si sa. */
export function durataComplessiva(fasi: readonly FaseCrono[]): string | null {
  const giorni = fasiDaStampare([...fasi]).map((f) => giorniDellaDurata(f.durata));
  if (giorni.length === 0 || giorni.some((g) => g == null)) return null;
  const totale = (giorni as number[]).reduce((a, b) => a + b, 0);
  if (totale <= 0) return null;
  if (totale < 14) return `${Math.round(totale)} giorni`;
  if (totale < 60) {
    const settimane = Math.round(totale / 7);
    return `circa ${settimane} settiman${settimane === 1 ? "a" : "e"}`;
  }
  const mesi = Math.round(totale / 30);
  return `circa ${mesi} mes${mesi === 1 ? "e" : "i"}`;
}

const fase = (nome: string, durata: string): FaseCrono => ({ fase: nome, durata, descrizione: null });

/** Le fasi tipiche di ogni mestiere: un punto da cui partire, non una regola. */
const FASI_TIPICHE: Record<string, readonly FaseCrono[]> = {
  ristrutturazione: [
    fase("Allestimento e protezioni", "2 giorni"), fase("Demolizioni e smaltimento", "4 giorni"),
    fase("Impianti", "2 settimane"), fase("Opere murarie e massetti", "2 settimane"),
    fase("Pavimenti e rivestimenti", "2 settimane"), fase("Finiture e pulizia", "1 settimana"),
  ],
  bagni: [
    fase("Protezioni e demolizioni", "2 giorni"), fase("Impianti idrici ed elettrici", "3 giorni"),
    fase("Massetti e impermeabilizzazione", "3 giorni"), fase("Pavimenti e rivestimenti", "4 giorni"),
    fase("Sanitari e finiture", "2 giorni"),
  ],
  tetti: [
    fase("Ponteggio e sicurezza", "2 giorni"), fase("Rimozione del manto", "3 giorni"),
    fase("Isolamento e impermeabilizzazione", "4 giorni"), fase("Nuovo manto di copertura", "5 giorni"),
    fase("Lattoneria e smontaggio", "3 giorni"),
  ],
  climatizzazione: [
    fase("Sopralluogo e consegna materiale", "1 settimana"), fase("Linee frigorifere e scarichi", "3 giorni"),
    fase("Posa delle macchine", "2 giorni"), fase("Avviamento e collaudo", "1 giorno"),
  ],
  elettrico: [
    fase("Tracce e posa delle tubazioni", "4 giorni"), fase("Cablaggio", "4 giorni"),
    fase("Quadro e frutti", "3 giorni"), fase("Verifiche e certificazione", "1 giorno"),
  ],
  termoidraulico: [
    fase("Consegna del materiale", "1 settimana"), fase("Smontaggio del vecchio impianto", "2 giorni"),
    fase("Posa del nuovo impianto", "1 settimana"), fase("Avviamento, collaudo e pratiche", "2 giorni"),
  ],
  pavimenti: [
    fase("Preparazione del fondo", "2 giorni"), fase("Posa", "1 settimana"),
    fase("Fughe e battiscopa", "2 giorni"), fase("Pulizia di fine cantiere", "1 giorno"),
  ],
  piscine: [
    fase("Scavo e preparazione", "1 settimana"), fase("Struttura della vasca", "2 settimane"),
    fase("Impianti di filtrazione", "1 settimana"), fase("Rivestimento", "1 settimana"),
    fase("Riempimento e collaudo", "3 giorni"),
  ],
};

/** Le fasi da cui partire quando il modello non ne ha: quelle del mestiere, o tre passi generici. */
export function fasiDiPartenza(modulo: string | null | undefined): FaseCrono[] {
  const tipiche = FASI_TIPICHE[String(modulo ?? "")];
  if (tipiche) return tipiche.map((f) => ({ ...f }));
  return [
    fase("Preparazione del cantiere", "2 giorni"),
    fase("Lavorazioni", "2 settimane"),
    fase("Finiture e consegna", "3 giorni"),
  ];
}
