/**
 * Il PDF vero del preventivo, a lato del wizard, che si rifà da solo ~1,5 secondi dopo ogni modifica
 * (misure, scelte, righe, dati del cliente). Pipeline come SerramentiLivePreviewPanel, ma sui dati veri:
 * renderSerramentoBlob → pdfjs → un canvas per pagina. Le pagine vecchie restano finché non arrivano le nuove.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SerramentoPdfPayload } from "@/hooks/useSerramentoPDF";

interface Props {
  payload: SerramentoPdfPayload;
  /** Se false non genera nulla (il pannello è chiuso). */
  attivo: boolean;
}

const RITARDO_MS = 1500;

export function AnteprimaPdfLive({ payload, attivo }: Props) {
  const [stato, setStato] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aggiorna, setAggiorna] = useState(false);
  const [pagine, setPagine] = useState(0);
  const [errore, setErrore] = useState("");
  const [larghezza, setLarghezza] = useState(0);
  const [rev, setRev] = useState(0);
  const contenitore = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = useRef<any>(null);
  const generazione = useRef(0);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaChiave = useRef("");
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  // Cambia solo quando cambia qualcosa che finisce nel PDF.
  const chiave = useMemo(() => JSON.stringify([payload.detail, payload.template ?? null, payload.company ?? null]), [payload.detail, payload.template, payload.company]);

  const genera = async () => {
    const mia = ++generazione.current;
    setAggiorna(true);
    setStato((s) => (s === "ready" ? s : "loading"));
    try {
      const [{ renderSerramentoBlob }, pdfjs] = await Promise.all([import("@/hooks/useSerramentoPDF"), import("pdfjs-dist")]);
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
      const blob = await renderSerramentoBlob({ ...payloadRef.current, useFreshTemplate: false });
      if (mia !== generazione.current) return;
      const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      if (mia !== generazione.current) return;
      doc.current = pdf;
      setPagine(pdf.numPages);
      setStato("ready");
      setRev((n) => n + 1);
    } catch (e) {
      if (mia !== generazione.current) return;
      console.error("[pdf-live] errore", e);
      setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      setStato((s) => (s === "ready" ? s : "error"));
    } finally {
      if (mia === generazione.current) setAggiorna(false);
    }
  };

  useEffect(() => {
    if (!attivo || chiave === ultimaChiave.current) return;
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = setTimeout(() => {
      ultimaChiave.current = chiave;
      void genera();
    }, doc.current ? RITARDO_MS : 200);
    return () => {
      if (attesa.current) clearTimeout(attesa.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, attivo]);

  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const misura = () => setLarghezza(el.clientWidth);
    misura();
    const o = new ResizeObserver(misura);
    o.observe(el);
    return () => o.disconnect();
  }, [stato]);

  // Una pagina per canvas, alla larghezza del pannello.
  useEffect(() => {
    if (stato !== "ready" || !doc.current || !contenitore.current || larghezza < 50) return;
    let annullato = false;
    // Il render in corso va fermato prima di ridisegnare lo stesso canvas (cambio di larghezza o PDF nuovo).
    let inCorso: { cancel: () => void } | null = null;
    (async () => {
      for (let i = 1; i <= doc.current.numPages; i++) {
        const canvas = contenitore.current?.querySelector<HTMLCanvasElement>(`canvas[data-pagina="${i}"]`);
        if (!canvas) continue;
        const pagina = await doc.current.getPage(i);
        if (annullato) return;
        const base = pagina.getViewport({ scale: 1 });
        const scala = ((larghezza - 8) / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        const vista = pagina.getViewport({ scale: scala });
        canvas.width = vista.width;
        canvas.height = vista.height;
        canvas.style.width = "100%";
        const ctx = canvas.getContext("2d");
        if (!ctx || annullato) continue;
        const task = pagina.render({ canvasContext: ctx, viewport: vista, canvas });
        inCorso = task;
        try {
          await task.promise;
        } catch (e) {
          // Annullato da un render più recente: non è un errore.
          if ((e as { name?: string })?.name !== "RenderingCancelledException") throw e;
        }
      }
    })().catch((e) => console.error("[pdf-live] pagina non disegnata", e));
    return () => {
      annullato = true;
      inCorso?.cancel();
    };
  }, [rev, larghezza, stato]);

  return (
    <div className="flex h-[calc(100vh-9rem)] max-h-[640px] flex-col rounded-md border border-slate-200 bg-slate-100">
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          {aggiorna ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {aggiorna ? "Aggiorno il PDF…" : stato === "ready" ? `${pagine} pagine · si aggiorna da solo` : "PDF del preventivo"}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => void genera()} aria-label="Aggiorna ora">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div ref={contenitore} className="flex-1 space-y-2 overflow-y-auto p-1">
        {stato === "error" ? (
          <p className="m-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Il PDF non si è generato: {errore}
          </p>
        ) : stato !== "ready" ? (
          <p className="m-6 text-center text-xs text-slate-500">Preparo il PDF…</p>
        ) : (
          Array.from({ length: pagine }, (_, i) => (
            <canvas key={i} data-pagina={i + 1} className="block h-auto w-full bg-white shadow-sm" aria-label={`Pagina ${i + 1} di ${pagine}`} />
          ))
        )}
      </div>
    </div>
  );
}

export default AnteprimaPdfLive;
