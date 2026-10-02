/**
 * Allegati delle risposte di Outreach: i byte arrivano già nel messaggio IMAP
 * (base64), qui si caricano nel bucket privato «outreach-attachments» e si
 * restituisce l'elenco da scrivere in outreach_replies.raw.attachments.
 * Mai bloccante: se un allegato non si salva, la risposta entra lo stesso.
 */
export const BUCKET_ALLEGATI = "outreach-attachments";
const MAX_BYTE = 15 * 1024 * 1024;
const MAX_PER_EMAIL = 10;

export interface AllegatoSalvato { filename: string; mime: string; size: number; bucket: string; path: string }

const nomeSicuro = (n: string): string => (n || "allegato").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "allegato";

export async function salvaAllegatiRisposta(
  admin: any,
  messageId: string | null,
  atts: Array<{ filename: string; mime: string; contentBase64: string }> | undefined,
): Promise<AllegatoSalvato[]> {
  const out: AllegatoSalvato[] = [];
  if (!atts?.length) return out;
  const cartella = nomeSicuro((messageId ?? crypto.randomUUID()).replace(/[<>]/g, "")).slice(0, 80);
  for (const a of atts.slice(0, MAX_PER_EMAIL)) {
    try {
      const bin = atob(a.contentBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTE) continue;
      const path = `${cartella}/${Date.now()}-${nomeSicuro(a.filename)}`;
      const up = await admin.storage.from(BUCKET_ALLEGATI).upload(path, bytes, {
        contentType: a.mime || "application/octet-stream", upsert: true,
      });
      if (up.error) { console.warn("[outreach] allegato non salvato:", up.error.message); continue; }
      out.push({ filename: a.filename, mime: a.mime, size: bytes.byteLength, bucket: BUCKET_ALLEGATI, path });
    } catch (e) {
      console.warn("[outreach] allegato saltato:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}
