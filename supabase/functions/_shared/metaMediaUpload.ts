/**
 * Carica un file sull'app Meta e restituisce l'«handle» (27/09/2026).
 *
 * Serve per creare i template WhatsApp con intestazione media (foto, video,
 * PDF): Meta, in creazione, non accetta un URL come esempio ma un handle
 * ottenuto caricando il file con la resumable upload API dell'app. Lo stesso
 * schema che usa già whatsapp-profilo per la foto profilo.
 *
 * Tre passi: 1) apri una sessione di caricamento sull'app (dimensione e tipo),
 * 2) manda i byte, 3) leggi l'handle `h`.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface EsitoUploadMeta {
  ok: boolean;
  handle?: string;
  errore?: string;
}

export async function caricaMediaSuMeta(
  metaAppId: string,
  token: string,
  bytes: Uint8Array,
  fileName: string,
  fileType: string,
): Promise<EsitoUploadMeta> {
  try {
    const sessione = await fetch(
      `${GRAPH}/${metaAppId}/uploads?${new URLSearchParams({
        file_name: fileName,
        file_length: String(bytes.length),
        file_type: fileType,
      })}`,
      { method: "POST", headers: { Authorization: `OAuth ${token}` } },
    );
    const js = await sessione.json().catch(() => ({}));
    const idSessione = typeof js.id === "string" ? js.id : "";
    if (!sessione.ok || !idSessione) {
      return { ok: false, errore: js?.error?.message ?? "sessione di caricamento non aperta" };
    }

    const caricato = await fetch(`${GRAPH}/${idSessione}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
      // deno-lint-ignore no-explicit-any
      body: bytes as any,
    });
    const jc = await caricato.json().catch(() => ({}));
    const handle = typeof jc.h === "string" ? jc.h : "";
    if (!caricato.ok || !handle) {
      return { ok: false, errore: jc?.error?.message ?? "caricamento senza handle" };
    }
    return { ok: true, handle };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

/** Il tipo di header Meta (IMAGE/VIDEO/DOCUMENT) dal MIME del file. */
export function formatoHeaderDaMime(mime: string): "IMAGE" | "VIDEO" | "DOCUMENT" | null {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m === "application/pdf") return "DOCUMENT";
  return null;
}

/** L'estensione da usare nel nome file, dal MIME. */
export function estensioneDaMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "application/pdf": "pdf",
  };
  return map[(mime || "").toLowerCase()] ?? "bin";
}
