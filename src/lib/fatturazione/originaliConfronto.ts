import { supabase } from "@/integrations/supabase/client";
import { riconosciFile } from "@/lib/storage/fileRiservati";
import { recordDocumento } from "./confrontoDocumenti";

export interface OriginaleConfronto {
  id: string;
  nome: string;
  mime: string;
  bucket?: string;
  path?: string;
  url?: string;
  previewPath?: string;
  previewMime?: string;
  tipo?: "inviato" | "fornitore";
  etichetta?: string;
  controlloId?: string;
}
const stringa = (v: unknown) => (typeof v === "string" ? v : "");
export function mimeOriginale(nome: string, mime?: unknown): string {
  if (typeof mime === "string" && mime.trim()) return mime.toLowerCase();
  const est = nome.split("?")[0].split(".").pop()?.toLowerCase();
  return (
    (
      {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
      } as Record<string, string>
    )[est ?? ""] ?? "application/octet-stream"
  );
}
export function originaleDaRiferimento(
  v: unknown,
  bucket: string,
  nome?: string,
  mime?: unknown,
): OriginaleConfronto | null {
  const valore = stringa(v).trim();
  if (!valore) return null;
  const n =
    nome || valore.split("?")[0].split("/").pop() || "Documento originale";
  if (/^https?:\/\//i.test(valore)) {
    const rif = riconosciFile(valore);
    if (rif)
      return {
        id: `${rif.bucket}/${rif.path}`,
        nome: n,
        mime: mimeOriginale(n, mime),
        ...rif,
      };
    return { id: valore, url: valore, nome: n, mime: mimeOriginale(n, mime) };
  }
  // Non ammettiamo schemi eseguibili nei documenti importati.
  if (/^[a-z][a-z\d+.-]*:/i.test(valore) || valore.startsWith("//"))
    return null;
  const path = valore.startsWith(`${bucket}/`)
    ? valore.slice(bucket.length + 1)
    : valore;
  return {
    id: `${bucket}/${path}`,
    bucket,
    path,
    nome: n,
    mime: mimeOriginale(n, mime),
  };
}
export function originaliBolla(
  azienda: string,
  ddt: Record<string, unknown>,
  jobs: unknown[],
): OriginaleConfronto[] {
  const result: OriginaleConfronto[] = [];
  for (const job of jobs) {
    const files = recordDocumento(job).files;
    for (const voce of Array.isArray(files) ? files : []) {
      const f = recordDocumento(voce),
        path = stringa(f.path),
        bucket = stringa(f.bucket) || "ddt-documenti";
      if (
        !["ddt-documenti", "whatsapp-media"].includes(bucket) ||
        !path.startsWith(`${azienda}/`)
      )
        continue;
      const previewPath = stringa(f.prepared_path);
      result.push({
        id: `${bucket}/${path}`,
        path,
        bucket,
        nome: stringa(f.name) || "Originale DDT",
        mime: mimeOriginale(stringa(f.name), f.mime),
        ...(previewPath.startsWith(`${azienda}/`)
          ? {
              previewPath,
              previewMime: stringa(f.prepared_mime) || "image/jpeg",
            }
          : {}),
      });
    }
  }
  const principale = originaleDaRiferimento(
    ddt.ddt_file_url,
    stringa(ddt.ddt_file_bucket) || "ddt_attachments",
    stringa(ddt.ddt_file_name),
    ddt.ddt_file_mime,
  );
  if (principale) result.push(principale);
  for (const a of Array.isArray(ddt.attachments) ? ddt.attachments : []) {
    const x = recordDocumento(a);
    const f = originaleDaRiferimento(
      x.path || x.url,
      stringa(x.bucket) || "ddt_attachments",
      stringa(x.name),
      x.mime,
    );
    if (f) result.push(f);
  }
  return [...new Map(result.map((f) => [f.id, f])).values()];
}
export async function apriOriginaleConfronto(
  file: OriginaleConfronto,
): Promise<{ url: string; preview: string; mime: string }> {
  if (file.bucket && file.path) {
    const { data, error } = await supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.path, 3600);
    if (error || !data?.signedUrl)
      throw error || new Error("Documento non disponibile");
    if (file.previewPath) {
      const { data: p } = await supabase.storage
        .from(file.bucket)
        .createSignedUrl(file.previewPath, 3600);
      if (p?.signedUrl)
        return {
          url: data.signedUrl,
          preview: p.signedUrl,
          mime: file.previewMime || file.mime,
        };
    }
    return { url: data.signedUrl, preview: data.signedUrl, mime: file.mime };
  }
  if (file.url && /^https?:\/\//i.test(file.url))
    return { url: file.url, preview: file.url, mime: file.mime };
  throw new Error("Riferimento all’originale non valido");
}
