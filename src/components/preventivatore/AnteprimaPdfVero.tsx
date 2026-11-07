/**
 * Il PDF vero del preventivo, a destra del wizard (07/11/2026).
 *
 * Florin: «a destra vorrei vedere l'anteprima proprio del PDF che si va a generare». Qui si disegnano le
 * pagine che riceve il cliente, fatte dalla stessa funzione del bottone «Scarica»: il modulo passa `genera()`
 * e una `chiave` che cambia solo quando cambia qualcosa che finisce nel PDF.
 *
 * - Si rifà da solo ~1,5 s dopo l'ultima modifica; le pagine vecchie restano finché arrivano le nuove.
 * - Un giro alla volta: se si modifica mentre il PDF si sta facendo, lo si rifà una volta sola alla fine.
 * - Fermo quando non serve: `attivo` falso (colonna chiusa o nascosta) o scheda del browser non in vista.
 *
 * Nato da `AnteprimaPdfLive` di Serramenti, che ora lo usa.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** Fa il PDF, come il bottone «Scarica». */
  genera: () => Promise<Blob>;
  /** Cambia solo quando cambia qualcosa che finisce nel PDF. */
  chiave: string;
  /** Falso: non genera niente (colonna chiusa, preventivo non ancora salvato…). */
  attivo: boolean;
  className?: string;
}

export const RITARDO_PDF_VERO_MS = 1500;

/** La scheda del browser è in vista? Una scheda in secondo piano non rifà il PDF. */
function useSchedaInVista(): boolean {
  const [inVista, setInVista] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const cambia = () => setInVista(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", cambia);
    return () => document.removeEventListener("visibilitychange", cambia);
  }, []);
  return inVista;
}

export function AnteprimaPdfVero({ genera, chiave, attivo, className }: Props) {
  const [stato, setStato] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [inCorso, setInCorso] = useState(false);
  const [pagine, setPagine] = useState(0);
  const [errore, setErrore] = useState("");
  const [aggiornatoAlle, setAggiornatoAlle] = useState<string | null>(null);
  const [larghezza, setLarghezza] = useState(0);
  const [rev, setRev] = useState(0);
  const contenitore = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = useRef<any>(null);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaChiave = useRef("");
  const occupato = useRef(false);
  const daRifare = useRef(false);
  const smontato = useRef(false);
  const generaRef = useRef(genera);
  generaRef.current = genera;
  const inVista = useSchedaInVista();
  const vivo = attivo && inVista;

  useEffect(() => () => { smontato.current = true; }, []);

  const giro = useCallback(async (): Promise<void> => {
    if (occupato.current) { daRifare.current = true; return; }
    occupato.current = true;
    setInCorso(true);
    setStato((s) => (s === "ready" ? s : "loading"));
    try {
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as unknown;
        pdfjs.GlobalWorkerOptions.workerSrc = typeof worker === "string" ? worker : "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
      }
      const blob = await generaRef.current();
      const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      if (smontato.current) return;
      doc.current = pdf;
      setPagine(pdf.numPages);
      setStato("ready");
      setErrore("");
      setAggiornatoAlle(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
      setRev((n) => n + 1);
    } catch (e) {
      if (smontato.current) return;
      console.error("[pdf-vero] errore", e);
      setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      setStato((s) => (s === "ready" ? s : "error"));
    } finally {
      occupato.current = false;
      if (!smontato.current) setInCorso(false);
      if (daRifare.current && !smontato.current) {
        daRifare.current = false;
        void giro();
      }
    }
  }, []);

  useEffect(() => {
    if (!vivo || chiave === ultimaChiave.current) return;
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = setTimeout(() => {
      ultimaChiave.current = chiave;
      void giro();
    }, doc.current ? RITARDO_PDF_VERO_MS : 200);
    return () => { if (attesa.current) clearTimeout(attesa.current); };
  }, [chiave, vivo, giro]);

  useEffect(() => {
    const el = contenitore.current;
    if (!el || typeof ResizeObserver === "undefined") return;
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
    let task: { cancel: () => void } | null = null;
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
        const t = pagina.render({ canvasContext: ctx, viewport: vista, canvas });
        task = t;
        try {
          await t.promise;
        } catch (e) {
          // Annullato da un render più recente: non è un errore.
          if ((e as { name?: string })?.name !== "RenderingCancelledException") throw e;
        }
      }
    })().catch((e) => console.error("[pdf-vero] pagina non disegnata", e));
    return () => { annullato = true; task?.cancel(); };
  }, [rev, larghezza, stato]);

  return (
    <div className={cn("flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col rounded-md border border-slate-200 bg-slate-100", className)}>
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5" role="status">
          {inCorso && <Loader2 className="h-3 w-3 animate-spin" />}
          {inCorso
            ? "Aggiorno il PDF…"
            : stato === "ready"
              ? `${pagine} ${pagine === 1 ? "pagina" : "pagine"} · aggiornato alle ${aggiornatoAlle}`
              : "PDF del preventivo"}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => void giro()} aria-label="Aggiorna il PDF ora">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div ref={contenitore} className="flex-1 space-y-2 overflow-y-auto p-1">
        {stato === "error" ? (
          <div className="m-3 space-y-2 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Il PDF non si è generato: {errore}</p>
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void giro()}>Riprova</Button>
          </div>
        ) : stato !== "ready" ? (
          <p className="m-6 text-center text-xs text-slate-500">{attivo ? "Preparo il PDF…" : "Il PDF si prepara quando il pannello è aperto."}</p>
        ) : (
          Array.from({ length: pagine }, (_, i) => (
            <canvas key={i} data-pagina={i + 1} className="block h-auto w-full bg-white shadow-sm" aria-label={`Pagina ${i + 1} di ${pagine}`} />
          ))
        )}
      </div>
    </div>
  );
}

export default AnteprimaPdfVero;
