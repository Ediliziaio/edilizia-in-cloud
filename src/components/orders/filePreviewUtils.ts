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
export async function openAttachmentInTab(fileUrl: string, bucket: string = ATTACHMENTS_BUCKET) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(toStoragePath(fileUrl), 3600);
  if (error || !data?.signedUrl) { toast.error("Impossibile aprire il file"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Il tipo si decide dal MIME quando c'e', altrimenti dall'estensione del nome. */
export function fileKind(d: Pick<PreviewableFile, "file_name" | "file_type">): FileKind {
  const mime = (d.file_type || "").toLowerCase();
  const ext = (d.file_name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg", "heic", "heif", "tif", "tiff"].includes(ext)) return "image";
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
export function useSignedUrls(files: PreviewableFile[], enabled: boolean, bucket: string = ATTACHMENTS_BUCKET) {
  const paths = Array.from(new Set(files.map((f) => toStoragePath(f.file_url)))).sort();
  return useQuery({
    queryKey: ["order-files-signed", bucket, paths.join("|")],
    enabled: enabled && paths.length > 0,
    staleTime: 45 * 60 * 1000, // gli URL durano un'ora: non rifirmare a ogni apertura
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 3600);
      if (error) return {};
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.signedUrl && r.path) map[r.path] = r.signedUrl; });
      return map;
    },
  });
}

/** Immagini che il browser non sa mostrare (HEIC dell'iPhone, TIFF): servono la versione convertita dal server. */
export function immagineDaConvertire(d: Pick<PreviewableFile, "file_name" | "file_type">): boolean {
  const ext = (d.file_name.split(".").pop() || "").toLowerCase();
  const mime = (d.file_type || "").toLowerCase();
  return ["heic", "heif", "tif", "tiff"].includes(ext) || /hei[cf]|tiff/.test(mime);
}

/**
 * Miniature delle immagini ridimensionate dal server (Supabase image
 * transformation): 4 KB invece dei 3 MB della foto intera, e le HEIC
 * dell'iPhone diventano visibili anche in Chrome. Mappa percorso → URL.
 */
export function useMiniature(files: PreviewableFile[], enabled: boolean, bucket: string = ATTACHMENTS_BUCKET, lato = 240) {
  const paths = Array.from(new Set(
    files.filter((f) => fileKind(f) === "image").map((f) => toStoragePath(f.file_url)),
  )).sort();
  return useQuery({
    queryKey: ["order-files-thumbs", bucket, lato, paths.join("|")],
    enabled: enabled && paths.length > 0,
    staleTime: 45 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const risultati = await Promise.all(paths.map(async (path) => {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, {
          transform: { width: lato, height: lato, resize: "cover", quality: 70 },
        });
        return [path, data?.signedUrl] as const;
      }));
      const map: Record<string, string> = {};
      risultati.forEach(([p, u]) => { if (u) map[p] = u; });
      return map;
    },
  });
}

/** Versione grande convertita (per HEIC/TIFF nel visualizzatore). */
export async function urlImmagineConvertita(fileUrl: string, bucket: string = ATTACHMENTS_BUCKET): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(toStoragePath(fileUrl), 3600, {
    transform: { width: 2000, height: 2000, resize: "contain", quality: 85 },
  });
  return data?.signedUrl ?? null;
}

/** Scarica davvero il file (con il suo nome), invece di aprirlo in una scheda. */
export async function scaricaAllegato(fileUrl: string, nome: string, bucket: string = ATTACHMENTS_BUCKET) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(toStoragePath(fileUrl), 300, { download: nome });
  if (error || !data?.signedUrl) { toast.error("Impossibile scaricare il file"); return; }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
