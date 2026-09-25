/**
 * FvLivePreviewPanel — Anteprima preventivo Fotovoltaico LIVE persistente, a lato
 * dell'editor template (parità concettuale col pannello Serramenti).
 *
 * Il preventivo FV è HTML (renderFvPdfHtml, condiviso con la edge function), non
 * @react-pdf → l'anteprima è un <iframe srcDoc> che si aggiorna in modo DEBOUNCED
 * (~350ms) ad ogni modifica del template, PRESERVANDO la posizione di scroll.
 *
 * Funzioni:
 *  - Auto-scroll: cambiando pagina a sinistra scrolla dentro l'iframe alla sezione
 *    identificata dai metadati data-fv-section, anche dopo riordino o rinomina.
 *  - Zoom (CSS zoom) + adatta.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ExternalLink, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  badgeGaranzieDalSito,
  fotoBlocchiDalSito,
  fotoDiSerieDalSito,
  fotoPagineDalSito,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { useFitScale, LARGHEZZA_A4_PX } from "@/components/shared/livePreview/useFitScale";
import { useFileRiservato, useImmaginiModelloFirmate } from "@/hooks/useFileRiservati";
import { CAMPI_IMMAGINE_FOTOVOLTAICO } from "@/lib/storage/immaginiModelloPdf";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { fvEditorPreviewSection, fvPreviewTarget } from "./fvSemanticPreview";

interface Props {
  /** Stato corrente del template FV in editing. */
  form: Record<string, unknown>;
  companyName?: string | null;
  logoUrl?: string | null;
  /** Sezione attiva nell'editor → auto-scroll alla sezione HTML. */
  activeSection?: string | null;
  debounceMs?: number;
}

// Dati cliente/impianto DEMO per le pagine dato-dipendenti (parità col dialog).
// Shared intervention-aware demonstration data.

// Il documento FV è una pagina A4 (`width: 210mm` in fvHtmlTemplate). Il
// pannello laterale è più stretto: senza adattamento si vedeva metà foglio
// tagliato — era il "template FV zoomato al massimo con le scritte
// disallineate". L'adattamento ora vive in useFitScale, condiviso.

export function FvLivePreviewPanel({ form: formSalvato, companyName, logoUrl: logoSalvato, activeSection, debounceMs = 350 }: Props) {
  // Le immagini del modello sono percorsi nel bucket privato: l'anteprima usa i
  // link firmati (vedi supabase/functions/_shared/immaginiModelloPdf.ts).
  const form = useImmaginiModelloFirmate(formSalvato, CAMPI_IMMAGINE_FOTOVOLTAICO);
  const logoUrl = useFileRiservato(logoSalvato) || null;
  const [html, setHtml] = useState("");
  const [sectionNotice, setSectionNotice] = useState<{ section: string; text: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedScrollRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adattamento del foglio alla larghezza del pannello (condiviso con gli altri
  // vertical): si ricalcola da solo quando la finestra o la sidebar cambiano.
  const fit = useFitScale(LARGHEZZA_A4_PX);
  const scalaEffettiva = fit.scala;

  const buildHtml = useMemo(() => {
    return () => {
      const base = buildFvPreviewBase(form as FvPdfTemplateData["template"]);
      const f = form ?? {};
      const str = (k: string) => {
        const v = f[k];
        return typeof v === "string" && v.trim() ? v : undefined;
      };
      const data: FvPdfTemplateData = {
        ...base,
        azienda: {
          ...base.azienda,
          name: str("ragione_sociale") || companyName || base.azienda.name,
          phone: str("contatto_telefono") || base.azienda.phone,
          email: str("contatto_email") || base.azienda.email,
          website: str("url_sito") || base.azienda.website,
        },
        template: {
          ...(f as FvPdfTemplateData["template"]),
          logo_url: (str("logo_url") ?? logoUrl ?? null) as string | null,
        },
        // Le foto dei blocchi accesi, dal sito o già firmate: come le vedrà il cliente.
        blocchi_foto: typeof window !== "undefined" ? fotoBlocchiDalSito(window.location.origin, f as FvPdfTemplateData["template"]) : null,
        badge_garanzie: typeof window !== "undefined" ? badgeGaranzieDalSito(window.location.origin) : null,
        foto_pagine: typeof window !== "undefined" ? fotoPagineDalSito(window.location.origin, f as FvPdfTemplateData["template"]) : null,
      };
      try {
        return renderFvPdfHtml(data);
      } catch (e) {
        return `<div style="padding:32px;font-family:sans-serif;color:#b91c1c">Anteprima non disponibile: ${String(e)}</div>`;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, companyName, logoUrl]);

  const formKey = useMemo(
    () => JSON.stringify(form) + "|" + (companyName ?? "") + "|" + (logoUrl ?? ""),
    [form, companyName, logoUrl],
  );

  // Genera subito al mount.
  useEffect(() => {
    setHtml(buildHtml());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggiornamento DEBOUNCED preservando lo scroll.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try { savedScrollRef.current = iframeRef.current?.contentWindow?.scrollY ?? 0; } catch { /* cross-origin guard */ }
      setHtml(buildHtml());
    }, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);

  const syncSection = () => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!activeSection || !doc || !fvEditorPreviewSection(activeSection)) return;
    const target = fvPreviewTarget(doc, activeSection);
    const pages = Array.from(doc.querySelectorAll(".page"));
    // srcDoc may still be loading. Do not declare a section absent from an empty document.
    if (!pages.length) return;
    const page = target ? pages.indexOf(target) + 1 : 0;
    setSectionNotice({ section: activeSection, text: page > 0 ? `Sezione selezionata · pagina ${page} di ${pages.length} (anteprima HTML)` : "Sezione non presente in questa anteprima: vista mantenuta." });
    // Scroll only the iframe, never its parent editor/window.
    if (target && win) win.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  };

  // srcDoc loads asynchronously: sync the new document, not the preceding DOM.
  const handleIframeLoad = () => {
    try { iframeRef.current?.contentWindow?.scrollTo(0, savedScrollRef.current); } catch { /* noop */ }
    syncSection();
  };

  // Navigation within an already loaded document uses the same semantic anchor.
  useEffect(() => {
    syncSection();
    const iframe = iframeRef.current;
    if (!iframe) return;
    const observer = new ResizeObserver(() => { if (iframe.clientWidth > 0) syncSection(); });
    observer.observe(iframe);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const openInTab = () => {
    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Eye className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600 truncate">
            Anteprima live HTML
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-0.5 mr-1 rounded-md border bg-white px-0.5">
            <Button size="icon" variant="ghost" onClick={fit.riduci} disabled={!fit.puoRidurre} title="Riduci" className="h-6 w-6">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            {/* La percentuale mostra la scala REALE del foglio, non un 100%
                che non corrispondeva a nulla di visibile. */}
            <button type="button" onClick={fit.adatta} title="Adatta alla larghezza" className="text-[10px] tabular-nums text-slate-600 hover:text-sky-600 min-w-[34px] text-center">
              {fit.percentuale}%
            </button>
            <Button size="icon" variant="ghost" onClick={fit.aumenta} disabled={!fit.puoAumentare} title="Ingrandisci" className="h-6 w-6">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={fit.adatta} title="Adatta larghezza" className="h-6 w-6">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="icon" variant="ghost" onClick={openInTab} title="Apri in nuova scheda" className="h-7 w-7">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-b shrink-0">
        Vista HTML del modello. Verifica l'impaginazione nel PDF esportato.
      </p>
      {sectionNotice?.section === activeSection && <p role="status" className="shrink-0 border-b px-3 py-1 text-[10px] text-muted-foreground">{sectionNotice.text}</p>}
      <div ref={fit.ref} className="flex-1 overflow-auto bg-muted/40">
        {/* DUE livelli, e servono entrambi:
            - quello esterno RISERVA lo spazio già ridotto (794 × scala), così
              il layout non lascia una fascia vuota né una barra orizzontale;
            - quello interno tiene la misura VERA del foglio (794) e viene
              rimpicciolito da `scale`. Mettere la larghezza ridotta sullo
              stesso elemento che porta il transform lo rimpicciolirebbe DUE
              volte (misurato: 172px invece di 373). */}
        <div style={{ width: LARGHEZZA_A4_PX * scalaEffettiva, height: "100%", overflow: "hidden" }}>
          <div
            style={{
              width: LARGHEZZA_A4_PX,
              height: `${100 / scalaEffettiva}%`,
              transform: `scale(${scalaEffettiva})`,
              transformOrigin: "top left",
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={html}
              onLoad={handleIframeLoad}
              title="Anteprima preventivo Fotovoltaico"
              className="border-0 bg-white"
              style={{ width: LARGHEZZA_A4_PX, height: "100%", border: 0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
