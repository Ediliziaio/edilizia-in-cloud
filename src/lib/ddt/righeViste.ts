/**
 * Le righe di merce che il telefono vede sul foglio, senza AI (25/11/2026).
 *
 * Nasce da un difetto: su otto letture della stessa bolla, una ha reso tre righe
 * su quattro con `warnings` vuoto e confidenza 0,95 — in ufficio arrivava una
 * bolla che sembrava completa. La risposta NON è una seconda chiamata al modello:
 * il testo lo ha già letto il telefono con l'OCR del sistema operativo, che non
 * costa niente. Quindi qui si fa tutto con delle regole:
 *
 *  · `righeArticoloViste` — quali righe del foglio sono righe di merce. Prudente
 *    per scelta: conta solo quelle che hanno insieme descrizione, unità di misura
 *    e quantità, perché un avviso di troppo fa perdere fiducia a chi controlla.
 *  · `righeNonRese` — quali di quelle righe non si ritrovano in ciò che l'AI ha
 *    reso, confrontando il codice articolo e le parole della descrizione.
 *  · `rigaDaRigaVista` — la riga pronta da aggiungere alla bolla, con quantità e
 *    unità ricavate dalla stessa riga di testo. Nasce `manuale`: la scrive una
 *    regola, non il modello, e in ufficio si corregge come ogni riga a mano.
 */
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import { rigaBollaVuota } from "./righeBolla";

/** Quante righe viste si portano dietro il documento: bastano per accorgersi del buco. */
export const MAX_RIGHE_VISTE = 40;
export const MAX_TESTO_RIGA = 140;

const UNITA_RIGA = /(?:^|[\s|])(pz|nr|cad|m|ml|mq|mc|m2|m3|kg|ton|q(?:li)?|lt|l|cf|sc|rt|bc|bancal[ei]|pallet|ore|h)(?=[\s|]|$)/i;
const QUANTITA_RIGA = /(?:^|[\s|])(\d{1,3}(?:\.\d{3})*(?:,\d{1,3})?)(?=[\s|]|$)/;
const QUANTITA_TUTTE = new RegExp(QUANTITA_RIGA.source, "g");
const RIGA_NON_MERCE = /\b(?:cod(?:ice)?\b.*\bdescrizione|descrizione\b.*\bu\.?\s*m\.?|q\.?\s*t[aà]\b.*\bprezzo|colli|peso\s+(?:lordo|netto)|porto|totale|imponibile|iva\b|p\.?\s*iva|cod(?:ice)?\s+fiscale|tel\.?\b|e-?mail|causale|vettore|mittente|destinatario|luogo\s+di\s+consegna|data\s+(?:documento|ddt|trasporto|consegna)|firma|pagina|segue|cap\b)/i;
const CODICE_INIZIALE = /^([\p{L}\d][\p{L}\d._/-]{2,23})(?=\s)/u;

function unaRiga(grezza: string): string {
  return grezza.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TESTO_RIGA);
}

function eRigaDiMerce(riga: string): boolean {
  if (riga.length < 8 || RIGA_NON_MERCE.test(riga)) return false;
  // Una riga di merce ha una descrizione, un'unità di misura e una quantità.
  return /\p{L}{3}/u.test(riga) && UNITA_RIGA.test(riga) && QUANTITA_RIGA.test(riga);
}

/** Il testo delle righe di merce, nell'ordine in cui stanno sul foglio. */
export function righeArticoloViste(pagine: readonly string[]): string[] {
  const viste: string[] = [];
  for (const testo of pagine) {
    for (const grezza of testo.slice(0, 20000).normalize("NFKC").split(/\r?\n/)) {
      const riga = unaRiga(grezza);
      if (eRigaDiMerce(riga)) viste.push(riga);
    }
  }
  return viste;
}

export function contaRigheArticolo(pagine: readonly string[]): number {
  return righeArticoloViste(pagine).length;
}

/** Il conteggio riletto dalla coda o dall'archivio: un intero plausibile, o niente. */
export function righeTelefonoValide(valore: unknown): number | undefined {
  return typeof valore === "number" && Number.isInteger(valore) && valore > 0 && valore <= 200
    ? valore
    : undefined;
}

/** Le righe viste rilette dalla coda o dall'archivio: testo ripulito e tagliato. */
export function righeVisteValide(valore: unknown): string[] | undefined {
  if (!Array.isArray(valore)) return undefined;
  const righe: string[] = [];
  for (const grezza of valore) {
    if (typeof grezza !== "string") continue;
    const riga = unaRiga(grezza);
    if (riga) righe.push(riga);
    if (righe.length >= MAX_RIGHE_VISTE) break;
  }
  return righe.length ? righe : undefined;
}

function normalizza(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("it")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Le righe viste sul foglio che non si ritrovano in quelle rese dall'AI.
 *
 * Il codice articolo decide in entrambi i versi: se c'è su tutte e due ed è lo
 * stesso è la stessa riga anche con la descrizione storpiata dall'OCR; se è
 * diverso non lo è, nemmeno quando le descrizioni si assomigliano (lo stesso
 * tubo in due misure). Senza codice si guardano le parole: basta che metà di
 * quelle della riga più povera si ritrovi nell'altra, perché segnalare per
 * sbaglio una riga già resa porta chi controlla ad aggiungerla due volte.
 */
export function righeNonRese(
  viste: readonly string[],
  rese: ReadonlyArray<{ codice_articolo?: string | null; descrizione?: string | null }>,
): string[] {
  const impronte = rese.map((r) => ({
    codice: codiceConfrontabile(r.codice_articolo ?? ""),
    parole: paroleUtili(r.descrizione ?? ""),
  }));
  return viste.filter((vista) => {
    const codiceVista = codiceConfrontabile(CODICE_INIZIALE.exec(unaRiga(vista))?.[1] ?? "");
    const paroleVista = paroleUtili(vista);
    return !impronte.some(({ codice, parole }) => {
      if (codice && codiceVista) return codice === codiceVista;
      if (!parole.length || !paroleVista.length) return false;
      const comuni = parole.filter((p) => paroleVista.includes(p)).length;
      return comuni > 0 && comuni / Math.min(parole.length, paroleVista.length) >= 0.5;
    });
  });
}

/** Il codice come lo si confronta: solo se ha una cifra, altrimenti è la prima parola. */
function codiceConfrontabile(valore: string): string {
  const codice = normalizza(valore).replace(/ /g, "");
  return /\d/.test(codice) && codice.length >= 3 ? codice : "";
}

function paroleUtili(testo: string): string[] {
  return [...new Set(normalizza(testo).split(" ").filter((p) => p.length >= 4))];
}

function numeroItaliano(testo: string): number | null {
  const n = Number(testo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** La quantità è il numero più vicino all'unità di misura: «ml 120», o «120 ml». */
function quantitaVicinoAUnita(testo: string, indiceUnita: number): number | null {
  let scelta: { valore: string; distanza: number } | null = null;
  for (const trovata of testo.matchAll(QUANTITA_TUTTE)) {
    const indice = (trovata.index ?? 0) + trovata[0].length - trovata[1].length;
    const distanza = Math.abs(indice - indiceUnita);
    if (!scelta || distanza < scelta.distanza) scelta = { valore: trovata[1], distanza };
  }
  return scelta ? numeroItaliano(scelta.valore) : null;
}

/** La riga pronta da aggiungere alla bolla, ricavata dal solo testo del foglio. */
export function rigaDaRigaVista(linea: string, posizione: number): DDTRigaNuova {
  const testo = unaRiga(linea);
  const unita = UNITA_RIGA.exec(testo);
  const indiceUnita = unita ? (unita.index ?? 0) + unita[0].length - unita[1].length : testo.length;
  const codice = CODICE_INIZIALE.exec(testo)?.[1];
  const conCodice = codice && /\d/.test(codice) ? codice : undefined;
  const senzaCodice = conCodice ? testo.slice(conCodice.length).trim() : testo;
  const descrizione = senzaCodice.slice(0, Math.max(0, indiceUnita - (conCodice ? conCodice.length + 1 : 0)))
    .replace(/[\s|.:;-]+$/u, "")
    .trim();
  return {
    ...rigaBollaVuota(posizione),
    codice_articolo: descrizione ? conCodice ?? null : null,
    descrizione: descrizione || senzaCodice || testo,
    unita_misura: unita ? unita[1].toLocaleLowerCase("it") : null,
    quantita: unita ? quantitaVicinoAUnita(testo, indiceUnita) : null,
    testo_grezzo: testo,
  };
}
