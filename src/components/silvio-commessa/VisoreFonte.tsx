/**
 * Il documento al punto citato (31/10/2026, fase 3, lotto 3.2): la ⓘ di un valore apre il
 * PDF alla pagina che il lettore ha indicato, col testo citato evidenziato, o la foto.
 *
 * Le pagine si disegnano con pdf.js, come l'anteprima dei preventivi
 * (src/components/shared/PdfBlobLivePreviewPanel.tsx): stesso caricamento pigro della
 * libreria e del worker. Il testo della pagina dà la posizione della citazione
 * (`trovaCitazione`); sopra la pagina, un riquadro giallo per ogni pezzo trovato.
 *
 * Mai un iframe verso lo storage (la CSP non lo ammette): il documento arriva come Blob.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trovaCitazione } from "./documentoCitato";

export interface DocumentoDelVisore {
  titolo: string;
  tipo: "pdf" | "immagine";
  /** Il documento: lo scarica chi apre il visore (file del popup, storage, indirizzo firmato). */
  carica: () => Promise<Blob>;
  pagina: number | null;
  citazione: string | null;
  /** «pagina 4», per il sottotitolo. */
  dove: string | null;
}

interface Riquadro { x: number; y: number; w: number; h: number }

interface PaginaPdf {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }): { promise: Promise<void>; cancel?: () => void };
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }> }>;
}
interface DocumentoPdf { numPages: number; getPage(n: number): Promise<PaginaPdf>; destroy?: () => unknown }

/** Il rettangolo di un pezzo di testo sulla pagina disegnata (coordinate del canvas). */
function riquadroDi(item: { transform?: number[]; width?: number; height?: number }, vista: { transform: number[] }, scala: number): Riquadro | null {
  const t = item.transform;
  if (!t || t.length < 6) return null;
  const [a, b, c, d, e, f] = vista.transform;
  // Il punto di base del testo, portato nella vista (stessa matrice di pdf.js).
  const x = a * t[4] + c * t[5] + e;
  const y = b * t[4] + d * t[5] + f;
  const altezza = (item.height || Math.hypot(t[2], t[3]) || 10) * scala;
  return { x, y: y - altezza, w: (item.width ?? 0) * scala, h: altezza * 1.2 };
}

export function VisoreFonte({ documento, onChiudi }: { documento: DocumentoDelVisore | null; onChiudi: () => void }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<DocumentoPdf | null>(null);
  const [immagine, setImmagine] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [riquadri, setRiquadri] = useState<Riquadro[]>([]);
  const [trovata, setTrovata] = useState<boolean | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [carico, setCarico] = useState(false);

  // Il documento: si scarica una volta, all'apertura.
  useEffect(() => {
    if (!documento) return;
    let annullato = false;
    let indirizzo: string | null = null;
    let aperto: DocumentoPdf | null = null;
    (async () => {
      // Il reset nel giro asincrono, come l'anteprima dei PDF: niente setState sincroni nell'effetto.
      await Promise.resolve();
      if (annullato) return;
      setErrore(null); setPdf(null); setImmagine(null); setRiquadri([]); setTrovata(null); setCarico(true);
      try {
        const blob = await documento.carica();
        if (annullato) return;
        if (documento.tipo === "immagine") {
          indirizzo = URL.createObjectURL(blob);
          setImmagine(indirizzo);
          return;
        }
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default as string;
        aperto = (await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise) as unknown as DocumentoPdf;
        if (annullato) { void aperto.destroy?.(); return; }
        setPagina(Math.min(Math.max(1, documento.pagina ?? 1), aperto.numPages));
        setPdf(aperto);
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : "Non riesco ad aprire il documento.");
      } finally {
        if (!annullato) setCarico(false);
      }
    })();
    return () => {
      annullato = true;
      if (indirizzo) URL.revokeObjectURL(indirizzo);
      void aperto?.destroy?.();
    };
  }, [documento]);

  // La pagina: disegnata alla larghezza del riquadro, con la citazione evidenziata.
  useEffect(() => {
    if (!pdf || !documento) return;
    let annullato = false;
    let compito: { cancel?: () => void } | null = null;
    (async () => {
      try {
        const p = await pdf.getPage(pagina);
        const larghezza = Math.max(280, (contenitore.current?.clientWidth ?? 800) - 16);
        const base = p.getViewport({ scale: 1 });
        const scala = Math.min(2, larghezza / base.width);
        const vista = p.getViewport({ scale: scala });
        const canvas = tela.current;
        const ctx = canvas?.getContext?.("2d");
        if (canvas && ctx) {
          canvas.width = vista.width;
          canvas.height = vista.height;
          const r = p.render({ canvasContext: ctx, viewport: vista, canvas });
          compito = r;
          await r.promise;
        }
        const testo = await p.getTextContent();
        if (annullato) return;
        const indici = pagina === (documento.pagina ?? pagina) ? trovaCitazione(testo.items.map((x) => x.str ?? ""), documento.citazione) : [];
        setRiquadri(indici.map((i) => riquadroDi(testo.items[i], vista, scala)).filter((x): x is Riquadro => !!x));
        setTrovata(documento.citazione ? indici.length > 0 : null);
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : "Non riesco a disegnare la pagina.");
      }
    })();
    return () => { annullato = true; compito?.cancel?.(); };
  }, [pdf, pagina, documento]);

  const pagine = pdf?.numPages ?? 0;

  return (
    <Dialog open={!!documento} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-16px)] max-w-3xl flex-col gap-3 p-4 sm:p-6">
        <div className="min-w-0 pr-8">
          <DialogTitle className="truncate text-base">{documento?.titolo}</DialogTitle>
          <DialogDescription className="text-xs">
            {documento?.dove ? `Il valore viene da ${documento.dove}.` : "Il documento da cui viene il valore."}
            {trovata === false && " Il testo citato non si trova uguale nella pagina: guardalo a occhio."}
          </DialogDescription>
        </div>
        {documento?.citazione && (
          <blockquote className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm italic text-slate-800">
            «{documento.citazione}»
          </blockquote>
        )}
        {errore && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}
        <div ref={contenitore} className="min-h-0 flex-1 overflow-auto rounded-md border bg-slate-100 p-2" data-pagina={pdf ? pagina : undefined}>
          {carico && <p className="flex items-center gap-2 p-4 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Apro il documento…</p>}
          {immagine && <img src={immagine} alt={documento?.titolo ?? "documento"} className="mx-auto h-auto max-w-full" />}
          {pdf && (
            <div className="relative mx-auto w-fit">
              <canvas ref={tela} className="block h-auto max-w-full bg-white shadow-sm" aria-label={`Pagina ${pagina} di ${pagine}`} />
              {riquadri.map((r, i) => (
                <span key={i} aria-hidden className="pointer-events-none absolute rounded-sm bg-amber-300/45 ring-1 ring-amber-500"
                  style={{ left: r.x, top: r.y, width: Math.max(8, r.w), height: Math.max(8, r.h) }} />
              ))}
            </div>
          )}
        </div>
        {pdf && (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />Prima
            </Button>
            <p className="text-sm text-slate-600" role="status">Pagina {pagina} di {pagine}</p>
            <Button type="button" variant="outline" size="sm" className="gap-1" disabled={pagina >= pagine} onClick={() => setPagina(pagina + 1)}>
              Dopo<ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
