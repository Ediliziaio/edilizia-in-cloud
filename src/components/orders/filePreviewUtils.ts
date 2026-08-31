/**
 * Anteprime dei file di commessa — funzioni e tipi condivisi.
 *
 * Sta separato da filePreview.tsx (i componenti) perche' mescolare componenti e
 * funzioni nello stesso file spezza il fast-refresh di Vite.
 *
 * Gli allegati stanno nel bucket privato "order-attachments" e si guardano via
 * signed URL. Il campo file_url contiene il PERCORSO relativo (es.
 * "orders/<id>/1-scheda.pdf"); le righe vecchie possono contenere l'URL intero,
 * gestito da toStoragePath.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const ATTACHMENTS_BUCKET = "order-attachments";
const MARKER = `/${ATTACHMENTS_BUCKET}/`;

/** File minimo che sappiamo mostrare in anteprima. */
export interface PreviewableFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  file_size?: number | null;
}

export type FileKind = "image" | "pdf" | "sheet" | "doc" | "other";

/** Dal valore salvato ricava il percorso dentro al bucket (regge gli URL interi legacy). */
export function toStoragePath(fileUrl: string): string {
  if (fileUrl.includes(MARKER)) return fileUrl.split(MARKER)[1].split("?")[0];
  return fileUrl;
}

/** Apre un allegato in una scheda nuova via signed URL. */
export async function openAttachmentInTab(fileUrl: string) {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(toStoragePath(fileUrl), 3600);
  if (error || !data?.signedUrl) { toast.error("Impossibile aprire il file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Il tipo si decide dal MIME quando c'e', altrimenti dall'estensione del nome. */
export function fileKind(d: Pick<PreviewableFile, "file_name" | "file_type">): FileKind {
  const mime = (d.file_type || "").toLowerCase();
  const ext = (d.file_name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("sheet") || mime.includes("excel") || ["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  if (mime.includes("word") || mime.includes("document") || ["doc", "docx"].includes(ext)) return "doc";
  return "other";
}

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Immagine", pdf: "PDF", sheet: "Foglio", doc: "Documento", other: "File",
};

/** Tinta per tipo: aiuta a riconoscere il file a colpo d'occhio. */
export const KIND_TINT: Record<FileKind, string> = {
  image: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pdf: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  sheet: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  doc: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/** Peso file all'italiana (virgola decimale). */
export function fmtBytes(n?: number | null): string {
  if (typeof n !== "number" || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Firma in UNA chiamata gli URL di tutti gli allegati passati, invece di una
 * richiesta per miniatura. Restituisce una mappa percorso -> signed URL.
 */
export function useSignedUrls(files: PreviewableFile[], enabled: boolean) {
  const paths = Array.from(new Set(files.map((f) => toStoragePath(f.file_url)))).sort();
  return useQuery({
    queryKey: ["order-files-signed", paths.join("|")],
    enabled: enabled && paths.length > 0,
    staleTime: 45 * 60 * 1000, // gli URL durano un'ora: non rifirmare a ogni apertura
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error) return {};
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.signedUrl && r.path) map[r.path] = r.signedUrl; });
      return map;
    },
  });
}
