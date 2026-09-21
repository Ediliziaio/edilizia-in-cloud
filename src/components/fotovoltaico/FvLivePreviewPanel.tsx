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
 *    corrispondente (match per testo nel contentDocument) — best-effort.
 *  - Zoom (CSS zoom) + adatta.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ExternalLink, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fotoBlocchiDalSito,
  fotoDiSerieDalSito,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { useFitScale, LARGHEZZA_A4_PX } from "@/components/shared/livePreview/useFitScale";
import { useFileRiservato, useImmaginiModelloFirmate } from "@/hooks/useFileRiservati";
import { CAMPI_IMMAGINE_FOTOVOLTAICO } from "@/lib/storage/immaginiModelloPdf";

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
function demoBase(): FvPdfTemplateData {
  return {
    azienda: { name: "La tua azienda", tagline: "Fotovoltaico chiavi in mano", phone: "+39 02 000 000", email: "info@azienda.it", website: "https://azienda.it", vat_number: "IT00000000000" },
    cliente: { nome: "Mario", cognome: "Rossi", indirizzo: "Via Roma 1", comune: "Milano", cap: "20100", provincia: "MI", tipologia_immobile: "Villa singola" },
    progetto: { numero: "FV-ANTEPRIMA", titolo: "Mario Rossi", creato_il: "2026-01-01T10:00:00Z", valido_giorni: 30, venditore: "Consulente", potenza_kwp: 6, numero_pannelli: 12, has_accumulo: true, capacita_accumulo_kwh: 10, consumo_annuo_kwh: 4200, costo_kwh_attuale: 0.32, profilo_consumo: "misto", ore_sole_annue: 1450, superficie_tetto_disponibile_mq: 55 },
    costi: { prezzo_vendita_iva_inclusa: 18000, iva_perc: 10, detrazione_eur: 9000, detrazione_perc: 50, costo_netto_dopo_detrazione: 9000 },
    finanziamento: { finanziaria: "Finanziaria", durata_mesi: 84, rata_mensile: 230, tan_perc: 4, taeg_perc: 5, importo_finanziato: 18000 },
    scenario: { risparmio_mensile_eur: 150, risparmio_anno1_eur: 1800, risparmio_25_anni_eur: 46000, payback_anni: 8, npv_25_anni: 24000, cassa_anno_per_anno: [{ anno: 0, cumulato: -18000 }, { anno: 8, cumulato: 0 }, { anno: 25, cumulato: 46000 }] },
    flows: { produzione_kwh: 7400, autoconsumo_kwh: 4200, ceduto_rete_kwh: 3200, prelievo_rete_kwh: 900, autoconsumo_pct: 0.57, autosufficienza_pct: 0.78, consumo_da_rete_pct: 0.22, consumo_da_fv_pct: 0.78 },
    // Gli stessi dati senza batteria (profilo misto: 35% della produzione).
    flows_senza_accumulo: { produzione_kwh: 7400, autoconsumo_kwh: 2590, ceduto_rete_kwh: 4810, prelievo_rete_kwh: 2510, autoconsumo_pct: 0.35, autosufficienza_pct: 0.51, consumo_da_rete_pct: 0.49, consumo_da_fv_pct: 0.51 },
    // Le foto di serie del documento, dal sito stesso: come le vedrà il cliente.
    foto_di_serie: typeof window !== "undefined" ? fotoDiSerieDalSito(window.location.origin) : null,
    componenti: [
      { categoria: "pannello", descrizione: "Pannello 500 W", marca: "—", modello: "PV500", quantita: 12, potenza_w: 500, garanzia_anni: 25 },
      { categoria: "inverter", descrizione: "Inverter ibrido 6 kW", marca: "—", modello: "INV6", quantita: 1, garanzia_anni: 10 },
      { categoria: "accumulo", descrizione: "Batteria 10 kWh", marca: "—", modello: "BAT10", quantita: 1, capacita_kwh: 10, garanzia_anni: 10 },
    ],
  };
}

// Sezione editor → parole-chiave (nel testo HTML) per l'auto-scroll. Best-effort:
// le sezioni certe (recensioni, cta) matchano; le altre, se non trovate, non scrollano.
const SECTION_KEYWORDS: Record<string, string[]> = {
  page_chi_siamo: ["chi siamo"],
  page_percorso: ["come lavoriamo", "il tuo percorso"],
  page_consulente: ["per parlarne ancora", "la tua consulenza", "il tuo referente"],
  page_recensioni: ["cosa dicono i clienti", "recensioni", "testimonianze"],
  page_render: ["i nostri cantieri", "render", "simulazione"],
  page_cta: ["per accettare la proposta", "il prossimo passo", "cosa fare adesso"],
};

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedScrollRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adattamento del foglio alla larghezza del pannello (condiviso con gli altri
  // vertical): si ricalcola da solo quando la finestra o la sidebar cambiano.
  const fit = useFitScale(LARGHEZZA_A4_PX);
  const scalaEffettiva = fit.scala;

  const buildHtml = useMemo(() => {
    return () => {
      const base = demoBase();
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

  // Al reload dell'iframe (srcDoc cambiato) ripristina lo scroll.
  const handleIframeLoad = () => {
    try { iframeRef.current?.contentWindow?.scrollTo(0, savedScrollRef.current); } catch { /* noop */ }
  };

  // Auto-scroll alla sezione attiva (match per testo nel contentDocument).
  useEffect(() => {
    if (!activeSection) return;
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow;
    const doc = iframe?.contentDocument;
    if (!win || !doc) return;

    if (activeSection === "page_cover") {
      win.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const keywords = SECTION_KEYWORDS[activeSection];
    if (!keywords) return;

    // Trova l'elemento "foglia" (testo più corto) che contiene una keyword.
    let best: HTMLElement | null = null;
    let bestLen = Infinity;
    const all = doc.body ? Array.from(doc.body.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,td,th,strong,b,p,div,span")) : [];
    for (const el of all) {
      const txt = (el.textContent ?? "").trim().toLowerCase();
      if (!txt || txt.length > 120) continue;
      if (keywords.some((k) => txt.includes(k)) && txt.length < bestLen) {
        best = el;
        bestLen = txt.length;
      }
    }
    if (best) best.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, html]);

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
            Anteprima live preventivo
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
