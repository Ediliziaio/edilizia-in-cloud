/**
 * Anteprime dei file di commessa — componenti.
 * Le funzioni e i tipi stanno in filePreviewUtils.ts (fast-refresh).
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText, Download, ExternalLink, Loader2, ArrowLeft, ChevronLeft, ChevronRight,
  ImageIcon, FileSpreadsheet, File as FileIcon,
} from "lucide-react";
import {
  ATTACHMENTS_BUCKET, fileKind, fmtBytes, immagineDaConvertire, openAttachmentInTab,
  scaricaAllegato, toStoragePath, urlImmagineConvertita, KIND_LABEL,
  type FileKind, type PreviewableFile,
} from "./filePreviewUtils";

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "pdf") return <FileText className={className} />;
  if (kind === "sheet") return <FileSpreadsheet className={className} />;
  if (kind === "doc") return <FileText className={className} />;
  return <FileIcon className={className} />;
}

/* ── Prima pagina dei PDF come miniatura ─────────────────────────────────── */

const cachePdf = new Map<string, string | null>();
let inCorsoPdf = 0;
const codaPdf: (() => void)[] = [];

/** Al massimo due PDF alla volta: una commessa con 40 PDF non deve bloccare il browser. */
async function inCoda<T>(lavoro: () => Promise<T>): Promise<T> {
  if (inCorsoPdf >= 2) await new Promise<void>((ok) => codaPdf.push(ok));
  inCorsoPdf++;
  try { return await lavoro(); } finally {
    inCorsoPdf--;
    codaPdf.shift()?.();
  }
}

async function primaPaginaPdf(url: string, larghezza: number): Promise<string | null> {
  return inCoda(async () => {
    try {
      const lib = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
      // Richieste a pezzi: per la prima pagina non serve scaricare tutto il PDF.
      const doc = await lib.getDocument({ url, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536 }).promise;
      const pagina = await doc.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: larghezza / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      void doc.destroy();
      return dataUrl;
    } catch {
      return null;
    }
  });
}

function PdfPrimaPagina({ chiave, url, className }: { chiave: string; url?: string; className: string }) {
  const [src, setSrc] = useState<string | null | undefined>(() => cachePdf.get(chiave));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url || cachePdf.has(chiave) || !box.current) return;
    let vivo = true;
    const osservatore = new IntersectionObserver((voci) => {
      if (!voci.some((v) => v.isIntersecting)) return;
      osservatore.disconnect();
      void primaPaginaPdf(url, 240).then((r) => {
        cachePdf.set(chiave, r);
        if (vivo) setSrc(r);
      });
    }, { rootMargin: "200px" });
    osservatore.observe(box.current);
    return () => { vivo = false; osservatore.disconnect(); };
  }, [chiave, url]);

  return (
    <div ref={box} className="h-full w-full flex items-center justify-center">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <FileText className={className} />
      )}
    </div>
  );
}

/**
 * Miniatura: immagine ridotta dal server quando c'è, prima pagina per i PDF,
 * altrimenti icona tipizzata. `size="tile"` riempie il riquadro della griglia.
 */
export function FileThumb({
  file, url, thumbUrl, size = "md", loading,
}: {
  file: PreviewableFile;
  /** URL firmato del file intero (serve ai PDF e come ripiego per le immagini). */
  url?: string;
  /** URL della miniatura ridimensionata dal server. */
  thumbUrl?: string;
  size?: "sm" | "md" | "tile";
  loading?: boolean;
}) {
  const kind = fileKind(file);
  const box = size === "tile" ? "h-full w-full" : size === "sm" ? "h-10 w-10 rounded-md border" : "h-12 w-12 rounded-md border";
  const icon = size === "tile" ? "h-8 w-8" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  // Le HEIC/TIFF non si vedono nel browser: solo la miniatura del server.
  const srcImmagine = thumbUrl ?? (immagineDaConvertire(file) ? undefined : url);
  const [rotta, setRotta] = useState(false);

  return (
    <div className={`${box} shrink-0 overflow-hidden bg-muted/40 flex items-center justify-center`}>
      {kind === "image" && srcImmagine && !rotta ? (
        <img src={srcImmagine} alt={file.file_name} loading="lazy" className="h-full w-full object-cover" onError={() => setRotta(true)} />
      ) : kind === "pdf" && size !== "sm" ? (
        <PdfPrimaPagina chiave={toStoragePath(file.file_url)} url={url} className={`${icon} text-muted-foreground/70`} />
      ) : loading && kind === "image" ? (
        <Loader2 className={`${icon} animate-spin text-muted-foreground`} />
      ) : (
        <KindIcon kind={kind} className={`${icon} text-muted-foreground/70`} />
      )}
    </div>
  );
}

/* ── Visualizzatore ──────────────────────────────────────────────────────── */

/** PDF scaricato in memoria: il sito non permette di incorporare pagine dello storage (CSP frame-src). */
function usePdfInMemoria(url: string | undefined, attivo: boolean) {
  // Lo stato ricorda per quale URL è stato preparato: cambiando file si
  // riparte da «caricamento» senza azzerarlo dentro l'effetto.
  const [stato, setStato] = useState<{ per?: string; blob?: string; errore?: boolean }>({});
  useEffect(() => {
    if (!attivo || !url) return;
    let vivo = true;
    let creato: string | undefined;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => {
        creato = URL.createObjectURL(new Blob([b], { type: "application/pdf" }));
        if (vivo) setStato({ per: url, blob: creato }); else URL.revokeObjectURL(creato);
      })
      .catch(() => { if (vivo) setStato({ per: url, errore: true }); });
    return () => { vivo = false; if (creato) URL.revokeObjectURL(creato); };
  }, [url, attivo]);
  return stato.per === url ? stato : {};
}

/**
 * Visualizzatore: immagine a schermo o PDF nel lettore del browser, con frecce
 * per scorrere gli altri file dell'elenco (anche da tastiera).
 */
export function FilePreviewDialog({
  file, url, open, onOpenChange, onDownload, onBack, bucket, elenco, onNavigate,
}: {
  file: PreviewableFile | null;
  url?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se assente, «Scarica» scarica il file con il suo nome. */
  onDownload?: (f: PreviewableFile) => void;
  /** Se presente, mostra la freccia "indietro" (es. per tornare alla griglia). */
  onBack?: () => void;
  /** Bucket del file (default documenti commessa). */
  bucket?: string;
  /** File scorribili con le frecce, nell'ordine in cui si vedono. */
  elenco?: PreviewableFile[];
  onNavigate?: (f: PreviewableFile) => void;
}) {
  const kind = file ? fileKind(file) : "other";
  const convertire = !!file && kind === "image" && immagineDaConvertire(file);
  const [convertita, setConvertita] = useState<{ per: string; url: string | null } | null>(null);
  const pdf = usePdfInMemoria(url, open && kind === "pdf");
  const b = bucket ?? ATTACHMENTS_BUCKET;

  useEffect(() => {
    if (!open || !file || !convertire) return;
    let vivo = true;
    const per = file.file_url;
    void urlImmagineConvertita(per, b).then((u) => { if (vivo) setConvertita({ per, url: u }); });
    return () => { vivo = false; };
  }, [open, file, convertire, b]);
  const urlConvertito = file && convertita?.per === file.file_url ? convertita.url : null;

  const indice = file && elenco ? elenco.findIndex((f) => f.id === file.id) : -1;
  const precedente = indice > 0 ? elenco![indice - 1] : null;
  const successivo = indice >= 0 && indice < (elenco?.length ?? 0) - 1 ? elenco![indice + 1] : null;

  useEffect(() => {
    if (!open || !onNavigate) return;
    const tasto = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && precedente) { e.preventDefault(); onNavigate(precedente); }
      if (e.key === "ArrowRight" && successivo) { e.preventDefault(); onNavigate(successivo); }
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [open, onNavigate, precedente, successivo]);

  if (!file) return null;
  const peso = fmtBytes(file.file_size);
  const srcImmagine = convertire ? urlConvertito : url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[94vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            {onBack && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack} aria-label="Torna ai documenti">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <KindIcon kind={kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-base">{file.file_name}</span>
          </DialogTitle>
          <DialogDescription>
            {KIND_LABEL[kind]}{peso ? ` · ${peso}` : ""}
            {indice >= 0 && elenco && elenco.length > 1 ? ` · ${indice + 1} di ${elenco.length}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30">
          {!url ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo l'anteprima…
            </div>
          ) : kind === "image" ? (
            srcImmagine ? (
              <img src={srcImmagine} alt={file.file_name} className="mx-auto max-h-[70vh] object-contain" />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converto la foto per mostrarla…
              </div>
            )
          ) : kind === "pdf" ? (
            pdf.blob ? (
              <iframe src={pdf.blob} title={file.file_name} className="h-[70vh] w-full border-0 bg-white" />
            ) : pdf.errore ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                Anteprima non disponibile: aprilo in una scheda o scaricalo.
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apro il PDF…
              </div>
            )
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
              <KindIcon kind={kind} className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                Questo tipo di file non si può sfogliare qui: scaricalo o aprilo in una scheda nuova.
              </p>
            </div>
          )}

          {onNavigate && precedente && (
            <Button
              variant="secondary" size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full shadow-md opacity-90"
              onClick={() => onNavigate(precedente)} aria-label="File precedente"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          {onNavigate && successivo && (
            <Button
              variant="secondary" size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full shadow-md opacity-90"
              onClick={() => onNavigate(successivo)} aria-label="File successivo"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAttachmentInTab(file.file_url, b)}>
            <ExternalLink className="h-4 w-4" /> Apri in una scheda
          </Button>
          <Button size="sm" className="gap-1.5"
            onClick={() => (onDownload ? onDownload(file) : scaricaAllegato(file.file_url, file.file_name, b))}>
            <Download className="h-4 w-4" /> Scarica
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
