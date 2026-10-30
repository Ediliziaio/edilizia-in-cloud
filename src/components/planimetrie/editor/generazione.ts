/**
 * La pianta generata con l'AI (fase 3, edge function `planimetria-genera`), vista dal
 * browser: cosa mandare, come leggere la risposta, come confermare la scala.
 *
 * La funzione restituisce una pianta già controllata ma NON salvata: la salva la
 * pagina, con l'origine che la funzione indica (`ai_pdf`, `ai_foto`, `ai_testo`…).
 */
import type { OrigineVersione } from "@/lib/planimetrie/archivio";
import type { InfoGenerazione } from "../../../../supabase/functions/planimetria-genera/generazione.ts";
import { applicaMisuraLocale } from "../../../../supabase/functions/planimetria-genera/costruisci.ts";
import { validaPlanimetria } from "../../../../shared/planimetrie/modello.ts";
import type { Planimetria } from "./adattatore";

export type { InfoGenerazione };

export type IngressoAI = "documento" | "schizzo" | "descrizione";

export const MIME_AMMESSI = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
/** Il file va alla funzione dentro la richiesta: oltre questa misura conviene una foto più leggera. */
export const MASSIMO_BYTES = 10 * 1024 * 1024;

export interface RichiestaAI {
  company_id: string;
  ingresso: IngressoAI;
  testo?: string;
  file_base64?: string;
  mime?: string;
  larghezza?: number;
  altezza?: number;
}

export type EsitoAI =
  | { ok: true; planimetria: Planimetria; generazione: InfoGenerazione; origine: OrigineVersione }
  | { ok: false; messaggio: string; motivo: "crediti" | "non_risponde" | "non_riuscita" | "richiesta" };

const A_MANO = "Puoi sempre disegnarla a mano.";

/** Controlla il file prima di mandarlo: una frase semplice se non va. */
export function fileNonValido(file: { type: string; size: number }): string | null {
  if (!MIME_AMMESSI.includes(file.type)) return "Carica un PDF o una foto (JPG o PNG).";
  if (file.size > MASSIMO_BYTES) return "Il file è troppo grande (massimo 10 MB): prova con una foto più leggera.";
  return null;
}

/**
 * Legge la risposta della funzione. `corpo` è il JSON della risposta (anche quando lo
 * stato non è 2xx), `stato` lo stato HTTP o null se la funzione non ha risposto.
 */
export function leggiRispostaAI(corpo: unknown, stato: number | null): EsitoAI {
  if (stato === null || corpo == null || typeof corpo !== "object") {
    return { ok: false, motivo: "non_risponde", messaggio: `Il servizio non risponde in questo momento: riprova fra qualche minuto. ${A_MANO}` };
  }
  const r = corpo as Record<string, unknown>;
  if (r.success === true) {
    const esito = validaPlanimetria(r.planimetria);
    if (!esito.ok) {
      return { ok: false, motivo: "non_riuscita", messaggio: `La pianta letta non è completa: riprova con un'immagine più nitida. ${A_MANO}` };
    }
    return {
      ok: true,
      planimetria: esito.planimetria,
      generazione: r.generazione as InfoGenerazione,
      origine: (r.origine_versione as OrigineVersione) ?? "importazione",
    };
  }
  const codice = typeof r.codice === "string" ? r.codice : "";
  const testo = typeof r.messaggio === "string" && r.messaggio ? r.messaggio : typeof r.error === "string" ? r.error : "";
  if (stato === 402 || codice === "crediti" || /credit/i.test(testo)) {
    return { ok: false, motivo: "crediti", messaggio: `I crediti AI sono finiti: ricaricali per generare la pianta. ${A_MANO}` };
  }
  if (stato >= 500 || stato === 504 || stato === 429) {
    return { ok: false, motivo: "non_risponde", messaggio: `Il servizio non risponde in questo momento: riprova fra qualche minuto. ${A_MANO}` };
  }
  if (stato === 400 || stato === 413 || stato === 415 || codice === "file" || codice === "richiesta") {
    return { ok: false, motivo: "richiesta", messaggio: testo || "Il file non va bene: carica un PDF o una foto." };
  }
  return { ok: false, motivo: "non_riuscita", messaggio: `${testo || "Non sono riuscito a ricavare la pianta."} ${A_MANO}`.trim() };
}

/** La scala va confermata da una persona: solo sui disegni in scala ha senso farlo qui. */
export function scalaDaConfermare(ingresso: IngressoAI, generazione: InfoGenerazione): boolean {
  return ingresso === "documento" && !!generazione.scala?.da_confermare && generazione.ingresso === "documento";
}

/**
 * «Questa stanza è larga 4,20»: tutta la pianta in scala si adegua (la funzione della
 * fase 3, la stessa usata dal banco di prova). `asse` x = da sinistra a destra.
 */
export function confermaScala(
  planimetria: Planimetria,
  generazione: InfoGenerazione,
  localeId: string,
  asse: "x" | "y",
  valoreCm: number,
): { planimetria: Planimetria; generazione: InfoGenerazione } {
  return applicaMisuraLocale({ planimetria, generazione }, localeId, asse, valoreCm);
}

/** Larghezza e altezza in pixel di un'immagine: senza, la funzione deforma la pianta. */
export function misureImmagine(url: string): Promise<{ larghezza: number; altezza: number } | null> {
  return new Promise((risolvi) => {
    const img = new Image();
    img.onload = () => risolvi({ larghezza: img.naturalWidth, altezza: img.naturalHeight });
    img.onerror = () => risolvi(null);
    img.src = url;
  });
}

export function inBase64(file: Blob): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(String(lettore.result).split(",")[1] ?? "");
    lettore.onerror = () => rifiuta(lettore.error);
    lettore.readAsDataURL(file);
  });
}
