// La generazione con l'AI, senza Supabase né rete: la chiamata al modello
// arriva da fuori. La usano la edge function (router AI) e il banco di prova
// (OpenRouter diretto), così si misura esattamente il codice che va online.
//
// Due tentativi al massimo: il risultato passa SEMPRE dal controllo geometrico;
// se non regge, il secondo tentativo riceve gli errori nel prompt; se non regge
// ancora, all'utente arriva una frase semplice, non la pianta rotta.

import type { PiantaGenerata } from "./generazione.ts";
import { controllaGenerata, type ProblemaGenerazione } from "./controlloAI.ts";
import { costruisciPlanimetria, ErroreCostruzione } from "./costruisci.ts";
import { estraiJson, leggiRispostaAI } from "./rispostaAI.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { PROMPT_DESCRIZIONE, PROMPT_DOCUMENTO, PROMPT_SCHIZZO, promptCorrezione } from "./prompt.ts";

export type ParteContenuto =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface Messaggio {
  role: "system" | "user" | "assistant";
  content: string | ParteContenuto[];
}

export interface RispostaModello {
  testo: string;
  modello: string;
  costoUsd?: number;
}

export type ChiamaModello = (messaggi: Messaggio[], tentativo: number) => Promise<RispostaModello>;

export interface RichiestaGenerazione {
  ingresso: "documento" | "schizzo" | "descrizione";
  /** data URL dell'immagine (png/jpeg/webp) oppure del PDF. */
  file?: { dataUrl: string; mime: string; nome?: string; larghezza?: number | null; altezza?: number | null };
  testo?: string;
  /** Un'indicazione dell'utente: «è il piano primo», «la cucina è a destra». */
  nota?: string;
  sorgentePath?: string | null;
}

export interface Tentativo {
  modello: string;
  costoUsd: number;
  durataMs: number;
  errori: string[];
}

export type EsitoGenerazione =
  | { ok: true; pianta: PiantaGenerata; tentativi: Tentativo[] }
  | { ok: false; codice: "non_leggibile" | "pianta_non_valida" | "ingresso_mancante"; messaggio: string; tentativi: Tentativo[] };

export const MESSAGGI_UTENTE = {
  non_leggibile: "Da questo file non riesco a leggere una pianta. Prova con una foto più nitida e dritta, o con il PDF originale.",
  pianta_non_valida: "Non sono riuscito a ricavare una pianta pulita da questo file. Puoi riprovare, oppure partire disegnando le stanze a mano.",
  ingresso_mancante: "Manca il file o la descrizione da cui partire.",
};

export function messaggiIniziali(req: RichiestaGenerazione): Messaggio[] {
  const system = req.ingresso === "documento" ? PROMPT_DOCUMENTO : req.ingresso === "schizzo" ? PROMPT_SCHIZZO : PROMPT_DESCRIZIONE;
  const nota = req.nota?.trim() ? `\nIndicazione di chi ha caricato il file: ${req.nota.trim().slice(0, 500)}` : "";
  if (req.ingresso === "descrizione") {
    return [{ role: "system", content: conRegoleDocumento(system) }, { role: "user", content: `Descrizione dell'appartamento:\n${(req.testo ?? "").slice(0, 3000)}${nota}` }];
  }
  const f = req.file!;
  const allegato: ParteContenuto = f.mime === "application/pdf"
    ? { type: "file", file: { filename: f.nome ?? "pianta.pdf", file_data: f.dataUrl } }
    : { type: "image_url", image_url: { url: f.dataUrl } };
  const istruzione = req.ingresso === "documento"
    ? "Ricalca questa pianta nel formato JSON richiesto."
    : "Trasforma questo schizzo nel formato JSON richiesto.";
  return [{ role: "system", content: conRegoleDocumento(system) }, { role: "user", content: [{ type: "text", text: istruzione + nota }, allegato] }];
}

interface Lettura {
  pianta: PiantaGenerata | null;
  errori: ProblemaGenerazione[];
  nonLeggibile: string | null;
}

function leggi(testo: string, req: RichiestaGenerazione): Lettura {
  let grezza: unknown;
  try {
    grezza = estraiJson(testo);
  } catch {
    return { pianta: null, errori: [{ codice: "json", dettaglio: "La risposta non era un JSON valido." }], nonLeggibile: null };
  }
  const risposta = leggiRispostaAI(grezza, req.ingresso === "documento" ? "immagine" : "metri");
  try {
    const g = costruisciPlanimetria(risposta, {
      ingresso: req.ingresso,
      larghezzaImmagine: req.file?.larghezza ?? null,
      altezzaImmagine: req.file?.altezza ?? null,
      sorgentePath: req.sorgentePath ?? null,
    });
    return { pianta: g, errori: controllaGenerata(g.planimetria), nonLeggibile: null };
  } catch (e) {
    if (e instanceof ErroreCostruzione && e.codice === "non_leggibile") return { pianta: null, errori: [], nonLeggibile: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    return { pianta: null, errori: [{ codice: "costruzione", dettaglio: msg }], nonLeggibile: null };
  }
}

export async function generaPlanimetria(
  req: RichiestaGenerazione,
  chiama: ChiamaModello,
  opzioni: { tempoMassimoMs?: number; ora?: () => number } = {},
): Promise<EsitoGenerazione> {
  const tentativi: Tentativo[] = [];
  if (req.ingresso === "descrizione" ? !req.testo?.trim() : !req.file?.dataUrl) {
    return { ok: false, codice: "ingresso_mancante", messaggio: MESSAGGI_UTENTE.ingresso_mancante, tentativi };
  }
  const ora = opzioni.ora ?? Date.now;
  const inizio = ora();
  const messaggi = messaggiIniziali(req);

  for (let n = 1; n <= 2; n++) {
    const t0 = ora();
    const r = await chiama(messaggi, n);
    const lettura = leggi(r.testo, req);
    tentativi.push({ modello: r.modello, costoUsd: r.costoUsd ?? 0, durataMs: ora() - t0, errori: lettura.errori.map((e) => e.codice) });
    if (lettura.nonLeggibile) {
      return { ok: false, codice: "non_leggibile", messaggio: MESSAGGI_UTENTE.non_leggibile, tentativi };
    }
    if (lettura.pianta && !lettura.errori.length) {
      return { ok: true, pianta: lettura.pianta, tentativi };
    }
    // Il secondo tentativo solo se c'è ancora tempo: il gateway chiude a 150 s.
    if (opzioni.tempoMassimoMs && ora() - inizio > opzioni.tempoMassimoMs / 2) break;
    messaggi.push({ role: "assistant", content: r.testo.slice(0, 30_000) });
    messaggi.push({ role: "user", content: promptCorrezione(lettura.errori.map((e) => e.dettaglio).slice(0, 15)) });
  }
  return { ok: false, codice: "pianta_non_valida", messaggio: MESSAGGI_UTENTE.pianta_non_valida, tentativi };
}
