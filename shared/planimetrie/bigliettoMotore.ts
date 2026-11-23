/**
 * Biglietto del motore planimetrie online (render Cycles e DWG), 23/11/2026.
 *
 * Il motore gira in un container (Blender + LibreDWG) che non vede il database:
 * non sa chi è l'utente né se l'azienda ha credito. Lo decide la funzione
 * `planimetria-motore`, che controlla accesso e permesso, scala il credito
 * render e rilascia questo biglietto firmato (HMAC-SHA256 con un segreto che
 * conoscono solo lei e il container). Il container accetta un biglietto una
 * volta sola, prima della scadenza, per l'operazione scritta dentro.
 *
 * Se il render non riesce, il container richiama la funzione con lo stesso
 * biglietto e un esito firmato: la funzione restituisce il credito.
 *
 * Solo WebCrypto: lo usano Deno (edge), Node 24 (container) e i test.
 */

export const OPERAZIONI_MOTORE = ["render", "dwg", "dwg-modello"] as const;
export type OperazioneMotore = typeof OPERAZIONI_MOTORE[number];

export type Biglietto = {
  /** Identificativo unico: è anche la sessione del credito render. */
  id: string;
  azienda: string;
  utente: string;
  operazione: OperazioneMotore;
  /** Scadenza in millisecondi dall'epoca. */
  scade: number;
  /** true se per questo biglietto è stato scalato un credito render. */
  addebitato: boolean;
};

export const DURATA_BIGLIETTO_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const codifica = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function daBase64url(testo: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(testo)) return null;
  try {
    const s = atob(testo.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - testo.length % 4) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function chiave(segreto: string): Promise<CryptoKey> {
  if (segreto.length < 32) throw new Error("Segreto del motore troppo corto (almeno 32 caratteri).");
  return crypto.subtle.importKey("raw", codifica.encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Firma un testo qualunque (il biglietto, o l'esito che il container manda indietro). */
export async function firma(segreto: string, testo: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await chiave(segreto), codifica.encode(testo));
  return base64url(new Uint8Array(sig));
}

/** Confronto a tempo costante tramite verify di WebCrypto. */
export async function firmaValida(segreto: string, testo: string, firmaB64: string): Promise<boolean> {
  const sig = daBase64url(firmaB64);
  if (!sig || sig.length !== 32) return false;
  return crypto.subtle.verify("HMAC", await chiave(segreto), sig, codifica.encode(testo));
}

export function bigliettoValido(b: unknown): b is Biglietto {
  const x = b as Partial<Biglietto> | null;
  return !!x && typeof x === "object"
    && typeof x.id === "string" && UUID.test(x.id)
    && typeof x.azienda === "string" && UUID.test(x.azienda)
    && typeof x.utente === "string" && UUID.test(x.utente)
    && OPERAZIONI_MOTORE.includes(x.operazione as OperazioneMotore)
    && typeof x.scade === "number" && Number.isFinite(x.scade)
    && typeof x.addebitato === "boolean";
}

export async function emettiBiglietto(segreto: string, b: Biglietto): Promise<string> {
  if (!bigliettoValido(b)) throw new Error("Biglietto non valido.");
  const corpo = base64url(codifica.encode(JSON.stringify(b)));
  return `${corpo}.${await firma(segreto, corpo)}`;
}

export type EsitoLettura =
  | { ok: true; biglietto: Biglietto }
  | { ok: false; motivo: "formato" | "firma" | "scaduto" | "operazione" };

/** Legge e verifica un biglietto. `adesso` e `operazione` servono a scadenza e uso giusto. */
export async function leggiBiglietto(segreto: string, token: string, opzioni: { adesso: number; operazione?: OperazioneMotore }): Promise<EsitoLettura> {
  const parti = token.split(".");
  if (parti.length !== 2 || parti[0].length > 2000) return { ok: false, motivo: "formato" };
  if (!(await firmaValida(segreto, parti[0], parti[1]))) return { ok: false, motivo: "firma" };
  const bytes = daBase64url(parti[0]);
  let dati: unknown;
  try { dati = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null; } catch { dati = null; }
  if (!bigliettoValido(dati)) return { ok: false, motivo: "formato" };
  if (dati.scade < opzioni.adesso) return { ok: false, motivo: "scaduto" };
  if (opzioni.operazione && dati.operazione !== opzioni.operazione) return { ok: false, motivo: "operazione" };
  return { ok: true, biglietto: dati };
}

/** Il testo che il container firma per dire com'è andata: lega l'esito al biglietto. */
export const testoEsito = (token: string, esito: "riuscito" | "fallito") => `esito:${esito}:${token}`;
