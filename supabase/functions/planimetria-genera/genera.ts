// La generazione con l'AI, senza Supabase né rete: la chiamata al modello
// arriva da fuori. La usano la edge function (router AI) e il banco di prova
// (OpenRouter diretto), così si misura esattamente il codice che va online.
//
// Due tentativi al massimo: il risultato passa SEMPRE dal controllo geometrico;
// se non regge, il secondo tentativo riceve gli errori nel prompt; se non regge
// ancora, all'utente arriva una frase semplice, non la pianta rotta.

import { verificaApertureDocumento } from "./verificaAperture.ts";
import type { PiantaGenerata } from "./generazione.ts";
import { controllaGenerata, type ProblemaGenerazione } from "./controlloAI.ts";
import { costruisciPiani, ErroreCostruzione } from "./costruisci.ts";
import { estraiJson, leggiRispostaAI } from "./rispostaAI.ts";
import { controllaScala, controllaSuperfici, pulisciLocali } from "./pulizia.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { PROMPT_DESCRIZIONE, PROMPT_DOCUMENTO, PROMPT_RILIEVO, PROMPT_SCHIZZO, promptCorrezione, promptScalaSospetta } from "./prompt.ts";

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
  ingresso: "documento" | "schizzo" | "descrizione" | "rilievo";
  /** data URL dell'immagine (png/jpeg/webp) oppure del PDF. */
  file?: { dataUrl: string; mime: string; nome?: string; larghezza?: number | null; altezza?: number | null };
  testo?: string;
  /** Un'indicazione dell'utente: «è il piano primo», «la cucina è a destra». */
  nota?: string;
  sorgentePath?: string | null;
  /** Solo «rilievo»: foto delle stanze (data URL di immagini), al massimo sei. */
  foto?: string[];
}

export const MASSIMO_FOTO_RILIEVO = 6;

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
  if (req.ingresso === "rilievo") {
    const parti: ParteContenuto[] = [{ type: "text", text: `Appunti del sopralluogo:\n${(req.testo ?? "").slice(0, 6000)}${nota}` }];
    if (req.file) {
      parti.push({ type: "text", text: "Schizzo fatto sul posto:" });
      parti.push(req.file.mime === "application/pdf"
        ? { type: "file", file: { filename: req.file.nome ?? "schizzo.pdf", file_data: req.file.dataUrl } }
        : { type: "image_url", image_url: { url: req.file.dataUrl } });
    }
    const foto = (req.foto ?? []).slice(0, MASSIMO_FOTO_RILIEVO);
    foto.forEach((url, i) => {
      parti.push({ type: "text", text: `Foto ${i + 1} di ${foto.length} di una stanza:` });
      parti.push({ type: "image_url", image_url: { url } });
    });
    return [{ role: "system", content: conRegoleDocumento(PROMPT_RILIEVO) }, { role: "user", content: parti }];
  }
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

const scartiDaRivedere = (p: PiantaGenerata) => (p.generazione.aperture_da_rivedere ?? 0)
  + (p.generazione.superfici_da_rivedere ?? []).reduce((tot, s) => tot + Math.abs(s.calcolata - s.scritta) / s.scritta, 0);

function conservaSuperficiScritte(prima: PiantaGenerata, dopo: PiantaGenerata): PiantaGenerata {
  const note = new Map(prima.planimetria.livelli.flatMap((l) => l.fatto.locali.map((c) => [`${l.id}|${c.nome.toLowerCase()}`, prima.generazione.superfici_scritte[c.id]] as const)));
  const superfici = { ...dopo.generazione.superfici_scritte };
  let aggiunte = false;
  for (const l of dopo.planimetria.livelli) for (const c of l.fatto.locali) {
    const mq = note.get(`${l.id}|${c.nome.toLowerCase()}`);
    if (!superfici[c.id] && mq) { superfici[c.id] = mq; aggiunte = true; }
  }
  return aggiunte ? controllaScala(controllaSuperfici({ ...dopo, generazione: { ...dopo.generazione, superfici_scritte: superfici } })) : dopo;
}

function leggi(testo: string, req: RichiestaGenerazione): Lettura {
  let grezza: unknown;
  try {
    grezza = estraiJson(testo);
  } catch {
    return { pianta: null, errori: [{ codice: "json", dettaglio: "La risposta non era un JSON valido." }], nonLeggibile: null };
  }
  const letta = leggiRispostaAI(grezza, req.ingresso === "documento" ? "immagine" : "metri");
  const pulita = req.ingresso === "documento" || req.ingresso === "schizzo" ? pulisciLocali(letta) : { risposta: letta, scartati: [] as string[], rinominati: [] as string[] };
  const risposta = pulita.risposta;
  try {
    const costruita = costruisciPiani(risposta, {
      ingresso: req.ingresso,
      larghezzaImmagine: req.file?.larghezza ?? null,
      altezzaImmagine: req.file?.altezza ?? null,
      sorgentePath: req.sorgentePath ?? null,
    });
    const g = req.ingresso === "documento" ? controllaScala(controllaSuperfici(costruita)) : costruita;
    if (pulita.scartati.length) g.generazione.avvisi.push(`Ho tolto dalle stanze ciò che sembrava un arredo: ${pulita.scartati.slice(0, 6).join(", ")}.`);
    if (pulita.rinominati.length) g.generazione.avvisi.push(`Ho dato un nome alle sigle del disegno: ${pulita.rinominati.slice(0, 6).join(", ")}. Controlla che siano giuste.`);
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
  if (req.ingresso === "descrizione" || req.ingresso === "rilievo" ? !req.testo?.trim() : !req.file?.dataUrl) {
    return { ok: false, codice: "ingresso_mancante", messaggio: MESSAGGI_UTENTE.ingresso_mancante, tentativi };
  }
  const ora = opzioni.ora ?? Date.now;
  const inizio = ora();
  const messaggi = messaggiIniziali(req);
  const consegna = async (pianta: PiantaGenerata, providerDisponibile = true): Promise<EsitoGenerazione> => {
    const verifica = await verificaApertureDocumento(pianta, req, chiama, providerDisponibile ? (opzioni.tempoMassimoMs ?? 140_000) - (ora() - inizio) : 0, ora);
    if (verifica.tentativo) tentativi.push(verifica.tentativo);
    const p = verifica.pianta;
    const planimetria = ["documento", "schizzo"].includes(req.ingresso)
      ? { ...p.planimetria, letturaDocumento: { avvisiIniziali: p.generazione.avvisi.slice(0, 100).map((s) => s.slice(0, 4000)), superficiScritteMq: { ...p.generazione.superfici_scritte } } }
      : p.planimetria;
    return { ok: true, pianta: { ...p, planimetria }, tentativi };
  };

  // La migliore lettura con la sola colpa di avere stanze sovrapposte: meglio mostrarla da sistemare a mano
  // che non mostrare niente (bifamiliari speculari, portici sopra i giardini: 02/11/2026).
  let primaSospetta: PiantaGenerata | null = null;
  let daCompletare: PiantaGenerata | null = null;
  let daSistemare: { pianta: PiantaGenerata; dettagli: string[] } | null = null;
  for (let n = 1; n <= 2; n++) {
    const t0 = ora();
    let r: Awaited<ReturnType<ChiamaModello>>;
    try { r = await chiama(messaggi, n); } catch (e) {
      if (daCompletare) return consegna(daCompletare, false);
      throw e;
    }
    const lettura = leggi(r.testo, req);
    if (daCompletare && lettura.pianta) lettura.pianta = conservaSuperficiScritte(daCompletare, lettura.pianta);
    tentativi.push({ modello: r.modello, costoUsd: r.costoUsd ?? 0, durataMs: ora() - t0, errori: lettura.errori.map((e) => e.codice) });
    if (lettura.nonLeggibile) {
      if (daCompletare) return consegna(daCompletare);
      return { ok: false, codice: "non_leggibile", messaggio: MESSAGGI_UTENTE.non_leggibile, tentativi };
    }
    if (lettura.pianta && !lettura.errori.length) {
      // Pianta valida ma scala sospetta: una seconda lettura, se c'è tempo, con l'invito a cercare una misura scritta.
      const sospetta = lettura.pianta.generazione.avvisi.find((a) => a.startsWith("La scala letta dal disegno non sembra giusta"));
      const tempoPerRileggere = !opzioni.tempoMassimoMs || ora() - inizio <= opzioni.tempoMassimoMs / 2;
      const apertureDaRivedere = lettura.pianta.generazione.aperture_da_rivedere ?? 0;
      const superficiDaRivedere = lettura.pianta.generazione.superfici_da_rivedere ?? [];
      if ((apertureDaRivedere > 0 || superficiDaRivedere.length > 0) && n === 1 && tempoPerRileggere) {
        daCompletare = lettura.pianta;
        messaggi.push({ role: "assistant", content: r.testo.slice(0, 30_000) });
        messaggi.push({ role: "user", content: promptCorrezione([
          ...(apertureDaRivedere > 0 ? [`${apertureDaRivedere} porte o finestre non si agganciano ai muri o si sovrappongono. Rileggi il documento: conserva solo le aperture realmente riconoscibili, elimina le ipotesi non visibili e non spostare un simbolo su un muro vicino per farlo tornare. Per le sole aperture confermate metti gli estremi sul loro muro, senza sovrapporre vani diversi. Conserva le stanze e le loro misure.`] : []),
          ...superficiDaRivedere.slice(0, 6).map((s) => `La stanza «${s.nome}» ha ${s.scritta} m² scritti sul foglio ma il contorno produce ${s.calcolata} m². Rileggi il filo interno dei muri e le quote: le dimensioni esterne comprendono lo spessore e non sono quelle interne della stanza. Controlla anche che mobili e sanitari non siano scambiati per finestre.`),
        ]) });
        continue;
      }
      if (daCompletare && scartiDaRivedere(lettura.pianta) >= scartiDaRivedere(daCompletare)) return consegna(daCompletare);
      if (sospetta && n === 1 && tempoPerRileggere) {
        primaSospetta = lettura.pianta;
        messaggi.push({ role: "assistant", content: r.testo.slice(0, 30_000) });
        messaggi.push({ role: "user", content: promptScalaSospetta(sospetta.replace(/^La scala letta dal disegno non sembra giusta: /, "").replace(/\. Scrivi la misura.*$/, "")) });
        continue;
      }
      if (primaSospetta && lettura.pianta.generazione.scala?.da_confermare) return consegna(primaSospetta);
      return consegna(lettura.pianta);
    }
    if (primaSospetta && n === 2) return consegna(primaSospetta);
    if (lettura.pianta && lettura.errori.length > 0 && lettura.errori.length <= 8 && lettura.errori.every((e) => e.codice === "locali_sovrapposti" && e.lieve)) {
      daSistemare = { pianta: lettura.pianta, dettagli: lettura.errori.map((e) => e.dettaglio) };
    }
    // Il secondo tentativo solo se c'è ancora tempo: il gateway chiude a 150 s.
    if (opzioni.tempoMassimoMs && ora() - inizio > opzioni.tempoMassimoMs / 2) break;
    messaggi.push({ role: "assistant", content: r.testo.slice(0, 30_000) });
    messaggi.push({ role: "user", content: promptCorrezione(lettura.errori.map((e) => e.dettaglio).slice(0, 15)) });
  }
  if (daCompletare) return consegna(daCompletare);
  if (daSistemare) {
    const { pianta, dettagli } = daSistemare;
    pianta.generazione.avvisi.push(`${dettagli.length === 1 ? "Una stanza si sovrappone" : `${dettagli.length} coppie di stanze si sovrappongono`} a un'altra: sistemale nell'editor. ${dettagli.slice(0, 3).join(" ")}`);
    return consegna(pianta);
  }
  return { ok: false, codice: "pianta_non_valida", messaggio: MESSAGGI_UTENTE.pianta_non_valida, tentativi };
}
