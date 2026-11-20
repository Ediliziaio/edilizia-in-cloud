const MIB = 1024 * 1024;
// Rispetta anche il limite del bucket privato whatsapp-media.
export const LIMITE_MEDIA_WHATSAPP = 25 * MIB;

export class MediaWhatsAppNonDisponibile extends Error {
  constructor(public readonly codice: "file_grande" | "media_scaduto") { super(codice); }
}

async function leggiBytes(response: Response, limite: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limite) {
    await response.body?.cancel();
    throw new MediaWhatsAppNonDisponibile("file_grande");
  }
  if (!response.body) throw new Error("media_body_assente");
  const reader = response.body.getReader();
  const blocchi: Uint8Array[] = [];
  let byte = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    byte += next.value.byteLength;
    if (byte > limite) {
      await reader.cancel();
      throw new MediaWhatsAppNonDisponibile("file_grande");
    }
    blocchi.push(next.value);
  }
  if (!byte) throw new Error("media_vuoto");
  const corpo = new Uint8Array(byte);
  let offset = 0;
  for (const blocco of blocchi) {
    corpo.set(blocco, offset);
    offset += blocco.byteLength;
  }
  return corpo;
}

export async function downloadMetaMedia(mediaId: string, accessToken: string, phoneNumberId: string) {
  if (!/^\d{5,30}$/.test(mediaId) || !/^\d{5,30}$/.test(phoneNumberId)) throw new Error("identificativo_media_non_valido");
  const headers = { Authorization: `Bearer ${accessToken}` };
  const lookup = new URL(`https://graph.facebook.com/v22.0/${mediaId}`);
  lookup.searchParams.set("phone_number_id", phoneNumberId);
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const metaResp = await fetch(lookup, { headers, signal: AbortSignal.timeout(12_000), redirect: "error" });
    if (metaResp.status === 404) throw new MediaWhatsAppNonDisponibile("media_scaduto");
    if (!metaResp.ok) throw new Error(`media_lookup_${metaResp.status}`);
    const meta = await metaResp.json() as { url?: string; mime_type?: string; file_size?: number; sha256?: string };
    if (!meta.url) throw new Error("media_url_assente");
    const mimeType = meta.mime_type?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
    const limite = mimeType.startsWith("audio/") || mimeType.startsWith("video/") ? 16 * MIB : LIMITE_MEDIA_WHATSAPP;
    if (Number(meta.file_size ?? 0) > limite) throw new MediaWhatsAppNonDisponibile("file_grande");

    const url = new URL(meta.url);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !(url.hostname === "lookaside.fbsbx.com" || url.hostname === "graph.facebook.com" || url.hostname.endsWith(".fbcdn.net"))) {
      throw new Error("media_host_non_consentito");
    }
    const file = await fetch(url, { headers, signal: AbortSignal.timeout(18_000), redirect: "error" });
    if (file.status === 404 && tentativo === 0) {
      await file.body?.cancel();
      continue;
    }
    if (file.status === 404) throw new MediaWhatsAppNonDisponibile("media_scaduto");
    if (!file.ok) throw new Error(`media_download_${file.status}`);
    const bytes = await leggiBytes(file, limite);
    if (meta.file_size && bytes.byteLength !== Number(meta.file_size)) throw new Error("media_dimensione_non_valida");
    if (/^[a-f0-9]{64}$/i.test(meta.sha256 ?? "")) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
      const hex = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
      if (hex !== meta.sha256?.toLowerCase()) throw new Error("media_integrita_non_valida");
    }
    return { bytes, mimeType };
  }
  throw new MediaWhatsAppNonDisponibile("media_scaduto");
}
