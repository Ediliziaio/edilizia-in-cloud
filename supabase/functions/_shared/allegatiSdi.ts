// Gli allegati che partono dentro l'XML della fattura (30/10/2026): quelli di
// fattura_allegati segnati «includi_nell_invio» sul documento SDI. generateXML li
// scrive in <Allegati> (NomeAttachment, FormatoAttachment, Attachment in base64).
import { bytesToBase64 } from "./base64.ts";

/** Lo SDI rifiuta un file oltre i 5 MB; dentro l'XML il base64 cresce di un terzo. */
export const MAX_BYTES_ALLEGATI_SDI = 3.5 * 1024 * 1024;

/** NomeAttachment: al massimo 60 caratteri, l'estensione si tiene. */
export function nomeAllegatoSdi(nome: string): string {
  const pulito = String(nome || "allegato").replace(/[^\x20-\x7E]/g, "_").trim() || "allegato";
  if (pulito.length <= 60) return pulito;
  const punto = pulito.lastIndexOf(".");
  const est = punto > 0 && pulito.length - punto <= 6 ? pulito.slice(punto) : "";
  return pulito.slice(0, 60 - est.length) + est;
}

/** FormatoAttachment: l'estensione in maiuscolo (PDF, JPG, ZIP…), al massimo 10 caratteri. */
export function formatoAllegatoSdi(nome: string, mime?: string | null): string {
  const est = /\.([A-Za-z0-9]{1,10})$/.exec(String(nome || ""))?.[1];
  if (est) return est.toUpperCase();
  if (mime === "application/pdf") return "PDF";
  if (mime?.startsWith("image/")) return mime.slice(6).toUpperCase().slice(0, 10);
  return "PDF";
}

export interface AllegatoSdi { nome: string; formato: string; contenuto: string }

interface RigaAllegato { file_name: string; mime_type: string | null; size_bytes: number | null; storage_path: string }

/**
 * Legge gli allegati da mandare con il documento. Errore (con il motivo in parole)
 * se un file manca o se insieme superano il tetto: meglio fermarsi prima dell'invio
 * che far scartare la fattura dallo SDI.
 */
// deno-lint-ignore no-explicit-any
export async function allegatiPerInvioSdi(db: any, companyId: string, documentoId: string): Promise<{ allegati: AllegatoSdi[]; errore?: string }> {
  const { data, error } = await db.from("fattura_allegati")
    .select("file_name, mime_type, size_bytes, storage_path")
    .eq("company_id", companyId).eq("documento_fiscale_id", documentoId).eq("includi_nell_invio", true)
    .order("created_at", { ascending: true });
  if (error) return { allegati: [], errore: `Allegati non leggibili: ${error.message}` };
  const righe = (data ?? []) as RigaAllegato[];
  const totale = righe.reduce((s, r) => s + (Number(r.size_bytes) || 0), 0);
  if (totale > MAX_BYTES_ALLEGATI_SDI) {
    return { allegati: [], errore: "Gli allegati da mandare con la fattura superano 3,5 MB: togline qualcuno dall'invio." };
  }
  const allegati: AllegatoSdi[] = [];
  for (const r of righe) {
    if (!String(r.storage_path).startsWith(`${companyId}/`)) return { allegati: [], errore: `Allegato «${r.file_name}» non valido.` };
    const { data: file, error: e2 } = await db.storage.from("fatture-allegati").download(r.storage_path);
    if (e2 || !file) return { allegati: [], errore: `L'allegato «${r.file_name}» non si trova: caricalo di nuovo.` };
    allegati.push({
      nome: nomeAllegatoSdi(r.file_name),
      formato: formatoAllegatoSdi(r.file_name, r.mime_type),
      contenuto: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    });
  }
  return { allegati };
}
