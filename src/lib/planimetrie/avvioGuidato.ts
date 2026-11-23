import type { FieldDefinition, SurveyAreaRow } from "@/types/surveys";
import { costruisciPiani, quotaDalNome } from "../../../supabase/functions/planimetria-genera/costruisci.ts";
import { destinazioneDa, type LocaleAI } from "../../../supabase/functions/planimetria-genera/rispostaAI.ts";

export type AmbienteGuida = { nome: string; superficieMq: number; larghezzaM?: number; profonditaM?: number; altezzaM?: number; piano?: string };
const PIANO_TERRA = "Piano terra";
const ORDINALI = ["", "Primo", "Secondo", "Terzo", "Quarto", "Quinto"];

function intestazionePiano(testo: string) {
  const nome = testo.trim().replace(/^#{1,4}\s*/, "").replace(/[:.]$/, "").trim().toLowerCase();
  if (/^(?:piano )?terra$/.test(nome)) return PIANO_TERRA;
  if (/^(?:piano )?(?:interrato|seminterrato)$/.test(nome)) return nome.includes("seminterrato") ? "Seminterrato" : "Piano interrato";
  if (/^(?:piano )?(?:secondo interrato|sottotetto|mansarda)$/.test(nome)) {
    const base = nome.replace(/^piano /, "");
    return base[0].toUpperCase() + base.slice(1);
  }
  const ordinale = ORDINALI.findIndex((n, i) => i > 0 && (nome === `${n.toLowerCase()} piano` || nome === `piano ${n.toLowerCase()}`));
  if (ordinale > 0) return `${ORDINALI[ordinale]} piano`;
  const numero = nome.match(/^piano\s+(-?\d{1,2})$/)?.[1];
  if (numero === undefined) return undefined;
  const numeroPiano = Number(numero);
  return numeroPiano === 0 ? PIANO_TERRA : ORDINALI[numeroPiano] ? `${ORDINALI[numeroPiano]} piano` : `Piano ${numeroPiano}`;
}

export function chiaveAmbienteGuida(ambiente: Pick<AmbienteGuida, "nome" | "piano">) {
  return `${ambiente.piano ?? PIANO_TERRA}/${ambiente.nome.toLocaleLowerCase("it-IT")}`;
}

const CIFRE = String.raw`\d{1,4}(?:[.,]\d{1,3})?`;
const LATO = String.raw`(${CIFRE})(?:\s*(mm|cm|m)(?![\w²]))?`;
const LATI = new RegExp(String.raw`${LATO}\s*(?:[×x]|\bper\b)\s*${LATO}`, "i");
const AREA = new RegExp(String.raw`(${CIFRE})\s*(?:m²|m2|m\s*q\b|metri\s+quadrat[io])`, "i");
const ALTEZZA = new RegExp(String.raw`\baltezza(?:\s+(?:del\s+soffitto|netta|interna))?\s*(?:di|è|:|=)?\s*${LATO}`, "i");
const TIPI_AMBIENTE = String.raw`\b(?:soggiorno|cucina|cucinino|camera|cameretta|bagno|wc|ingresso|disimpegno|corridoio|ripostiglio|lavanderia|sala|studio|taverna|tavernetta|mansarda|sottotetto|garage|autorimessa|cantina|terrazzo|balcone|ufficio|locale|stanza|capannone|magazzino|laboratorio|negozio|kitchen|living room|family room|bedroom|bathroom)\b`;
const NOME_AMBIENTE = new RegExp(TIPI_AMBIENTE, "i");
// Anche il punto a fine frase separa: «… disimpegno 3 × 1,2 m. Altezza 2,70 m.» è
// un'altezza di tutta la casa, non del disimpegno (23/11/2026). I decimali col
// punto («3.20») non hanno lo spazio dopo e restano interi.
const SEPARATORE_AMBIENTI = new RegExp(String.raw`[;\n]+|\.\s+|[:,]\s*(?=(?:il |la |un |una )?${TIPI_AMBIENTE})`, "i");
const QUOTE_DI_ELEMENTI = /\b(?:porta|finestra|portafinestra|parete|altezza|infisso|serramento)\b/i;
const FINE_NOME = /(?:[\s:=-]+|\s+(?:misura|misurano|di|da|circa|larga|lungo|è|invece|ora|in realtà))+$/iu;

function numero(v: unknown) {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).trim().replace(",", ".");
  if (!s || !/^\d+(?:\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function metri(v: unknown, unita: string = "m") {
  const n = numero(v);
  return n === undefined ? undefined : n / (unita === "mm" ? 1000 : unita === "cm" ? 100 : 1);
}

function ambiente(nome: string, superficie: number | undefined, larghezza: number | undefined, profondita: number | undefined, altezza: number | undefined): AmbienteGuida | null {
  const haLati = larghezza !== undefined && profondita !== undefined && larghezza >= 0.5 && profondita >= 0.5 && larghezza <= 200 && profondita <= 200;
  const mq = haLati ? larghezza * profondita : superficie;
  if (!nome.trim() || mq === undefined || mq < 0.5 || mq > 40_000) return null;
  return { nome: nome.trim().slice(0, 80), superficieMq: mq, ...(haLati ? { larghezzaM: larghezza, profonditaM: profondita } : {}),
    ...(altezza && altezza > 1.5 && altezza <= 15 ? { altezzaM: altezza } : {}) };
}

/** Interpreta solo le coppie di lati o le superfici attribuite a un locale. */
export function ambientiDaAppunti(testo: string): AmbienteGuida[] {
  const ambienti = new Map<string, AmbienteGuida>();
  const righe: { riga: string; piano?: string }[] = [];
  const altezze = new Map<string, RegExpMatchArray>();
  let pianoCorrente: string | undefined;
  for (const riga of testo.split(SEPARATORE_AMBIENTI)) {
    const intestazione = intestazionePiano(riga);
    if (intestazione) { pianoCorrente = intestazione; continue; }
    const altezza = /^altezza\b/i.test(riga.trim()) ? riga.match(ALTEZZA) : null;
    if (altezza) altezze.set(pianoCorrente ?? PIANO_TERRA, altezza);
    righe.push({ riga, piano: pianoCorrente });
  }
  for (const { riga, piano } of righe) {
    const nomeInizia = riga.search(NOME_AMBIENTE);
    if (nomeInizia < 0 || QUOTE_DI_ELEMENTI.test(riga.slice(0, nomeInizia))) continue;
    const appunto = riga.slice(nomeInizia);
    const lati = appunto.match(LATI);
    const area = appunto.match(AREA);
    const usaArea = area && (!lati || area.index! < lati.index!);
    const misura = usaArea ? area : lati;
    if (misura?.index === undefined) continue;
    const testoNome = appunto.slice(0, misura.index);
    const nome = testoNome.replace(FINE_NOME, "").replace(/\s+a$/u, "");
    if (!nome || QUOTE_DI_ELEMENTI.test(nome)) continue;
    const altezza = appunto.match(ALTEZZA) ?? altezze.get(piano ?? PIANO_TERRA);
    const a = ambiente(nome, usaArea ? numero(area[1]) : undefined,
      !usaArea && lati ? metri(lati[1], lati[2] ?? lati[4]) : undefined, !usaArea && lati ? metri(lati[3], lati[4] ?? lati[2]) : undefined,
      altezza ? metri(altezza[1], altezza[2]) : undefined);
    if (a) {
      if (piano) a.piano = piano;
      const chiave = chiaveAmbienteGuida(a);
      const esistente = ambienti.get(chiave);
      ambienti.set(chiave, { ...a, nome: esistente?.nome ?? a.nome, altezzaM: a.altezzaM ?? esistente?.altezzaM });
    }
  }
  return [...ambienti.values()];
}

/** I modelli esistenti registrano «mq» e spesso l'altezza in centimetri. */
export function ambientiDaAreeSalvate(aree: SurveyAreaRow[], campi: FieldDefinition[], tipoArea?: string): AmbienteGuida[] {
  // Una falda o un prospetto appartiene al rilievo, ma non è una stanza della pianta.
  if (tipoArea && /\b(?:falda|copertura|facciata|prospetto|pendenza)\b/i.test(tipoArea)) return [];
  const leggi = (dati: Record<string, unknown>, chiavi: string[], lunghezza: boolean) => {
    for (const chiave of chiavi) {
      const unita = campi.find((f) => f.key === chiave)?.unit;
      const valore = lunghezza ? metri(dati[chiave], unita ?? (chiave.endsWith("_cm") ? "cm" : chiave.endsWith("_mm") ? "mm" : "m")) : numero(dati[chiave]);
      if (valore !== undefined) return valore;
    }
    return undefined;
  };
  return aree.flatMap((area) => {
    const dati = area.area_data ?? {};
    const piano = typeof dati.piano === "string" ? intestazionePiano(dati.piano) : undefined;
    const dallaScheda = ambiente(area.name,
      leggi(dati, ["mq", "superficie_mq", "superficie", "area_mq"], false),
      leggi(dati, ["larghezza_m", "larghezza_stanza", "larghezza", "larghezza_cm", "larghezza_mm"], true),
      leggi(dati, ["profondita_m", "lunghezza_m", "profondita", "lunghezza", "profondita_cm", "lunghezza_cm"], true),
      leggi(dati, ["altezza_m", "altezza_soffitto", "altezza", "altezza_cm", "altezza_mm"], true));
    if (dallaScheda) return [{ ...dallaScheda, ...(piano ? { piano } : {}) }];
    const appunti = [area.notes, area.audio_transcription].filter(Boolean).join("\n");
    return ambientiDaAppunti(appunti).filter((a) => a.nome.toLocaleLowerCase("it-IT") === area.name.trim().toLocaleLowerCase("it-IT"));
  });
}

export function bozzaDaAmbienti(ambienti: AmbienteGuida[], origine: "testo" | "sopralluogo", note?: string) {
  if (!ambienti.length) throw new Error("Indica due lati o la superficie di almeno una stanza.");
  const piani = new Map<string, AmbienteGuida[]>();
  for (const a of ambienti) {
    const piano = a.piano ?? PIANO_TERRA;
    const stanze = piani.get(piano) ?? [];
    stanze.push(a);
    piani.set(piano, stanze);
  }
  const locali: LocaleAI[] = [...piani].flatMap(([piano, stanze]) => {
    const colonne = Math.ceil(Math.sqrt(stanze.length));
    let x = 0, y = 0, profonditaRiga = 0;
    return stanze.map((a, indice): LocaleAI => {
      if (indice > 0 && indice % colonne === 0) { x = 0; y += profonditaRiga + 0.2; profonditaRiga = 0; }
      const w = a.larghezzaM ?? Math.sqrt(a.superficieMq);
      const h = a.profonditaM ?? a.superficieMq / w;
      const contorno: LocaleAI["contorno"] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      x += w + 0.2;
      profonditaRiga = Math.max(profonditaRiga, h);
      return { piano, nome: a.nome, destinazione: destinazioneDa(null, a.nome), superficie_scritta_mq: a.superficieMq,
        altezza_scritta_m: a.altezzaM ?? null, misure_lette: false, contorno };
    });
  });
  const { planimetria } = costruisciPiani({ sistema: "metri", leggibile: true, motivo_non_leggibile: null, altezza_m: null,
    locali, aperture: [], quote: [] }, { ingresso: origine === "sopralluogo" ? "rilievo" : "descrizione" });
  if (piani.size === 1) planimetria.livelli[0].nome = locali[0].piano ?? PIANO_TERRA;
  planimetria.livelli.forEach((livello, indice) => {
    const quotaDichiarata = livello.nome.match(/^Piano (-?\d+)$/)?.[1];
    livello.quota = quotaDichiarata === undefined ? quotaDalNome(livello.nome, indice, piani.size) : Number(quotaDichiarata) * 300;
    if (origine !== "sopralluogo") return;
    const stanze = piani.get(livello.nome) ?? [];
    livello.fatto.locali.forEach((locale, i) => {
      const a = stanze[i];
      if (!a) return;
      locale.origineMisure = { ...locale.origineMisure,
        ...(a.larghezzaM && a.profonditaM ? { larghezza: "rilevata", profondita: "rilevata" } : {}),
        ...(a.altezzaM ? { altezza: "rilevata" } : {}) };
    });
  });
  planimetria.livelli.sort((a, b) => a.quota - b.quota);
  if (note?.trim()) planimetria.riferimenti = { ...planimetria.riferimenti, note: note.trim().slice(0, 6000) };
  return planimetria;
}
