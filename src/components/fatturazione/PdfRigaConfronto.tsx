import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trovaRighePdf, type RigaPdfTrovata } from "@/lib/fatturazione/rigaPdf";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
interface Occorrenza extends RigaPdfTrovata {
  pagina: number;
}
interface PropsPdfOriginale {
  url: string;
  nome: string;
  ricerca?: string;
}
export function PdfRigaConfronto(props: PropsPdfOriginale) {
  return (
    <PdfOriginaleCanvas
      key={`${props.url}:${props.ricerca ?? ""}`}
      {...props}
    />
  );
}
function PdfOriginaleCanvas({ url, nome, ricerca = "" }: PropsPdfOriginale) {
  const doc = useRef<PDFDocumentProxy | null>(null),
    canvas = useRef<HTMLCanvasElement | null>(null);
  const [pronto, setPronto] = useState(false),
    [risultati, setRisultati] = useState<Occorrenza[]>([]),
    [paginaLetta, setPaginaLetta] = useState(0),
    [totale, setTotale] = useState(0),
    [indice, setIndice] = useState(0),
    [paginaPdf, setPaginaPdf] = useState(1),
    [avvisoRicerca, setAvvisoRicerca] = useState<string | null>(null),
    [errore, setErrore] = useState<string | null>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    let annullato = false,
      proprio: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const [lib, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        lib.GlobalWorkerOptions.workerSrc =
          typeof worker.default === "string"
            ? worker.default
            : "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
        if (annullato) return;
        const task = lib.getDocument({ url, withCredentials: false });
        proprio = task;
        const p = await task.promise;
        if (annullato) {
          await p.loadingTask.destroy();
          return;
        }
        doc.current = p;
        setTotale(p.numPages);
        setPronto(true);
      } catch {
        if (!annullato)
          setErrore("Anteprima PDF non disponibile. Puoi aprire l’originale.");
      }
    })();
    return () => {
      annullato = true;
      doc.current = null;
      if (proprio) void proprio.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!pronto || !doc.current) return;
    if (!ricerca.trim()) return;
    let annullato = false;
    const p = doc.current;
    void (async () => {
      const trovate: Occorrenza[] = [];
      try {
        for (let n = 1; n <= p.numPages; n++) {
          if (annullato) return;
          const pagina = await p.getPage(n);
          const testo = await pagina.getTextContent();
          if (annullato) return;
          trovate.push(
            ...trovaRighePdf(
              testo.items.filter((t) => "str" in t),
              ricerca,
            ).map((r) => ({ ...r, pagina: n })),
          );
          if (n % 5 === 0 || n === p.numPages) {
            setPaginaLetta(n);
            setRisultati([...trovate]);
          }
        }
      } catch {
        if (!annullato)
          setAvvisoRicerca(
            "Non è stato possibile cercare su tutte le pagine. Puoi comunque sfogliare il PDF.",
          );
      }
    })();
    return () => {
      annullato = true;
    };
  }, [pronto, ricerca]);
  const attiva = risultati[indice];
  const visualizzata = attiva?.pagina ?? Math.min(paginaPdf, totale || 1);
  useEffect(() => {
    if (!pronto || !doc.current) return;
    let annullato = false,
      render: RenderTask | undefined;
    void (async () => {
      try {
        const pagina = await doc.current!.getPage(visualizzata);
        if (annullato || !canvas.current) return;
        const view = pagina.getViewport({ scale: 1.5 }),
          el = canvas.current,
          ctx = el.getContext("2d");
        if (!ctx) throw new Error("Canvas non disponibile");
        el.width = view.width;
        el.height = view.height;
        render = pagina.render({
          canvas: el,
          canvasContext: ctx,
          viewport: view,
        });
        await render.promise;
        if (annullato) return;
        if (!attiva) {
          setBox(null);
          return;
        }
        const coords = [
          ...view.convertToViewportPoint(attiva.x, attiva.y),
          ...view.convertToViewportPoint(
            attiva.x + attiva.larghezza,
            attiva.y + attiva.altezza,
          ),
        ];
        setBox({
          left: (100 * Math.min(coords[0], coords[2])) / view.width,
          top: (100 * Math.min(coords[1], coords[3])) / view.height,
          width: (100 * Math.abs(coords[2] - coords[0])) / view.width,
          height: (100 * Math.abs(coords[3] - coords[1])) / view.height,
        });
      } catch (e) {
        if (
          !annullato &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setErrore("Anteprima non disponibile. Apri il PDF originale.");
      }
    })();
    return () => {
      annullato = true;
      render?.cancel();
    };
  }, [attiva, visualizzata, pronto]);
  const finita = pronto && (!ricerca.trim() || paginaLetta === totale);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded border bg-blue-50/50 p-2 text-xs">
        {ricerca ? (
          <>
            <Search className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate" title={ricerca}>
              Voce: {ricerca}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">Anteprima PDF</span>
        )}
        {pronto && !attiva && (
          <>
            <span>
              Pagina {visualizzata} di {totale}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Pagina PDF precedente"
              disabled={visualizzata <= 1}
              onClick={() => setPaginaPdf((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Pagina PDF successiva"
              disabled={visualizzata >= totale}
              onClick={() => setPaginaPdf((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
        {ricerca && !finita && !errore && !avvisoRicerca && (
          <span role="status" className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Ricerca {paginaLetta}/{totale || "…"}
          </span>
        )}
        {risultati.length > 0 && (
          <>
            <span>
              Pagina {attiva?.pagina} · {indice + 1}/{risultati.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Occorrenza precedente"
              disabled={indice === 0}
              onClick={() => setIndice((i) => i - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Occorrenza successiva"
              disabled={indice >= risultati.length - 1}
              onClick={() => setIndice((i) => i + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {errore && (
        <p role="alert" className="text-xs text-amber-800">
          {errore}
        </p>
      )}
      {avvisoRicerca && (
        <p role="alert" className="text-xs text-amber-800">
          {avvisoRicerca}
        </p>
      )}
      {ricerca && finita && !risultati.length && !errore && !avvisoRicerca && (
        <p role="status" className="text-xs text-muted-foreground">
          Voce non trovata nel testo del PDF. Se è una scansione senza testo,
          confronta l’immagine originale.
        </p>
      )}
      {pronto && !errore ? (
        <div className="min-h-0 flex-1 overflow-auto rounded border bg-slate-100 p-2">
          <div className="relative mx-auto w-full max-w-4xl">
            <canvas
              ref={canvas}
              className="block h-auto w-full bg-white"
              aria-label={`Pagina ${visualizzata} di ${nome}`}
            />
            {box && (
              <div
                aria-label="Riga trovata nel PDF"
                className="pointer-events-none absolute border-2 border-amber-500 bg-yellow-300/30"
                style={{
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                }}
              />
            )}
          </div>
        </div>
      ) : (
        !errore && (
          <p
            role="status"
            className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento PDF…
          </p>
        )
      )}
    </div>
  );
}
