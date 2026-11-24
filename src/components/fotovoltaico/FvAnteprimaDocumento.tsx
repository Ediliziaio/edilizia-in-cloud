import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Printer, ZoomIn, ZoomOut } from "lucide-react";
import { useGoogleMapsDocumentoFv } from "@/hooks/useGoogleMapsDocumentoFv";
import { sottoLarghezza } from "@/hooks/useSottoLarghezza";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Legge lo stesso documento emesso, senza popup e senza reimpaginarlo. */
export function FvAnteprimaDocumento({ html, numero, onClose, onPrint, loading }: {
  html: string | null;
  numero: string;
  onClose: () => void;
  onPrint: () => void;
  loading: boolean;
}) {
  const t = useT();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [viewport, setViewport] = useState({ width: 794, height: 600 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [fit, setFit] = useState<"width" | "page">(() => sottoLarghezza(768) ? "width" : "page");
  const [pagine, setPagine] = useState<string[]>([]);
  const [pagina, setPagina] = useState(0);
  const paginaCorrente = useRef(0);
  const mappe = useGoogleMapsDocumentoFv(html);
  useEffect(() => () => cleanup.current?.(), [html]);
  useEffect(() => {
    if (!host) return;
    const node = host;
    const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, [host]);
  const scale = zoom ?? Math.min(1, Math.max(.2, (viewport.width - 24) / 794), fit === "page" ? Math.max(.2, (viewport.height - 24) / 1123) : 1);
  useEffect(() => {
    const indice = paginaCorrente.current;
    const id = requestAnimationFrame(() => {
      const page = frame.current?.contentDocument?.querySelectorAll<HTMLElement>(".page")[indice];
      if (page) frame.current?.contentWindow?.scrollTo({ top: page.offsetTop, behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
    // Mantiene la pagina scelta quando cambia la scala o l'altezza disponibile.
  }, [scale, viewport.height]);
  const vai = (indice: number) => {
    const page = frame.current?.contentDocument?.querySelectorAll<HTMLElement>(".page")[indice];
    if (page) { frame.current?.contentWindow?.scrollTo({ top: page.offsetTop, behavior: "auto" }); paginaCorrente.current = indice; setPagina(indice); }
  };
  const caricato = () => {
    cleanup.current?.();
    const win = frame.current?.contentWindow;
    const pages = Array.from(frame.current?.contentDocument?.querySelectorAll<HTMLElement>(".page") ?? []);
    setPagine(pages.map(p => (p.querySelector<HTMLElement>("h1")?.innerText?.replace(/\s+/g, " ").trim() || p.querySelector("img")?.alt || "Pagina").slice(0, 55)));
    setPagina(0);
    paginaCorrente.current = 0;
    if (!win) return;
    const scorri = () => {
      const indice = Math.max(0, pages.findIndex(p => p.offsetTop + p.offsetHeight > win.scrollY + 8));
      paginaCorrente.current = indice;
      setPagina(indice);
    };
    win.addEventListener("scroll", scorri, { passive: true });
    cleanup.current = () => win.removeEventListener("scroll", scorri);
    preparaMappe();
  };
  const preparaMappe = () => {
    mappe.carica(frame.current?.contentDocument);
  };
  const documento = useMemo(() => html?.replace(/<\/head>/i,
    '<style>@media screen{html,body{margin:0!important;padding:0!important;background:#f1f5f9!important}.pdf-action-bar{display:none!important}.page{margin:0 auto 16px!important;box-shadow:none!important}}</style></head>'), [html]);
  return <Dialog open={html !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="preventivo-touch flex max-w-[1100px] max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left">
        <DialogTitle className="text-base">{t("Preventivo {numero}", { numero: String(numero ?? "") })}</DialogTitle>
        <p className="text-xs text-slate-500">{t("Documento emesso, con le schede tecniche allegate.")}</p>
      </DialogHeader>
      {mappe.caricando && <p role="status" className="border-b bg-slate-50 px-4 py-2 text-sm">{t("Caricamento della vista Google del tetto prima della stampa…")}</p>}
      {mappe.errore && <div role="alert" className="border-b bg-amber-50 px-4 py-2 text-sm">{mappe.errore} <button type="button" className="underline" onClick={preparaMappe}>{t("Riprova mappa")}</button></div>}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white px-3 py-2 [&_button]:min-h-11 [&_button]:min-w-11" role="toolbar" aria-label={t("Comandi anteprima preventivo")}>
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto">
        <Button variant="outline" size="icon" aria-label={t("Riduci anteprima")} onClick={() => setZoom(Math.max(.2, scale - .1))}><ZoomOut size={16}/></Button>
        <Button variant="outline" className="px-2" onClick={() => { setZoom(null); setFit("width"); }}>{t("Larghezza")}</Button>
        <Button variant="outline" className="px-2" aria-label={t("Pagina intera")} onClick={() => { setZoom(null); setFit("page"); }}><span className="sm:hidden">{t("Pagina")}</span><span className="max-sm:hidden">{t("Pagina intera")}</span></Button>
        <span className="min-w-10 text-center text-xs tabular-nums" role="status">{Math.round(scale * 100)}%</span>
        <Button variant="outline" size="icon" aria-label={t("Ingrandisci anteprima")} onClick={() => setZoom(Math.min(2, scale + .1))}><ZoomIn size={16}/></Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 max-sm:basis-full">
          <Button variant="outline" size="icon" aria-label={t("Pagina precedente del preventivo")} disabled={pagina <= 0} onClick={() => vai(pagina - 1)}><ChevronLeft size={16}/></Button>
          <select aria-label={t("Pagina del preventivo")} className="h-11 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm" value={pagina} disabled={!pagine.length} onChange={e => vai(Number(e.target.value))}>
            {pagine.length ? pagine.map((titolo, i) => <option key={i} value={i}>{i + 1} / {pagine.length} · {titolo}</option>) : <option>{t("Caricamento…")}</option>}
          </select>
          <Button variant="outline" size="icon" aria-label={t("Pagina successiva del preventivo")} disabled={pagina >= pagine.length - 1} onClick={() => vai(pagina + 1)}><ChevronRight size={16}/></Button>
        </div>
        <Button className="max-sm:w-full" onClick={onPrint} disabled={loading || mappe.caricando || !!mappe.errore}><Printer size={16} className="mr-2"/>{t("Stampa / Salva PDF")}</Button>
      </div>
      <div ref={setHost} className="h-[70dvh] min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative mx-auto" style={{ width: 794 * scale, height: Math.max(1, viewport.height - 24) }}>
          <iframe ref={frame} onLoad={caricato} title={t("Anteprima del preventivo emesso")} sandbox="allow-same-origin allow-modals" srcDoc={documento}
            style={{ position: "absolute", border: 0, width: 794, height: Math.max(1, viewport.height - 24) / scale, transform: "scale(" + scale + ")", transformOrigin: "top left" }}/>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
