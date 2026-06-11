/**
 * PdfToolkitDialog — Strumenti PDF leggeri, 100% client-side.
 *
 * Due funzioni, zero upload (i file restano nel browser dell'utente):
 *   1. Immagini → PDF: più PNG/JPG/WebP in un unico PDF (riordino, A4 o
 *      pagina su misura dell'immagine).
 *   2. Modifica PDF: carica uno o più PDF → anteprima pagine, riordina,
 *      ruota, elimina, unisci più file in uno → esporta.
 *
 * Librerie: pdf-lib (scrittura/manipolazione) + pdfjs-dist (anteprime).
 * Tutto lazy: questo file è un chunk separato caricato alla prima apertura.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ImagePlus, FilePlus2, Trash2, RotateCw, ArrowUp, ArrowDown,
  Download, Loader2, FileText, ShieldCheck,
} from "lucide-react";

const MAX_IMAGES = 60;
const MAX_PDF_MB = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadPdf(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Ricodifica in PNG via canvas (per WebP & formati non supportati da pdf-lib). */
async function reencodeToPng(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Conversione immagine fallita");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Render anteprime pagina di un PDF come dataURL JPEG (pdfjs, worker Vite). */
async function renderPdfThumbs(bytes: Uint8Array): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  // @ts-expect-error vite-resolved url import
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdfjs trasferisce il buffer al worker (lo svuota): passiamo una COPIA,
  // i bytes originali servono ancora a pdf-lib per l'export.
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const thumbs: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbs.push(canvas.toDataURL("image/jpeg", 0.72));
  }
  void pdf.destroy();
  return thumbs;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImgItem {
  id: string;
  file: File;
  url: string; // object URL per anteprima
}

interface PageItem {
  id: string;
  srcIdx: number;      // indice nel registro sorgenti
  pageIndex: number;   // pagina 0-based nel PDF sorgente
  thumb: string;
  extraRotation: 0 | 90 | 180 | 270;
  srcName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PdfToolkitDialog({ open, onOpenChange }: Props) {
  // — Immagini → PDF —
  const [images, setImages] = useState<ImgItem[]>([]);
  const [pageFormat, setPageFormat] = useState<"a4" | "fit">("a4");
  const [building, setBuilding] = useState(false);

  // — Modifica PDF —
  const srcDocsRef = useRef<Array<{ name: string; bytes: Uint8Array }>>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Cleanup object URL alla chiusura/unmount
  useEffect(() => {
    if (open) return;
    setImages((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.url));
      return [];
    });
    setPages([]);
    srcDocsRef.current = [];
  }, [open]);

  // ── Immagini → PDF ─────────────────────────────────────────────────────────

  const addImages = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (accepted.length !== files.length) {
      toast.info("Alcuni file non sono immagini e sono stati saltati");
    }
    setImages((prev) => {
      const next = [...prev, ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      }))];
      if (next.length > MAX_IMAGES) {
        toast.error(`Massimo ${MAX_IMAGES} immagini per PDF`);
        next.slice(MAX_IMAGES).forEach((i) => URL.revokeObjectURL(i.url));
        return next.slice(0, MAX_IMAGES);
      }
      return next;
    });
  }, []);

  const moveImage = useCallback((idx: number, dir: -1 | 1) => {
    setImages((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const buildImagesPdf = useCallback(async () => {
    if (images.length === 0) return;
    setBuilding(true);
    try {
      const doc = await PDFDocument.create();
      for (const item of images) {
        const raw = new Uint8Array(await item.file.arrayBuffer());
        const img = item.file.type === "image/jpeg"
          ? await doc.embedJpg(raw)
          : item.file.type === "image/png"
            ? await doc.embedPng(raw)
            : await doc.embedPng(await reencodeToPng(item.file));
        if (pageFormat === "a4") {
          // A4 verticale con margini, immagine centrata e adattata
          const [pw, ph] = [595.28, 841.89];
          const margin = 24;
          const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const page = doc.addPage([pw, ph]);
          page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        } else {
          // Pagina su misura: stessa proporzione dell'immagine (lato max 1400pt)
          const cap = 1400;
          const scale = Math.min(1, cap / Math.max(img.width, img.height));
          const page = doc.addPage([img.width * scale, img.height * scale]);
          page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
        }
      }
      const bytes = await doc.save();
      const base = images[0].file.name.replace(/\.[^.]+$/, "");
      downloadPdf(bytes, `${base || "immagini"}.pdf`);
      toast.success(`PDF generato (${images.length} pagin${images.length === 1 ? "a" : "e"})`);
    } catch (e) {
      toast.error("Errore nella generazione del PDF", { description: String(e) });
    } finally {
      setBuilding(false);
    }
  }, [images, pageFormat]);

  // ── Modifica PDF ───────────────────────────────────────────────────────────

  const addPdfs = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast.error("Seleziona file PDF");
      return;
    }
    const totalMb = pdfs.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    if (totalMb > MAX_PDF_MB) {
      toast.error(`File troppo grandi (max ${MAX_PDF_MB} MB totali)`);
      return;
    }
    setLoadingPdf(true);
    try {
      for (const file of pdfs) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const thumbs = await renderPdfThumbs(bytes);
        const srcIdx = srcDocsRef.current.length;
        srcDocsRef.current.push({ name: file.name, bytes });
        setPages((prev) => [
          ...prev,
          ...thumbs.map((thumb, pageIndex): PageItem => ({
            id: crypto.randomUUID(),
            srcIdx,
            pageIndex,
            thumb,
            extraRotation: 0,
            srcName: file.name,
          })),
        ]);
      }
    } catch (e) {
      toast.error("Impossibile leggere il PDF", { description: String(e) });
    } finally {
      setLoadingPdf(false);
    }
  }, []);

  const movePage = useCallback((idx: number, dir: -1 | 1) => {
    setPages((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }, []);

  const rotatePage = useCallback((id: string) => {
    setPages((prev) => prev.map((p) =>
      p.id === id ? { ...p, extraRotation: ((p.extraRotation + 90) % 360) as PageItem["extraRotation"] } : p,
    ));
  }, []);

  const removePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const exportPdf = useCallback(async () => {
    if (pages.length === 0) return;
    setExporting(true);
    try {
      const out = await PDFDocument.create();
      // Carica ogni sorgente una sola volta
      const loaded = new Map<number, PDFDocument>();
      for (const p of pages) {
        if (!loaded.has(p.srcIdx)) {
          loaded.set(p.srcIdx, await PDFDocument.load(srcDocsRef.current[p.srcIdx].bytes, { ignoreEncryption: true }));
        }
      }
      for (const p of pages) {
        const src = loaded.get(p.srcIdx)!;
        const [copied] = await out.copyPages(src, [p.pageIndex]);
        if (p.extraRotation !== 0) {
          copied.setRotation(degrees((copied.getRotation().angle + p.extraRotation) % 360));
        }
        out.addPage(copied);
      }
      const bytes = await out.save();
      const uniqueSrc = new Set(pages.map((p) => p.srcIdx));
      const base = srcDocsRef.current[pages[0].srcIdx].name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, uniqueSrc.size > 1 ? "documenti-uniti.pdf" : `${base}-modificato.pdf`);
      toast.success(`PDF esportato (${pages.length} pagin${pages.length === 1 ? "a" : "e"})`);
    } catch (e) {
      toast.error("Errore nell'esportazione", { description: String(e) });
    } finally {
      setExporting(false);
    }
  }, [pages]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            Strumenti PDF
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Tutto avviene nel tuo browser: i file non vengono caricati su nessun server.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="img2pdf" className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0 grid w-full grid-cols-2">
            <TabsTrigger value="img2pdf" className="gap-1.5">
              <ImagePlus className="h-3.5 w-3.5" /> Immagini → PDF
            </TabsTrigger>
            <TabsTrigger value="editpdf" className="gap-1.5">
              <FilePlus2 className="h-3.5 w-3.5" /> Modifica / unisci PDF
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Immagini → PDF ── */}
          <TabsContent value="img2pdf" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
            <label className="shrink-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-5 text-center transition-colors hover:bg-orange-50">
              <ImagePlus className="h-6 w-6 text-orange-500" />
              <span className="text-sm font-semibold text-slate-800">Scegli le immagini</span>
              <span className="text-[11px] text-slate-500">PNG, JPG, WebP — anche più di una, l'ordine si cambia dopo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => { addImages(e.target.files); e.target.value = ""; }}
              />
            </label>

            {images.length > 0 && (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border p-2 grid grid-cols-3 sm:grid-cols-4 gap-2 content-start">
                  {images.map((img, idx) => (
                    <div key={img.id} className="group relative rounded-md border bg-white p-1">
                      <img src={img.url} alt={img.file.name} className="h-24 w-full rounded object-contain bg-slate-50" />
                      <p className="mt-1 truncate text-[9px] text-slate-500" title={img.file.name}>
                        {idx + 1}. {img.file.name}
                      </p>
                      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => moveImage(idx, -1)} disabled={idx === 0} aria-label="Sposta su"
                          className="rounded bg-slate-900/80 p-1 text-white disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                        <button type="button" onClick={() => moveImage(idx, 1)} disabled={idx === images.length - 1} aria-label="Sposta giù"
                          className="rounded bg-slate-900/80 p-1 text-white disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                        <button type="button" onClick={() => removeImage(img.id)} aria-label="Rimuovi"
                          className="rounded bg-rose-600/90 p-1 text-white"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-600">Pagina</span>
                    <div className="flex overflow-hidden rounded-md border">
                      {([["a4", "A4"], ["fit", "Su misura"]] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPageFormat(v)}
                          className={cn(
                            "h-7 px-2.5 text-[11px] font-medium transition-colors",
                            pageFormat === v ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={buildImagesPdf} disabled={building} className="gap-2 bg-orange-500 hover:bg-orange-600">
                    {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Genera PDF ({images.length})
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Tab 2: Modifica / unisci PDF ── */}
          <TabsContent value="editpdf" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
            <label className="shrink-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-5 text-center transition-colors hover:bg-orange-50">
              {loadingPdf ? <Loader2 className="h-6 w-6 animate-spin text-orange-500" /> : <FilePlus2 className="h-6 w-6 text-orange-500" />}
              <span className="text-sm font-semibold text-slate-800">
                {pages.length > 0 ? "Aggiungi un altro PDF (unisci)" : "Scegli uno o più PDF"}
              </span>
              <span className="text-[11px] text-slate-500">Poi riordina, ruota o elimina le pagine prima di esportare</span>
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                disabled={loadingPdf}
                onChange={(e) => { void addPdfs(e.target.files); e.target.value = ""; }}
              />
            </label>

            {pages.length > 0 && (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border p-2 grid grid-cols-3 sm:grid-cols-5 gap-2 content-start">
                  {pages.map((p, idx) => (
                    <div key={p.id} className="group relative rounded-md border bg-white p-1">
                      <img
                        src={p.thumb}
                        alt={`Pagina ${idx + 1}`}
                        className="h-28 w-full rounded object-contain bg-slate-50 transition-transform"
                        style={{ transform: p.extraRotation ? `rotate(${p.extraRotation}deg)` : undefined }}
                      />
                      <p className="mt-1 truncate text-center text-[9px] text-slate-500" title={p.srcName}>
                        {idx + 1} · {p.srcName}
                      </p>
                      <div className="absolute right-1 top-1 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => movePage(idx, -1)} disabled={idx === 0} aria-label="Sposta prima"
                          className="rounded bg-slate-900/80 p-1 text-white disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                        <button type="button" onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} aria-label="Sposta dopo"
                          className="rounded bg-slate-900/80 p-1 text-white disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                        <button type="button" onClick={() => rotatePage(p.id)} aria-label="Ruota 90 gradi"
                          className="rounded bg-slate-900/80 p-1 text-white"><RotateCw className="h-3 w-3" /></button>
                        <button type="button" onClick={() => removePage(p.id)} aria-label="Elimina pagina"
                          className="rounded bg-rose-600/90 p-1 text-white"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="shrink-0 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    {pages.length} pagine · passa col mouse su una pagina per riordinare, ruotare o eliminare
                  </p>
                  <Button onClick={exportPdf} disabled={exporting} className="gap-2 bg-orange-500 hover:bg-orange-600">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Esporta PDF
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
