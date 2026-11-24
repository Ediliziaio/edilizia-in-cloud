import { CAD_MAX_BYTES, cadSignature } from "@/lib/preventivi/quoteCad";
import { MASSIMO_DOCUMENTO_BYTES } from "./documentoImmagine";
import { leggiPropostaPianiDwg, leggiQuoteDwg, rettangoloDwgValido, unitaDwgValida, type RiferimentoDwg, type RichiestaModelloDwg } from "./coordinateDwg";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { chiamaMotoreOnline, motoreOnlineAttivo } from "./motoreOnline";

export const eDwg = (file: Pick<File, "name">) => /\.dwg$/i.test(file.name);
export type LetturaDwg = { file: File; riferimento: RiferimentoDwg | null };
type PosizioneTavola = {
  origine: [number, number];
  larghezza: number;
  altezza: number;
  allineamento: "primo" | "ritaglio" | "assi" | "pareti";
  contorniDaVerificare?: number;
  scaleDaVerificare?: number;
};
export type ModelloDwg = { documento: Planimetria; piani: PosizioneTavola[] };

export function dwgLocaleDisponibile() {
  return import.meta.env.DEV
    && import.meta.env.VITE_PLANIMETRIE_DWG_LOCALE === "1"
    && typeof location !== "undefined"
    && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

/** Il DWG si può leggere: dal Mac con LibreDWG o dal motore online (gratis). */
export function dwgDisponibile() {
  return dwgLocaleDisponibile() || motoreOnlineAttivo();
}

type OpzioniDwg = { companyId?: string | null };

export function erroreDwg(file: File) {
  if (!dwgDisponibile()) return "L’importazione DWG non è ancora attiva. Qui puoi caricare un PDF della tavola.";
  if (file.size > CAD_MAX_BYTES) return "Il DWG supera 64 MB. Esporta la singola tavola in PDF.";
  if (file.size < 6) return "Il file DWG è vuoto o incompleto.";
  return null;
}

async function erroreRisposta(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch((): null => null) as { error?: unknown } | null;
  return new Error(typeof body?.error === "string" ? body.error : fallback);
}

function riferimentoDwg(header: string | null): RiferimentoDwg | null {
  if (!header) return null;
  try {
    const dato = JSON.parse(header) as { unita?: unknown; rettangolo?: unknown; quote?: unknown; pianiProposti?: unknown } | null;
    const proposta = leggiPropostaPianiDwg(dato?.pianiProposti);
    return rettangoloDwgValido(dato?.rettangolo)
      ? { unita: unitaDwgValida(dato?.unita) ? dato.unita : null, rettangolo: dato.rettangolo, quote: leggiQuoteDwg(dato.quote), ...(proposta && { pianiProposti: proposta }) }
      : null;
  } catch { return null; }
}

export async function leggiTavolaDwg(file: File, signal: AbortSignal, opzioni: OpzioniDwg = {}): Promise<LetturaDwg> {
  const errore = erroreDwg(file);
  if (errore) throw new Error(errore);
  const magic = new Uint8Array(await file.slice(0, 6).arrayBuffer());
  if (!cadSignature(magic)) throw new Error("Il contenuto del file non è un DWG supportato.");
  signal.throwIfAborted();
  const headers = { "Content-Type": "application/octet-stream" };
  const response = dwgLocaleDisponibile()
    ? await fetch("/__planimetrie-lab/dwg", { method: "POST", headers, body: file, signal, credentials: "omit", redirect: "error" })
    : await chiamaMotoreOnline(opzioni.companyId, "dwg", "/dwg", { body: file, headers, signal });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png") {
    throw await erroreRisposta(response, "Anteprima DWG non disponibile. Puoi caricare un PDF della tavola.");
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > MASSIMO_DOCUMENTO_BYTES) throw new Error("L’anteprima DWG non rientra nei limiti.");
  return {
    file: new File([blob], file.name.replace(/\.dwg$/i, ".png"), { type: "image/png" }),
    riferimento: riferimentoDwg(response.headers.get("X-Planimetria-Dwg")),
  };
}

export async function ricostruisciModelloDwg(file: File, richiesta: RichiestaModelloDwg, signal: AbortSignal, opzioni: OpzioniDwg = {}): Promise<ModelloDwg> {
  const headers = {
    "Content-Type": "application/octet-stream",
    "X-Planimetria-Cad": encodeURIComponent(JSON.stringify(richiesta)),
  };
  const risposta = dwgLocaleDisponibile()
    ? await fetch("/__planimetrie-lab/dwg/modello", { method: "POST", headers, body: file, signal, credentials: "omit", redirect: "error" })
    : await chiamaMotoreOnline(opzioni.companyId, "dwg-modello", "/dwg/modello", { body: file, headers, signal });
  if (!risposta.ok) throw await erroreRisposta(risposta, "I muri non sono stati ricostruiti. Puoi aprire la tavola da ricalcare.");
  const esito = await risposta.json() as { documento: unknown; piani?: PosizioneTavola[] };
  const validato = validaPlanimetria(esito?.documento);
  const numeri = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const conteggio = (v: number | undefined) => v === undefined || (Number.isInteger(v) && v >= 0);
  if (!validato.ok || !Array.isArray(esito.piani) || esito.piani.length !== richiesta.piani.length
    || validato.planimetria.livelli.length !== richiesta.piani.length
    || !esito.piani.every((p) => p && Array.isArray(p.origine) && p.origine.length === 2 && p.origine.every(numeri)
      && numeri(p.larghezza) && p.larghezza > 0 && numeri(p.altezza) && p.altezza > 0
      && ["primo", "ritaglio", "assi", "pareti"].includes(p.allineamento)
      && conteggio(p.contorniDaVerificare) && conteggio(p.scaleDaVerificare))) {
    throw new Error("Il modello CAD non ha una geometria utilizzabile nell’editor.");
  }
  return { documento: validato.planimetria, piani: esito.piani };
}
