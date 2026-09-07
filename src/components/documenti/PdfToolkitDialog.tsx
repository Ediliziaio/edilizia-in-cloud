/**
 * PdfToolkitDialog — Strumenti PDF leggeri, 100% client-side.
 *
 * Quattro funzioni, zero invio a server esterni (i file restano nel browser;
 * solo "Salva in EiC Drive" carica il RISULTATO sullo storage aziendale):
 *   1. Immagini → PDF: più PNG/JPG/WebP in un unico PDF (riordino, A4 o
 *      pagina su misura dell'immagine).
 *   2. Modifica PDF: carica uno o più PDF → anteprima pagine, riordina,
 *      ruota, elimina, unisci più file in uno → esporta.
 *   3. Testo & firma: su una pagina non ruotata puoi posizionare testi
 *      (click sul punto) e firmare a mano libera — tutto vettoriale/overlay.
 *   4. Comprimi: re-rasterizza le pagine a qualità scelta per ridurre il
 *      peso (il testo diventa immagine, avviso esplicito all'utente).
 *
 * Librerie: pdf-lib (scrittura/manipolazione) + pdfjs-dist (render).
 * Tutto lazy: questo file è un chunk separato caricato alla prima apertura.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ImagePlus, FilePlus2, Trash2, RotateCw, ArrowUp, ArrowDown,
  Download, Loader2, FileText, ShieldCheck, Type, PenLine,
  CloudUpload, Shrink, Eraser, Check, AlertTriangle,
} from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
const MAX_IMAGES = 60;
const MAX_PDF_MB = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

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

/** pdfjs con worker Vite configurato (una sola volta). */
async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}

/** Render anteprime pagina (dataURL JPEG) + rotazione interna di ogni pagina. */
async function renderPdfThumbs(bytes: Uint8Array): Promise<{ thumbs: string[]; rotates: number[] }> {
  const pdfjsLib = await getPdfjs();
  // pdfjs trasferisce il buffer al worker (lo svuota): passiamo una COPIA,
  // i bytes originali servono ancora a pdf-lib per l'export.
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const thumbs: string[] = [];
  const rotates: number[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbs.push(canvas.toDataURL("image/jpeg", 0.72));
    rotates.push(page.rotate ?? 0);
  }
  void pdf.destroy();
  return { thumbs, rotates };
}

/** Render grande di UNA pagina per l'editor testo/firma. scale = px per pt. */
async function renderPageBig(bytes: Uint8Array, pageIndex: number): Promise<{ url: string; w: number; h: number; scale: number }> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.6, 1000 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.85);
  void pdf.destroy();
  return { url, w: canvas.width, h: canvas.height, scale };
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
  srcRotate: number;   // /Rotate interno della pagina originale
  srcName: string;
}

type AnnotColor = "black" | "red" | "blue";
interface TextAnnot {
  id: string;
  fx: number; // frazione 0..1 della larghezza pagina
  fy: number; // frazione 0..1 dell'altezza pagina (dall'alto)
  text: string;
  size: number; // pt
  color: AnnotColor;
}
interface PageAnnots {
  texts: TextAnnot[];
  drawDataUrl?: string; // firma/disegno a mano libera (PNG overlay full-page)
}

const ANNOT_RGB: Record<AnnotColor, ReturnType<typeof rgb>> = {
  black: rgb(0.05, 0.05, 0.05),
  red: rgb(0.86, 0.15, 0.15),
  blue: rgb(0.12, 0.3, 0.85),
};
const ANNOT_CSS: Record<AnnotColor, string> = {
  black: "#0d0d0d",
  red: "#dc2626",
  blue: "#1e4dd9",
};

type CompressQuality = "alta" | "media" | "forte";
const COMPRESS_PRESET: Record<CompressQuality, { scale: number; jpeg: number; label: string }> = {
  alta: { scale: 1.6, jpeg: 0.8, label: "Alta qualità" },
  media: { scale: 1.25, jpeg: 0.62, label: "Equilibrata" },
  forte: { scale: 1.0, jpeg: 0.45, label: "Massima compressione" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PdfToolkitDialog({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? null;

  // — Immagini → PDF —
  const [images, setImages] = useState<ImgItem[]>([]);
  const [pageFormat, setPageFormat] = useState<"a4" | "fit">("a4");
  const [imgBusy, setImgBusy] = useState<"download" | "drive" | null>(null);

  // — Modifica PDF —
  const srcDocsRef = useRef<Array<{ name: string; bytes: Uint8Array }>>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [expBusy, setExpBusy] = useState<"download" | "drive" | null>(null);

  // — Testo & firma (editor per singola pagina) —
  const [annots, setAnnots] = useState<Record<string, PageAnnots>>({});
  const [annotPage, setAnnotPage] = useState<PageItem | null>(null);
  const [annotPreview, setAnnotPreview] = useState<{ url: string; w: number; h: number; scale: number } | null>(null);
  const [annotMode, setAnnotMode] = useState<"text" | "draw">("text");
  const [annotText, setAnnotText] = useState("");
  const [annotSize, setAnnotSize] = useState<12 | 16 | 24>(16);
  const [annotColor, setAnnotColor] = useState<AnnotColor>("blue");
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  // — Comprimi —
  const [cmpFile, setCmpFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [cmpQuality, setCmpQuality] = useState<CompressQuality>("media");
  const [cmpProcessing, setCmpProcessing] = useState(false);
  const [cmpResult, setCmpResult] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [cmpBusy, setCmpBusy] = useState<"download" | "drive" | null>(null);

  // Cleanup completo alla chiusura
  useEffect(() => {
    if (open) return;
    setImages((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.url));
      return [];
    });
    setPages([]);
    srcDocsRef.current = [];
    setAnnots({});
    setAnnotPage(null);
    setAnnotPreview(null);
    setCmpFile(null);
    setCmpResult(null);
  }, [open]);

  // ── Salva in EiC Drive ─────────────────────────────────────────────────────
  // Il PDF generato viene caricato sullo storage aziendale e registrato in
  // document_analysis_results (la tabella che alimenta la lista EiC Drive)
  // come "documento_generico" già completato — niente analisi AI, costo zero.
  const saveToDrive = useCallback(async (bytes: Uint8Array, fileName: string, pagesCount: number | null): Promise<boolean> => {
    if (!companyId || !user) {
      toast.error("Sessione non valida: ricarica la pagina");
      return false;
    }
    const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${companyId}/pdf-toolkit-${Date.now()}-${safe}`;
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    let bucket = "documenti-smart";
    let upErr = (await supabase.storage.from(bucket).upload(path, blob, { contentType: "application/pdf" })).error;
    if (upErr && upErr.message?.includes("Bucket not found")) {
      bucket = "computi";
      upErr = (await supabase.storage.from(bucket).upload(path, blob, { contentType: "application/pdf" })).error;
    }
    if (upErr) {
      toast.error("Upload su Drive fallito", { description: upErr.message });
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from("document_analysis_results").insert({
      company_id: companyId,
      storage_bucket: bucket,
      storage_path: path,
      file_name: fileName,
      mime_type: "application/pdf",
      file_size_bytes: bytes.byteLength,
      pages_count: pagesCount,
      doc_type: "documento_generico",
      parser_used: "pdf_toolkit",
      status: "completed",
      uploaded_by: user.id,
      structured_fields: { source: "pdf_toolkit" },
    });
    if (insErr) {
      toast.error("Registrazione in Drive fallita", { description: insErr.message });
      return false;
    }
    toast.success("Salvato in EiC Drive", { description: fileName });
    return true;
  }, [companyId, user]);

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

  const buildImagesBytes = useCallback(async (): Promise<Uint8Array> => {
    const doc = await PDFDocument.create();
    for (const item of images) {
      const raw = new Uint8Array(await item.file.arrayBuffer());
      const img = item.file.type === "image/jpeg"
        ? await doc.embedJpg(raw)
        : item.file.type === "image/png"
          ? await doc.embedPng(raw)
          : await doc.embedPng(await reencodeToPng(item.file));
      if (pageFormat === "a4") {
        const [pw, ph] = [595.28, 841.89];
        const margin = 24;
        const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const page = doc.addPage([pw, ph]);
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      } else {
        const cap = 1400;
        const scale = Math.min(1, cap / Math.max(img.width, img.height));
        const page = doc.addPage([img.width * scale, img.height * scale]);
        page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
      }
    }
    return doc.save();
  }, [images, pageFormat]);

  const handleImagesAction = useCallback(async (target: "download" | "drive") => {
    if (images.length === 0) return;
    setImgBusy(target);
    try {
      const bytes = await buildImagesBytes();
      const base = images[0].file.name.replace(/\.[^.]+$/, "");
      const name = `${base || "immagini"}.pdf`;
      if (target === "download") {
        downloadPdf(bytes, name);
        toast.success(`PDF generato (${images.length} pagin${images.length === 1 ? "a" : "e"})`);
      } else {
        await saveToDrive(bytes, name, images.length);
      }
    } catch (e) {
      toast.error("Errore nella generazione del PDF", { description: String(e) });
    } finally {
      setImgBusy(null);
    }
  }, [images, buildImagesBytes, saveToDrive]);

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
        const { thumbs, rotates } = await renderPdfThumbs(bytes);
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
            srcRotate: rotates[pageIndex] % 360,
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
    const a = annots[id];
    if (a && (a.texts.length > 0 || a.drawDataUrl)) {
      toast.info("Pagina con testo/firma: non ruotabile", {
        description: "Rimuovi prima le annotazioni dalla pagina.",
      });
      return;
    }
    setPages((prev) => prev.map((p) =>
      p.id === id ? { ...p, extraRotation: ((p.extraRotation + 90) % 360) as PageItem["extraRotation"] } : p,
    ));
  }, [annots]);

  const removePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setAnnots((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Testo & firma ──────────────────────────────────────────────────────────

  const openAnnotEditor = useCallback(async (p: PageItem) => {
    // Il posizionamento click→coordinate PDF è affidabile solo quando la
    // pagina non ha rotazioni (né interne né applicate qui nel tool).
    if (p.srcRotate !== 0 || p.extraRotation !== 0) {
      toast.info("Testo e firma disponibili solo su pagine non ruotate", {
        description: "Questa pagina ha una rotazione: riportala a 0° oppure annota le altre.",
      });
      return;
    }
    setAnnotMode("text");
    setAnnotPage(p);
    setAnnotPreview(null);
    try {
      const preview = await renderPageBig(srcDocsRef.current[p.srcIdx].bytes, p.pageIndex);
      setAnnotPreview(preview);
    } catch (e) {
      toast.error("Anteprima pagina non disponibile", { description: String(e) });
      setAnnotPage(null);
    }
  }, []);

  // Ripristina la firma esistente sul canvas quando l'editor apre
  useEffect(() => {
    if (!annotPreview || !annotPage) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.width = annotPreview.w;
    canvas.height = annotPreview.h;
    const existing = annots[annotPage.id]?.drawDataUrl;
    if (existing) {
      const img = new Image();
      img.onload = () => canvas.getContext("2d")!.drawImage(img, 0, 0);
      img.src = existing;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotPreview, annotPage?.id]);

  const placeText = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotPage || annotMode !== "text") return;
    const text = annotText.trim();
    if (!text) {
      toast.info("Scrivi prima il testo, poi clicca sul punto della pagina");
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    setAnnots((prev) => {
      const cur = prev[annotPage.id] ?? { texts: [] };
      return {
        ...prev,
        [annotPage.id]: {
          ...cur,
          texts: [...cur.texts, { id: crypto.randomUUID(), fx, fy, text, size: annotSize, color: annotColor }],
        },
      };
    });
  }, [annotPage, annotMode, annotText, annotSize, annotColor]);

  const removeText = useCallback((pageId: string, textId: string) => {
    setAnnots((prev) => {
      const cur = prev[pageId];
      if (!cur) return prev;
      return { ...prev, [pageId]: { ...cur, texts: cur.texts.filter((t) => t.id !== textId) } };
    });
  }, []);

  const drawPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, phase: "down" | "move" | "up") => {
    if (annotMode !== "draw" || !annotPage) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const ctx = canvas.getContext("2d")!;
    if (phase === "down") {
      drawingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.strokeStyle = ANNOT_CSS[annotColor];
      ctx.lineWidth = Math.max(2, 2.2 * (annotPreview?.scale ?? 1));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (phase === "move") {
      if (!drawingRef.current) return;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      // Persisti subito la firma nello stato annotazioni
      const dataUrl = canvas.toDataURL("image/png");
      setAnnots((prev) => {
        const cur = prev[annotPage.id] ?? { texts: [] };
        return { ...prev, [annotPage.id]: { ...cur, drawDataUrl: dataUrl } };
      });
    }
  }, [annotMode, annotPage, annotColor, annotPreview?.scale]);

  const clearDrawing = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    if (annotPage) {
      setAnnots((prev) => {
        const cur = prev[annotPage.id];
        if (!cur) return prev;
        return { ...prev, [annotPage.id]: { ...cur, drawDataUrl: undefined } };
      });
    }
  }, [annotPage]);

  // ── Export (Modifica PDF) ──────────────────────────────────────────────────

  const buildEditedBytes = useCallback(async (): Promise<Uint8Array> => {
    const out = await PDFDocument.create();
    const loaded = new Map<number, PDFDocument>();
    for (const p of pages) {
      if (!loaded.has(p.srcIdx)) {
        loaded.set(p.srcIdx, await PDFDocument.load(srcDocsRef.current[p.srcIdx].bytes, { ignoreEncryption: true }));
      }
    }
    const needsFont = pages.some((p) => (annots[p.id]?.texts.length ?? 0) > 0);
    let font: PDFFont | null = null;
    if (needsFont) font = await out.embedFont(StandardFonts.Helvetica);
    let textErrors = 0;
    for (const p of pages) {
      const src = loaded.get(p.srcIdx)!;
      const [copied] = await out.copyPages(src, [p.pageIndex]);
      if (p.extraRotation !== 0) {
        copied.setRotation(degrees((copied.getRotation().angle + p.extraRotation) % 360));
      }
      const a = annots[p.id];
      if (a) {
        const { width: W, height: H } = copied.getSize();
        for (const t of a.texts) {
          try {
            copied.drawText(t.text, {
              x: t.fx * W,
              // il click indica il centro verticale del testo → compensa la baseline
              y: H - t.fy * H - t.size * 0.35,
              size: t.size,
              font: font!,
              color: ANNOT_RGB[t.color],
            });
          } catch {
            textErrors += 1; // caratteri fuori WinAnsi (es. emoji)
          }
        }
        if (a.drawDataUrl) {
          const png = await out.embedPng(a.drawDataUrl);
          copied.drawImage(png, { x: 0, y: 0, width: W, height: H });
        }
      }
      out.addPage(copied);
    }
    if (textErrors > 0) {
      toast.warning(`${textErrors} test${textErrors === 1 ? "o" : "i"} con caratteri non supportati (es. emoji) salt${textErrors === 1 ? "ato" : "ati"}`);
    }
    return out.save();
  }, [pages, annots]);

  const handleExportAction = useCallback(async (target: "download" | "drive") => {
    if (pages.length === 0) return;
    setExpBusy(target);
    try {
      const bytes = await buildEditedBytes();
      const uniqueSrc = new Set(pages.map((p) => p.srcIdx));
      const base = srcDocsRef.current[pages[0].srcIdx].name.replace(/\.pdf$/i, "");
      const name = uniqueSrc.size > 1 ? "documenti-uniti.pdf" : `${base}-modificato.pdf`;
      if (target === "download") {
        downloadPdf(bytes, name);
        toast.success(`PDF esportato (${pages.length} pagin${pages.length === 1 ? "a" : "e"})`);
      } else {
        await saveToDrive(bytes, name, pages.length);
      }
    } catch (e) {
      toast.error("Errore nell'esportazione", { description: String(e) });
    } finally {
      setExpBusy(null);
    }
  }, [pages, buildEditedBytes, saveToDrive]);

  // ── Comprimi ───────────────────────────────────────────────────────────────

  const pickCompressFile = useCallback(async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(`File troppo grande (max ${MAX_PDF_MB} MB)`);
      return;
    }
    setCmpResult(null);
    setCmpFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }, []);

  const runCompress = useCallback(async () => {
    if (!cmpFile) return;
    setCmpProcessing(true);
    setCmpResult(null);
    try {
      const preset = COMPRESS_PRESET[cmpQuality];
      const pdfjsLib = await getPdfjs();
      const pdf = await pdfjsLib.getDocument({ data: cmpFile.bytes.slice() }).promise;
      const out = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: preset.scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const jpg = await out.embedJpg(canvas.toDataURL("image/jpeg", preset.jpeg));
        const outPage = out.addPage([base.width, base.height]);
        outPage.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });
      }
      const numPages = pdf.numPages;
      void pdf.destroy();
      const bytes = await out.save();
      if (bytes.byteLength >= cmpFile.bytes.byteLength) {
        toast.info("Il PDF è già ben ottimizzato", {
          description: `Risultato ${formatBytes(bytes.byteLength)} ≥ originale ${formatBytes(cmpFile.bytes.byteLength)}: prova "Massima compressione" o tieni l'originale.`,
        });
      }
      setCmpResult({ bytes, pages: numPages });
    } catch (e) {
      toast.error("Compressione fallita", { description: String(e) });
    } finally {
      setCmpProcessing(false);
    }
  }, [cmpFile, cmpQuality]);

  const handleCompressAction = useCallback(async (target: "download" | "drive") => {
    if (!cmpFile || !cmpResult) return;
    setCmpBusy(target);
    try {
      const name = cmpFile.name.replace(/\.pdf$/i, "") + "-compresso.pdf";
      if (target === "download") {
        downloadPdf(cmpResult.bytes, name);
        toast.success("PDF compresso scaricato");
      } else {
        await saveToDrive(cmpResult.bytes, name, cmpResult.pages);
      }
    } finally {
      setCmpBusy(null);
    }
  }, [cmpFile, cmpResult, saveToDrive]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const annotsOf = (id: string): PageAnnots | undefined => annots[id];
  const annotCount = (id: string) => {
    const a = annots[id];
    if (!a) return 0;
    return a.texts.length + (a.drawDataUrl ? 1 : 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            Strumenti PDF
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Elaborazione nel tuo browser: nessun file inviato a server esterni. "Salva in Drive" carica solo il risultato sul tuo EiC Drive.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="img2pdf" className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0 grid w-full grid-cols-3">
            <TabsTrigger value="img2pdf" className="gap-1.5">
              <ImagePlus className="h-3.5 w-3.5" /> Immagini → PDF
            </TabsTrigger>
            <TabsTrigger value="editpdf" className="gap-1.5">
              <FilePlus2 className="h-3.5 w-3.5" /> Modifica / unisci
            </TabsTrigger>
            <TabsTrigger value="compress" className="gap-1.5">
              <Shrink className="h-3.5 w-3.5" /> Comprimi
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
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void handleImagesAction("drive")} disabled={imgBusy !== null} className="gap-2">
                      {imgBusy === "drive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                      Salva in Drive
                    </Button>
                    {/* Niente scarico su telefono: «Salva in Drive» resta. */}
                    {!isMobile && (
                      <Button onClick={() => void handleImagesAction("download")} disabled={imgBusy !== null} className="gap-2 bg-orange-500 hover:bg-orange-600">
                        {imgBusy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Scarica PDF ({images.length})
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Tab 2: Modifica / unisci PDF ── */}
          <TabsContent value="editpdf" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
            {/* Editor testo & firma per la pagina selezionata */}
            {annotPage ? (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Testo & firma — pagina {pages.findIndex((p) => p.id === annotPage.id) + 1}
                    </p>
                    <div className="flex overflow-hidden rounded-md border">
                      <button
                        type="button"
                        onClick={() => setAnnotMode("text")}
                        className={cn("h-7 px-2.5 text-[11px] font-medium flex items-center gap-1",
                          annotMode === "text" ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100")}
                      >
                        <Type className="h-3 w-3" /> Testo
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnotMode("draw")}
                        className={cn("h-7 px-2.5 text-[11px] font-medium flex items-center gap-1 border-l",
                          annotMode === "draw" ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100")}
                      >
                        <PenLine className="h-3 w-3" /> Firma
                      </button>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => { setAnnotPage(null); setAnnotPreview(null); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Fatto
                  </Button>
                </div>

                <div className="shrink-0 flex flex-wrap items-center gap-2">
                  {annotMode === "text" ? (
                    <>
                      <input
                        value={annotText}
                        onChange={(e) => setAnnotText(e.target.value)}
                        placeholder="Scrivi il testo, poi clicca sul punto della pagina…"
                        className="h-8 min-w-0 flex-1 rounded-md border px-2.5 text-sm outline-none focus:border-orange-400"
                      />
                      <div className="flex overflow-hidden rounded-md border">
                        {([[12, "A"], [16, "A"], [24, "A"]] as const).map(([s, l], i) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAnnotSize(s)}
                            className={cn("h-8 w-8 font-semibold border-l first:border-l-0",
                              i === 0 ? "text-[10px]" : i === 1 ? "text-[13px]" : "text-[17px]",
                              annotSize === s ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100")}
                            aria-label={`Dimensione testo ${s}pt`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500 flex-1">Disegna la firma direttamente sulla pagina (mouse o touch).</p>
                      <Button size="sm" variant="outline" onClick={clearDrawing} className="gap-1.5 h-8">
                        <Eraser className="h-3.5 w-3.5" /> Pulisci firma
                      </Button>
                    </>
                  )}
                  <div className="flex items-center gap-1">
                    {(Object.keys(ANNOT_CSS) as AnnotColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAnnotColor(c)}
                        className={cn("h-6 w-6 rounded-full border-2 transition-transform",
                          annotColor === c ? "scale-110 border-orange-400" : "border-transparent")}
                        style={{ backgroundColor: ANNOT_CSS[c] }}
                        aria-label={`Colore ${c}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-slate-100 p-3">
                  {!annotPreview ? (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                    </div>
                  ) : (
                    <div
                      className={cn("relative mx-auto w-fit shadow-md", annotMode === "text" && "cursor-crosshair")}
                      onClick={placeText}
                    >
                      <img src={annotPreview.url} alt="Pagina" className="block max-w-full" draggable={false} />
                      {/* Marker testi posizionati */}
                      {(annotsOf(annotPage.id)?.texts ?? []).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          title="Clicca per rimuovere"
                          onClick={(e) => { e.stopPropagation(); removeText(annotPage.id, t.id); }}
                          className="absolute -translate-y-1/2 whitespace-pre font-helvetica leading-none hover:opacity-60"
                          style={{
                            left: `${t.fx * 100}%`,
                            top: `${t.fy * 100}%`,
                            fontSize: t.size * annotPreview.scale,
                            color: ANNOT_CSS[t.color],
                            fontFamily: "Helvetica, Arial, sans-serif",
                          }}
                        >
                          {t.text}
                        </button>
                      ))}
                      {/* Canvas firma (attivo solo in modalità draw) */}
                      <canvas
                        ref={drawCanvasRef}
                        className={cn("absolute inset-0 h-full w-full touch-none", annotMode === "draw" ? "cursor-crosshair" : "pointer-events-none")}
                        onPointerDown={(e) => drawPointer(e, "down")}
                        onPointerMove={(e) => drawPointer(e, "move")}
                        onPointerUp={(e) => drawPointer(e, "up")}
                        onPointerLeave={(e) => drawPointer(e, "up")}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <label className="shrink-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-5 text-center transition-colors hover:bg-orange-50">
                  {loadingPdf ? <Loader2 className="h-6 w-6 animate-spin text-orange-500" /> : <FilePlus2 className="h-6 w-6 text-orange-500" />}
                  <span className="text-sm font-semibold text-slate-800">
                    {pages.length > 0 ? "Aggiungi un altro PDF (unisci)" : "Scegli uno o più PDF"}
                  </span>
                  <span className="text-[11px] text-slate-500">Poi riordina, ruota, elimina pagine o aggiungi testo e firma</span>
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
                          {annotCount(p.id) > 0 && (
                            <span className="absolute left-1 top-1 rounded bg-orange-500 px-1 py-0.5 text-[8px] font-bold text-white">
                              {annotCount(p.id)} annot.
                            </span>
                          )}
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
                            <button type="button" onClick={() => void openAnnotEditor(p)} aria-label="Aggiungi testo o firma"
                              className="rounded bg-orange-500/95 p-1 text-white"><Type className="h-3 w-3" /></button>
                            <button type="button" onClick={() => removePage(p.id)} aria-label="Elimina pagina"
                              className="rounded bg-rose-600/90 p-1 text-white"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500">
                        {pages.length} pagine · passa col mouse su una pagina: ordina, ruota, <span className="text-orange-600 font-semibold">testo/firma</span>, elimina
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => void handleExportAction("drive")} disabled={expBusy !== null} className="gap-2">
                          {expBusy === "drive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                          Salva in Drive
                        </Button>
                        {/* Niente scarico su telefono: «Salva in Drive» resta. */}
                        {!isMobile && (
                          <Button onClick={() => void handleExportAction("download")} disabled={expBusy !== null} className="gap-2 bg-orange-500 hover:bg-orange-600">
                            {expBusy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Esporta PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Tab 3: Comprimi ── */}
          <TabsContent value="compress" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
            <label className="shrink-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-5 text-center transition-colors hover:bg-orange-50">
              <Shrink className="h-6 w-6 text-orange-500" />
              <span className="text-sm font-semibold text-slate-800">
                {cmpFile ? cmpFile.name : "Scegli il PDF da comprimere"}
              </span>
              <span className="text-[11px] text-slate-500">
                {cmpFile ? `${formatBytes(cmpFile.bytes.byteLength)} — clicca per cambiare file` : `Massimo ${MAX_PDF_MB} MB`}
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { void pickCompressFile(e.target.files); e.target.value = ""; }}
              />
            </label>

            {cmpFile && (
              <>
                <div className="shrink-0 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Qualità</span>
                  <div className="flex overflow-hidden rounded-md border">
                    {(Object.keys(COMPRESS_PRESET) as CompressQuality[]).map((q, i) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => { setCmpQuality(q); setCmpResult(null); }}
                        className={cn("h-8 px-3 text-[11px] font-medium transition-colors",
                          i > 0 && "border-l",
                          cmpQuality === q ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100")}
                      >
                        {COMPRESS_PRESET[q].label}
                      </button>
                    ))}
                  </div>
                  <Button onClick={() => void runCompress()} disabled={cmpProcessing} className="gap-2 bg-orange-500 hover:bg-orange-600 ml-auto">
                    {cmpProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shrink className="h-4 w-4" />}
                    Comprimi
                  </Button>
                </div>

                <div className="shrink-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-snug text-amber-800">
                    La compressione trasforma le pagine in immagini: il testo non sarà più selezionabile o ricercabile.
                    Ideale per scansioni e foto, da evitare su contratti dove serve copiare il testo.
                  </p>
                </div>

                {cmpResult && (
                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50 px-3 py-2.5">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{formatBytes(cmpFile.bytes.byteLength)}</span>
                      {" → "}
                      <span className={cn("font-bold", cmpResult.bytes.byteLength < cmpFile.bytes.byteLength ? "text-emerald-600" : "text-amber-600")}>
                        {formatBytes(cmpResult.bytes.byteLength)}
                      </span>
                      {cmpResult.bytes.byteLength < cmpFile.bytes.byteLength && (
                        <span className="ml-1.5 text-[11px] font-semibold text-emerald-600">
                          (−{Math.round((1 - cmpResult.bytes.byteLength / cmpFile.bytes.byteLength) * 100)}%)
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void handleCompressAction("drive")} disabled={cmpBusy !== null} className="gap-1.5">
                        {cmpBusy === "drive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        Salva in Drive
                      </Button>
                      <Button size="sm" onClick={() => void handleCompressAction("download")} disabled={cmpBusy !== null} className="gap-1.5 bg-orange-500 hover:bg-orange-600">
                        {cmpBusy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Scarica
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
