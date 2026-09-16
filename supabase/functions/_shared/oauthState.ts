/**
 * State OAuth firmato per i collegamenti dei calendari (Google, Outlook).
 *
 * Prima lo state era base64 del JSON {userId, companyId, appOrigin}, senza
 * firma: chiunque poteva completare il ritorno con il proprio `code` e uno
 * state con l'utente di un altro, e il SUO account Google/Microsoft finiva
 * collegato al calendario della vittima (che riceveva poi gli appuntamenti del
 * CRM su un calendario altrui). Ora lo state è `payload.firma` con HMAC-SHA256
 * lato server e scade dopo 15 minuti.
 */
import { origineAmmessa } from "./headers.ts";

const encoder = new TextEncoder();
const DURATA_MS = 15 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function daB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function firma(testo: string): Promise<string> {
  const segreto = Deno.env.get("OAUTH_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!segreto) throw new Error("segreto per lo state OAuth assente");
  const chiave = await crypto.subtle.importKey("raw", encoder.encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", chiave, encoder.encode(testo))));
}

function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StateCalendario {
  userId: string;
  companyId: string;
  appOrigin?: string;
  ts: number;
}

export async function creaStateFirmato(dati: { userId: string; companyId: string; appOrigin?: string }): Promise<string> {
  const appOrigin = dati.appOrigin && origineAmmessa(dati.appOrigin) ? dati.appOrigin : undefined;
  const payload = b64url(encoder.encode(JSON.stringify({ ...dati, appOrigin, ts: Date.now(), n: crypto.randomUUID() })));
  return `${payload}.${await firma(payload)}`;
}

/** Ritorna lo state se la firma è valida e non è scaduto; altrimenti null. */
export async function leggiStateFirmato(state: string): Promise<StateCalendario | null> {
  const [payload, sig, extra] = state.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  if (!uguali(sig, await firma(payload))) return null;
  let dati: StateCalendario;
  try {
    dati = JSON.parse(new TextDecoder().decode(daB64url(payload)));
  } catch {
    return null;
  }
  if (!dati?.userId || !dati?.companyId || typeof dati.ts !== "number") return null;
  if (Date.now() - dati.ts > DURATA_MS) return null;
  if (dati.appOrigin && !origineAmmessa(dati.appOrigin)) dati.appOrigin = undefined;
  return dati;
}
