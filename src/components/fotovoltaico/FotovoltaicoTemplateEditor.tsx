/**
 * FotovoltaicoTemplateEditor — editor del template PDF del modulo Fotovoltaico.
 *
 * Usato dentro la tab "Template Moduli Vendita" della pagina
 * Impostazioni → Libreria Template Preventivi.
 *
 * Configura `fv_template_pdf` per la company corrente:
 *  - Branding (logo, colori, font)
 *  - Presentazione impresa (HTML/testo libero)
 *  - Recensioni clienti + cantieri galleria + certificazioni
 *  - Contatti (telefono, whatsapp, email, sito)
 *  - Economia default (validità, recesso, acconto %)
 */
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditorSafe as RichTextEditor } from "@/components/ui/rich-text-editor-safe";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save, Plus, Trash2, Loader2, Sparkles, Quote, BadgeCheck, Building2,
  Upload, Image as ImageIcon, AlertTriangle, CheckCircle2, ShieldCheck, Sun,
  Settings2, FileText, ExternalLink, Eye, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AiTemplateGenerator } from "@/components/preventivi/AiTemplateGenerator";
import type { AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";
import { FvPagesOrderEditor } from "@/components/fotovoltaico/FvPagesOrderEditor";
import { MacroPagineDedicateManager } from "@/components/listino/MacroPagineDedicateManager";
import type { FvPdfPageOrderItem } from "@/lib/fotovoltaico/pdfPages";
import {
  useListinoMacrocategorie,
  type ListinoMacrocategoria,
} from "@/hooks/useListinoMacrocategorie";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { blankTemplateForKind, type QuoteTemplate } from "@/types/quoteTemplate";
import {
  useTemplatePdf as useFvTemplatePdf,
  useUpsertTemplatePdf as useFvUpsertTemplatePdf,
} from "@/lib/fotovoltaico/queries";
import { COVER_PRESETS, detectActiveCoverPreset } from "./coverPresets";
import { useCompanyAnagraficaForTemplate, inheritedPlaceholder } from "@/hooks/useCompanyAnagraficaForTemplate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage } from "./coverStockImages";
import {
  buildFvTemplateQualityItems,
  DEFAULT_FV_FAQ,
  DEFAULT_FV_GARANZIE,
  type FvFaqItem,
  type FvGaranziaConversione,
  type FvTemplateQualityItem,
} from "@/lib/fotovoltaico/preventivatore";

// Anteprima PDF completa (lazy: trascina renderFvPdfHtml ~1700 righe fuori dal chunk iniziale)
const FvTemplatePreviewDialog = lazy(() => import("./FvTemplatePreviewDialog"));
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import type { GalleryLavoroItem } from "@/types/gallery";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

// ─── Types locali (no dipendenza forte da fv types globali) ─────────────────

interface FvRecensione {
  quote: string;
  autore: string;
  citta?: string;
  intervento?: string;
  /** Foto opzionale dell'impianto installato, mostrata accanto alla recensione nel PDF. */
  foto_url?: string;
}
interface FvCertificazione {
  nome: string;
  ente?: string;
}
interface FvCantiereGalleria {
  citta?: string;
  descrizione: string;
  foto_url?: string;
}

interface FvTemplate {
  logo_url?: string | null;
  pdf_cover_logo_url?: string | null;
  colore_primario?: string | null;
  colore_accento?: string | null;
  font_titoli?: string | null;
  font_corpo?: string | null;
  pdf_cover_hero?: string | null;
  pdf_cover_subhero?: string | null;
  pdf_cover_subhero_template?: string | null;
  pdf_cover_eyebrow?: string | null;
  pdf_cover_image_url?: string | null;
  pdf_cover_overlay_opacity?: number | null;
  pdf_cover_bg_color?: string | null;
  pdf_cover_text_color?: string | null;
  pdf_cover_text_align?: "left" | "center" | null;
  pdf_cover_logo_position?: "top_left" | "top_right" | "top_center" | "hidden" | null;
  pdf_cover_show_client_card?: boolean | null;
  // Cover parity con Serramenti (preset 1-click + layout completo).
  // Colonne aggiunte da migration 20271109000000_fv_cover_parity.sql.
  pdf_cover_show_decoration?: boolean | null;
  pdf_cover_decoration_style?: "square" | "circle" | "line" | "pattern" | "none" | null;
  pdf_cover_text_vertical?: "top" | "center" | "bottom" | null;
  pdf_cover_overlay_style?: "flat" | "gradient" | "gradient_diag" | "vignette" | null;
  pdf_cover_title_size?: number | null;
  pdf_cover_subtitle_size?: number | null;
  pdf_cover_eyebrow_size?: number | null;
  pdf_pages_order?: FvPdfPageOrderItem[] | null;
  presentazione_impresa_html?: string | null;
  foto_team_url?: string | null;
  chi_siamo_titolo?: string | null;
  recensioni?: FvRecensione[] | null;
  cantieri_galleria?: FvCantiereGalleria[] | null;
  certificazioni?: FvCertificazione[] | null;
  testimonial_video_url?: string | null;
  render_disclaimer?: string | null;
  percorso_cliente_intro?: string | null;
  consulente_descrizione_default?: string | null;
  pdf_cta_finale_titolo?: string | null;
  pdf_cta_finale_testo?: string | null;
  contatto_telefono?: string | null;
  contatto_whatsapp?: string | null;
  contatto_email?: string | null;
  url_sito?: string | null;
  scadenza_validita_preventivo_giorni?: number | null;
  recesso_giorni?: number | null;
  acconto_pct?: number | null;
  valore_proposta_html?: string | null;
  garanzie_conversione?: FvGaranziaConversione[] | null;
  faq_items?: FvFaqItem[] | null;
  condizioni_legali_attivo?: boolean | null;
  condizioni_legali_testo?: string | null;
  urgenza_attiva?: boolean | null;
  urgenza_titolo?: string | null;
  urgenza_descrizione?: string | null;
  margine_target_pct?: number | null;
  costo_kwp_base?: number | null;
  costo_accumulo_kwh?: number | null;
  costo_pratiche_default?: number | null;
  manutenzione_annua_eur?: number | null;
  cpl_max_sostenibile?: number | null;
  capacita_installazioni_mese?: number | null;
  zona_servita_note?: string | null;
  noleggio_operativo_attivo?: boolean | null;
  noleggio_durata_default_mesi?: number | null;
  noleggio_fattore_default?: number | null;
  noleggio_aliquota_fiscale_pct?: number | null;
  noleggio_note_legali?: string | null;
  gallery_lavori?: GalleryLavoroItem[] | null;
}

// Campi personalizzati cliccabili (parità Serramenti). Inseriscono {token} in coda.
const FV_PLACEHOLDERS = [
  "cliente_nome", "potenza_kwp", "accumulo_kwh",
  "numero_pannelli", "indirizzo", "comune",
] as const;
function PlaceholderChips({
  value, onChange, label = "Inserisci campo personalizzato (cliccabile):",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  return (
    <div className="mt-1.5">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {FV_PLACEHOLDERS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange((value ?? "") + `{${n}}`)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-600 hover:text-sky-700 transition-colors"
          >
            {`{${n}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  embedded?: boolean;
}

type SharedLegalTemplateKind = "condizioni" | "legali";

interface SharedLegalTemplateOption {
  id: string;
  kind: SharedLegalTemplateKind;
  name: string;
  body: string;
}

// ─── Card wrapper (stile coerente con SrCard) ───────────────────────────────

function FvSettingsCard({
  title, description, icon, children, className,
}: { title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      {(title || icon) && (
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {icon && <span className="text-sky-700">{icon}</span>}
            {title}
          </CardTitle>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className="p-4 pt-2">
        {children}
      </CardContent>
    </Card>
  );
}

function optionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeSharedLegalTemplateBody(template: QuoteTemplate): string {
  const raw = String(
    template.body_html ??
      (template.kind === "condizioni" ? template.contractual_terms_text : template.legal_terms_text) ??
      "",
  );
  if (!raw.trim()) return "";

  return decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type FvEditorSection =
  | "brand"
  | "prodotti"
  | "strategia"
  | "contenuti"
  | "default"
  | "page_cover"
  | "page_chi_siamo"
  | "page_percorso"
  | "page_consulente"
  | "page_recensioni"
  | "page_render"
  | "page_cta"
  | "page_conversione"
  | "page_ordine";

const FV_EDITOR_SECTIONS: Array<{
  id: FvEditorSection;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "brand",
    label: "Brand & azienda",
    icon: "Azienda",
    description: "Identita, contatti e colori.",
  },
  {
    id: "page_cover",
    label: "Cover",
    icon: "Cover",
    description: "Prima pagina del preventivo.",
  },
  {
    id: "page_chi_siamo",
    label: "Chi siamo",
    icon: "Chi",
    description: "Presentazione azienda.",
  },
  {
    id: "page_percorso",
    label: "Il tuo percorso",
    icon: "Flow",
    description: "Iter cliente e pratiche.",
  },
  {
    id: "page_consulente",
    label: "Consulente",
    icon: "Sales",
    description: "Copy venditore e contatto.",
  },
  {
    id: "page_recensioni",
    label: "Recensioni",
    icon: "Trust",
    description: "Prova sociale e certificazioni.",
  },
  {
    id: "page_render",
    label: "Render AI",
    icon: "Render",
    description: "Nota anteprima impianto.",
  },
  {
    id: "page_cta",
    label: "CTA finale",
    icon: "CTA",
    description: "Titolo, testo e firma.",
  },
  {
    id: "page_conversione",
    label: "Conversione",
    icon: "Conv",
    description: "Garanzie, FAQ e condizioni.",
  },
  {
    id: "page_ordine",
    label: "Ordine pagine",
    icon: "Order",
    description: "Visibilita e riordino PDF.",
  },
  {
    id: "prodotti",
    label: "Linee prodotto",
    icon: "Listino",
    description: "Immagini e testi dal listino.",
  },
  {
    id: "strategia",
    label: "Costi tecnici",
    icon: "ROI",
    description: "Costi base, default preventivo e noleggio B2B.",
  },
  {
    id: "contenuti",
    label: "Contenuti",
    icon: "PDF",
    description: "Presentazione, valore, garanzie, FAQ e condizioni.",
  },
  {
    id: "default",
    label: "Default",
    icon: "Default",
    description: "Validita, recesso, acconto e costi tecnici.",
  },
];

const FV_EDITOR_SECTION_GROUPS: Array<{
  title: string;
  sections: FvEditorSection[];
}> = [
  {
    title: "Azienda",
    sections: ["brand"],
  },
  {
    title: "Struttura PDF",
    sections: ["page_ordine"],
  },
  {
    title: "Pagine del PDF",
    sections: [
      "page_cover",
      "page_chi_siamo",
      "page_percorso",
      "page_consulente",
      "page_recensioni",
      "page_render",
      "page_cta",
      "page_conversione",
    ],
  },
  {
    title: "Dati & contenuti",
    sections: ["prodotti", "strategia", "contenuti", "default"],
  },
];

function isFvEditorSection(value: string | null): value is FvEditorSection {
  return FV_EDITOR_SECTIONS.some((section) => section.id === value);
}

function normalizeTemplate(template: FvTemplate): FvTemplate {
  const { categorie_prodotto_media: _legacyProductMedia, ...safeTemplate } =
    template as FvTemplate & { categorie_prodotto_media?: unknown };
  const defaults: FvTemplate = {
    colore_primario: "#1E3A5F",
    colore_accento: "#F97316",
    pdf_cover_eyebrow: "La tua proposta personalizzata",
    pdf_cover_hero: "Il sole\ndiventa tuo.",
    pdf_cover_subhero_template:
      "Impianto fotovoltaico {potenza_kwp} {accumulo_kwh} per {indirizzo}.",
    pdf_cover_overlay_opacity: 62,
    pdf_cover_bg_color: "#0F2542",
    pdf_cover_text_color: "#FFFFFF",
    pdf_cover_text_align: "left",
    pdf_cover_logo_position: "top_left",
    pdf_cover_show_client_card: true,
    recensioni: [],
    cantieri_galleria: [],
    certificazioni: [],
    chi_siamo_titolo: "L'azienda dietro al tuo impianto",
    percorso_cliente_intro:
      "<p>Dal sopralluogo alla connessione GSE, il cliente vede un percorso chiaro con tempi, responsabilita e prossimi passi.</p>",
    consulente_descrizione_default:
      "Il consulente resta il riferimento unico per firma, pratiche, finanziamento e avanzamento installazione.",
    render_disclaimer:
      "L'anteprima del tetto e' una simulazione commerciale: layout definitivo, ombre e passaggi cavi vengono confermati con sopralluogo tecnico.",
    pdf_cta_finale_titolo: "Pronto a\niniziare?",
    pdf_cta_finale_testo:
      "<p>Conferma la proposta o prenota un confronto con il consulente per bloccare condizioni, componenti e prossimi step.</p>",
    scadenza_validita_preventivo_giorni: 30,
    recesso_giorni: 14,
    acconto_pct: 30,
    valore_proposta_html:
      "<p>Analisi bolletta, sopralluogo tecnico, scelta componenti e pratiche FV vengono gestiti in un percorso unico, con numeri chiari su risparmio, payback e prossimi passi.</p>",
    garanzie_conversione: DEFAULT_FV_GARANZIE,
    faq_items: DEFAULT_FV_FAQ,
    condizioni_legali_attivo: false,
    condizioni_legali_testo: "",
    urgenza_attiva: false,
    urgenza_titolo: "Validita offerta e disponibilita componenti",
    urgenza_descrizione: "Prezzi, incentivi e disponibilita dei componenti FV possono variare: conferma entro la validita indicata nel preventivo.",
    margine_target_pct: 0.35,
    costo_kwp_base: 1450,
    costo_accumulo_kwh: 680,
    costo_pratiche_default: 850,
    manutenzione_annua_eur: 180,
    cpl_max_sostenibile: 120,
    capacita_installazioni_mese: 6,
    zona_servita_note: "",
    noleggio_operativo_attivo: true,
    noleggio_durata_default_mesi: 84,
    noleggio_fattore_default: 1.18,
    noleggio_aliquota_fiscale_pct: 0.24,
    noleggio_note_legali:
      "Il noleggio operativo e il relativo trattamento fiscale sono simulazioni commerciali: deducibilita, IVA, opzioni di riscatto e condizioni contrattuali vanno confermate con partner finanziario e consulente fiscale prima della firma.",
  };
  return {
    ...defaults,
    ...safeTemplate,
    pdf_cover_eyebrow: safeTemplate.pdf_cover_eyebrow ?? defaults.pdf_cover_eyebrow,
    pdf_cover_hero: safeTemplate.pdf_cover_hero ?? defaults.pdf_cover_hero,
    pdf_cover_subhero: safeTemplate.pdf_cover_subhero ?? defaults.pdf_cover_subhero,
    pdf_cover_subhero_template:
      safeTemplate.pdf_cover_subhero_template ?? defaults.pdf_cover_subhero_template,
    pdf_cover_overlay_opacity:
      safeTemplate.pdf_cover_overlay_opacity ?? defaults.pdf_cover_overlay_opacity,
    pdf_cover_bg_color: safeTemplate.pdf_cover_bg_color ?? defaults.pdf_cover_bg_color,
    pdf_cover_text_color: safeTemplate.pdf_cover_text_color ?? defaults.pdf_cover_text_color,
    pdf_cover_text_align: safeTemplate.pdf_cover_text_align ?? defaults.pdf_cover_text_align,
    pdf_cover_logo_position:
      safeTemplate.pdf_cover_logo_position ?? defaults.pdf_cover_logo_position,
    pdf_cover_show_client_card:
      safeTemplate.pdf_cover_show_client_card ?? defaults.pdf_cover_show_client_card,
    recensioni: safeTemplate.recensioni ?? defaults.recensioni,
    cantieri_galleria: safeTemplate.cantieri_galleria ?? defaults.cantieri_galleria,
    certificazioni: safeTemplate.certificazioni ?? defaults.certificazioni,
    chi_siamo_titolo: safeTemplate.chi_siamo_titolo ?? defaults.chi_siamo_titolo,
    percorso_cliente_intro:
      safeTemplate.percorso_cliente_intro ?? defaults.percorso_cliente_intro,
    consulente_descrizione_default:
      safeTemplate.consulente_descrizione_default ?? defaults.consulente_descrizione_default,
    render_disclaimer: safeTemplate.render_disclaimer ?? defaults.render_disclaimer,
    pdf_cta_finale_titolo:
      safeTemplate.pdf_cta_finale_titolo ?? defaults.pdf_cta_finale_titolo,
    pdf_cta_finale_testo:
      safeTemplate.pdf_cta_finale_testo ?? defaults.pdf_cta_finale_testo,
    valore_proposta_html: safeTemplate.valore_proposta_html ?? defaults.valore_proposta_html,
    garanzie_conversione: safeTemplate.garanzie_conversione ?? defaults.garanzie_conversione,
    faq_items: safeTemplate.faq_items ?? defaults.faq_items,
    condizioni_legali_attivo:
      safeTemplate.condizioni_legali_attivo ?? defaults.condizioni_legali_attivo,
    condizioni_legali_testo:
      safeTemplate.condizioni_legali_testo ?? defaults.condizioni_legali_testo,
    urgenza_attiva: safeTemplate.urgenza_attiva ?? defaults.urgenza_attiva,
    urgenza_titolo: safeTemplate.urgenza_titolo ?? defaults.urgenza_titolo,
    urgenza_descrizione: safeTemplate.urgenza_descrizione ?? defaults.urgenza_descrizione,
    margine_target_pct: safeTemplate.margine_target_pct ?? defaults.margine_target_pct,
    costo_kwp_base: safeTemplate.costo_kwp_base ?? defaults.costo_kwp_base,
    costo_accumulo_kwh: safeTemplate.costo_accumulo_kwh ?? defaults.costo_accumulo_kwh,
    costo_pratiche_default:
      safeTemplate.costo_pratiche_default ?? defaults.costo_pratiche_default,
    manutenzione_annua_eur:
      safeTemplate.manutenzione_annua_eur ?? defaults.manutenzione_annua_eur,
    cpl_max_sostenibile: safeTemplate.cpl_max_sostenibile ?? defaults.cpl_max_sostenibile,
    capacita_installazioni_mese:
      safeTemplate.capacita_installazioni_mese ?? defaults.capacita_installazioni_mese,
    zona_servita_note: safeTemplate.zona_servita_note ?? defaults.zona_servita_note,
    noleggio_operativo_attivo:
      safeTemplate.noleggio_operativo_attivo ?? defaults.noleggio_operativo_attivo,
    noleggio_durata_default_mesi:
      safeTemplate.noleggio_durata_default_mesi ?? defaults.noleggio_durata_default_mesi,
    noleggio_fattore_default:
      safeTemplate.noleggio_fattore_default ?? defaults.noleggio_fattore_default,
    noleggio_aliquota_fiscale_pct:
      safeTemplate.noleggio_aliquota_fiscale_pct ?? defaults.noleggio_aliquota_fiscale_pct,
    noleggio_note_legali: safeTemplate.noleggio_note_legali ?? defaults.noleggio_note_legali,
  };
}

function listinoMacroIsForFotovoltaico(macro: ListinoMacrocategoria): boolean {
  const verticali = macro.verticali_abilitati ?? [];
  return macro.attivo !== false && (verticali.length === 0 || verticali.includes("fotovoltaico"));
}

function sanitizeTemplatePayload(value: FvTemplate): Record<string, unknown> {
  const payload = { ...(value as Record<string, unknown>) };
  delete payload.categorie_prodotto_media;
  return payload;
}

function FvTemplateQualityPanel({ items }: { items: FvTemplateQualityItem[] }) {
  const critical = items.filter((item) => item.level === "critical").length;
  const warnings = items.filter((item) => item.level === "warning").length;
  const ok = critical === 0 && warnings === 0;

  return (
    <div className={`rounded-md border p-4 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          {ok ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" />
          )}
          <div>
            <p className={`font-semibold text-sm ${ok ? "text-emerald-900" : "text-amber-950"}`}>
              {ok ? "Template fotovoltaico pronto alla vendita" : "Checklist advertiser e venditore"}
            </p>
            <p className={`text-xs mt-0.5 ${ok ? "text-emerald-800" : "text-amber-900"}`}>
              {ok
                ? "Contenuti, garanzie, FAQ e default economici sono coerenti."
                : `${critical} blocchi critici e ${warnings} warning da sistemare prima di scalare campagne o inviare offerte.`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-white/80 px-2 py-1 text-rose-700">Critici {critical}</span>
          <span className="rounded-full bg-white/80 px-2 py-1 text-amber-700">Warning {warnings}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {items.slice(0, 6).map((item, idx) => (
          <div key={`${item.title}-${idx}`} className="rounded-md bg-white/80 border border-white px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <span
                className={`h-2 w-2 rounded-full ${
                  item.level === "critical"
                    ? "bg-rose-500"
                    : item.level === "warning"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
              />
              {item.section && <span className="text-slate-500">{item.section}</span>}
              <span>{item.title}</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FvSectionHeader({
  title,
  description,
  number,
}: {
  title: string;
  description: string;
  number?: number;
}) {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/70 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-700 text-sm font-bold text-white">
          {number ?? "⇅"}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Preset di copy "1-click" per le sezioni testo (parità con Serramenti) ──
// Testi pronti professionali: chi non sa scrivere sceglie e adatta in 1 click.
const FV_COPY_PRESETS: Record<string, Array<{ id: string; label: string; descr: string; html: string }>> = {
  presentazione_impresa_html: [
    {
      id: "specialisti",
      label: "Specialisti FV",
      descr: "Focus esclusivo sul fotovoltaico, un solo interlocutore.",
      html: "<p>Siamo specializzati esclusivamente in fotovoltaico residenziale e commerciale: progettazione, installazione chiavi in mano, pratiche GSE/ENEA e assistenza post-vendita. Un unico interlocutore dal sopralluogo all'allaccio.</p>",
    },
    {
      id: "esperienza",
      label: "Esperienza + numeri",
      descr: "Squadra interna, materiali di marca, monitoraggio.",
      html: "<p>Da anni installiamo impianti fotovoltaici con accumulo sul territorio. Squadra interna certificata, materiali di marca con garanzie reali e monitoraggio della produzione: ti seguiamo prima, durante e dopo l'installazione.</p>",
    },
  ],
  valore_proposta_html: [
    {
      id: "analisi",
      label: "Analisi su misura",
      descr: "Consumi, tetto, incentivi, accumulo: numeri chiari.",
      html: "<p>Analizziamo i tuoi consumi reali, l'esposizione del tetto, gli incentivi disponibili e l'accumulo più adatto. Ti consegniamo numeri chiari — produzione, risparmio e rientro — senza sorprese.</p>",
    },
    {
      id: "chiavi",
      label: "Chiavi in mano",
      descr: "Gestiamo tutto noi, dalla pratica all'allaccio.",
      html: "<p>Dalla pratica alla connessione gestiamo tutto noi: dimensionamento, permessi, installazione, collaudo e attivazione GSE. Tu pensi solo a iniziare a risparmiare.</p>",
    },
  ],
  percorso_cliente_intro: [
    {
      id: "trasparente",
      label: "Iter trasparente",
      descr: "Le fasi una per una, sai sempre a che punto siamo.",
      html: "<p>Ti accompagniamo passo dopo passo: sopralluogo e analisi consumi, progetto e preventivo chiaro, pratiche e permessi, installazione e collaudo, attivazione e monitoraggio. Sai sempre a che punto siamo.</p>",
    },
    {
      id: "tempi",
      label: "Tempi e responsabilità",
      descr: "Ogni fase con tempi e referente definiti.",
      html: "<p>Ogni fase ha tempi e responsabili definiti. Dalla firma all'allaccio gestiamo pratiche, materiali e cantiere; tu hai un referente unico per qualsiasi domanda.</p>",
    },
  ],
  consulente_descrizione_default: [
    {
      id: "referente",
      label: "Referente unico",
      descr: "Un solo riferimento per tecnica ed economia.",
      html: "<p>Il tuo consulente resta il riferimento unico per tutto il progetto: risponde a dubbi tecnici ed economici e coordina squadra e pratiche fino all'attivazione.</p>",
    },
    {
      id: "consulenza",
      label: "Consulenza, non vendita",
      descr: "Niente pressioni, scelta giusta per consumi e budget.",
      html: "<p>Niente pressioni: il consulente ti aiuta a scegliere la soluzione giusta per i tuoi consumi e il tuo budget, con numeri trasparenti e tempi realistici.</p>",
    },
  ],
};

/** Riga di chip "Testi pronti" sopra un RichTextEditor: applica un preset di copy
 *  (con conferma se il campo ha già contenuto). */
function CopyPresetRow({
  field,
  current,
  onPick,
}: {
  field: keyof typeof FV_COPY_PRESETS;
  current: string;
  onPick: (html: string) => void;
}) {
  const presets = FV_COPY_PRESETS[field] ?? [];
  if (presets.length === 0) return null;
  const hasContent = current.replace(/<[^>]*>/g, "").trim().length > 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <Wand2 className="h-3 w-3" /> Testi pronti:
      </span>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.descr}
          onClick={() => {
            if (hasContent && !window.confirm("Sostituire il testo attuale con questo preset?")) return;
            onPick(p.html);
          }}
          className="px-2 py-0.5 text-[11px] font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function FotovoltaicoTemplateEditor({ embedded = false }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: template, isLoading } = useFvTemplatePdf();
  const {
    macrocategorie: listinoMacrocategorie,
    isLoading: isLoadingListinoMacrocategorie,
  } = useListinoMacrocategorie();
  const { templates: quoteTemplates, upsertTemplate: upsertQuoteTemplate } = useQuoteTemplates();
  const upsertMut = useFvUpsertTemplatePdf();
  const sectionParam = searchParams.get("section");
  const initialSection: FvEditorSection = isFvEditorSection(sectionParam) ? sectionParam : "brand";

  const [form, setForm] = useState<FvTemplate>({});
  // Dati ereditati dal Profilo azienda → placeholder anagrafica (UX allineata a Serramenti).
  const companyAnagrafica = useCompanyAnagraficaForTemplate();
  const companyId = useEffectiveCompanyId();
  const [dirty, setDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<FvEditorSection>(initialSection);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [delRecIdx, setDelRecIdx] = useState<number | null>(null);
  const [delCertIdx, setDelCertIdx] = useState<number | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCoverLogo, setUploadingCoverLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFotoTeam, setUploadingFotoTeam] = useState(false);
  const [uploadingRecIdx, setUploadingRecIdx] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSharedLegalId, setSelectedSharedLegalId] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverLogoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const fotoTeamInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (template) {
      setForm(normalizeTemplate(template as FvTemplate));
      setDirty(false);
    } else if (!isLoading) {
      setForm(normalizeTemplate({}));
    }
  }, [template, isLoading]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (isFvEditorSection(section) && section !== activeSection) {
      setActiveSection(section);
    }
  }, [activeSection, searchParams]);

  // NB: nessuno scroll-to-top al cambio sezione — l'utente vuole restare nella
  // stessa posizione di scroll quando passa da una sezione all'altra.

  const selectSection = (section: FvEditorSection) => {
    setActiveSection(section);
    setMobileSidebarOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    setSearchParams(next, { replace: true });
  };

  const update = <K extends keyof FvTemplate>(key: K, value: FvTemplate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Mappa il draft AI (13 campi generici) sui campi del template Fotovoltaico.
  const applyGeneratedFv = (d: AiTemplateDraft) => {
    if (d.cover_title) update("pdf_cover_hero", d.cover_title);
    if (d.chi_siamo) update("presentazione_impresa_html", d.chi_siamo);
    if (d.soluzione?.length)
      update("valore_proposta_html", d.soluzione.map((i) => `<p><strong>${i.titolo}</strong>${i.descrizione ? " — " + i.descrizione : ""}</p>`).join(""));
    if (d.garanzie?.length)
      update("garanzie_conversione", d.garanzie.map((g) => ({ icona: "shield" as const, titolo: g.titolo, descrizione: g.descrizione ?? "" })));
    if (d.faq?.length) update("faq_items", d.faq.map((f) => ({ domanda: f.domanda, risposta: f.risposta })));
  };

  // ─── Cover presets 1-click (parità Serramenti) ───────────────────────────
  // Applica in batch tutti i campi pdf_cover_* del preset selezionato.
  const applyCoverPreset = useCallback((presetId: string) => {
    const preset = COVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({ ...prev, ...preset.patch }));
    setDirty(true);
  }, []);
  // Detection live del preset attivo (evidenzia la card). null = personalizzato.
  const activeCoverPresetId = useMemo(() => detectActiveCoverPreset(form), [form]);

  // ─── Galleria immagini stock cover (parità Serramenti) ───────────────────
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockCategory, setStockCategory] = useState<CoverStockImage["categoria"] | "all">("all");
  const stockFiltered = useMemo(
    () => (stockCategory === "all" ? COVER_STOCK_IMAGES : COVER_STOCK_IMAGES.filter((img) => img.categoria === stockCategory)),
    [stockCategory],
  );
  const applyStockImage = useCallback((img: CoverStockImage) => {
    setForm((prev) => ({ ...prev, pdf_cover_image_url: img.url }));
    setDirty(true);
    setStockDialogOpen(false);
  }, []);

  const handleSave = () => {
    // Cast a Record perché upsert FV accetta Record<string, unknown>
    upsertMut.mutate(sanitizeTemplatePayload(form), {
      onSuccess: () => {
        setDirty(false);
        toast.success("Template Fotovoltaico salvato");
      },
      onError: (e) => toast.error("Salvataggio fallito", { description: String(e) }),
    });
  };

  // ─── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5 MB)");
      return;
    }
    setUploadingLogo(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
      const storagePath = `${companyId}/template-logos/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("fv-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const logoUrl = signed?.signedUrl ?? "";

      update("logo_url", logoUrl);
      toast.success("Logo caricato. Salva per applicare.");
    } catch (e) {
      console.error("[fv-template] logo upload", e);
      toast.error("Errore upload logo", { description: String(e) });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleCoverLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5 MB)");
      return;
    }
    setUploadingCoverLogo(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cid = (profile as any)?.company_id;
      if (!cid) throw new Error("Profilo senza azienda");
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
      const storagePath = `${cid}/template-logos/cover-${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("fv-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);
      const { data: signed } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const coverLogoUrl = signed?.signedUrl ?? "";
      update("pdf_cover_logo_url", coverLogoUrl);
      toast.success("Logo copertina caricato. Salva per applicare.");
    } catch (e) {
      console.error("[fv-template] cover logo upload", e);
      toast.error("Errore upload logo copertina", { description: String(e) });
    } finally {
      setUploadingCoverLogo(false);
      if (coverLogoInputRef.current) coverLogoInputRef.current.value = "";
    }
  };

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File troppo grande (max 8 MB)");
      return;
    }
    setUploadingCover(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-covers/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("fv-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      update("pdf_cover_image_url", signed?.signedUrl ?? "");
      toast.success("Copertina caricata. Salva per applicare.");
    } catch (e) {
      console.error("[fv-template] cover upload", e);
      toast.error("Errore upload copertina", { description: String(e) });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const fvListinoMacrocategorie = useMemo(
    () => listinoMacrocategorie.filter(listinoMacroIsForFotovoltaico),
    [listinoMacrocategorie],
  );
  const sharedLegalTemplates = useMemo<SharedLegalTemplateOption[]>(() => {
    return quoteTemplates
      .filter((template) => template.is_active !== false && (template.kind === "condizioni" || template.kind === "legali"))
      .map((template) => ({
        id: template.id,
        kind: template.kind as SharedLegalTemplateKind,
        name: template.name,
        body: normalizeSharedLegalTemplateBody(template),
      }))
      .filter((template) => template.body.length > 0);
  }, [quoteTemplates]);
  const selectedSharedLegalTemplate = useMemo(
    () => sharedLegalTemplates.find((template) => template.id === selectedSharedLegalId) ?? null,
    [selectedSharedLegalId, sharedLegalTemplates],
  );
  const qualityItems = useMemo(
    () =>
      buildFvTemplateQualityItems({
        ...form,
        listino_macrocategorie_fv: fvListinoMacrocategorie,
      }),
    [form, fvListinoMacrocategorie],
  );
  const qualityCriticalCount = qualityItems.filter((item) => item.level === "critical").length;
  const qualityWarningCount = qualityItems.filter((item) => item.level === "warning").length;
  const activeMeta =
    FV_EDITOR_SECTIONS.find((section) => section.id === activeSection) ?? FV_EDITOR_SECTIONS[0];

  const recensioni = form.recensioni ?? [];
  const certificazioni = form.certificazioni ?? [];
  const garanzie = form.garanzie_conversione ?? DEFAULT_FV_GARANZIE;
  const faqItems = form.faq_items ?? DEFAULT_FV_FAQ;

  // ─── Recensioni ──────────────────────────────────────────────────────────
  const addRecensione = () => {
    update("recensioni", [...recensioni, { quote: "", autore: "", citta: "", intervento: "" }]);
  };
  const updateRecensione = (idx: number, field: keyof FvRecensione, value: string) => {
    const next = [...recensioni];
    next[idx] = { ...next[idx], [field]: value };
    update("recensioni", next);
  };
  const removeRecensione = (idx: number) => {
    update("recensioni", recensioni.filter((_, i) => i !== idx));
    setDelRecIdx(null);
  };

  // ─── Upload immagini (foto azienda + foto impianti recensioni) ─────────────
  // Stesso pattern di logo/cover: bucket fv-progetti + signed URL 1 anno.
  const uploadTemplateImage = async (file: File, folder: string): Promise<string> => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error("Non autenticato");
    const { data: profile } = await supabase
      .from("profiles" as never)
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyId = (profile as any)?.company_id;
    if (!companyId) throw new Error("Profilo senza azienda");
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
    const storagePath = `${companyId}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("fv-progetti")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);
    const { data: signed } = await supabase.storage
      .from("fv-progetti")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? "";
  };

  const handleFotoTeamUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Carica un file immagine");
    if (file.size > 8 * 1024 * 1024) return toast.error("File troppo grande (max 8 MB)");
    setUploadingFotoTeam(true);
    try {
      update("foto_team_url", await uploadTemplateImage(file, "template-team"));
      toast.success("Foto azienda caricata. Salva per applicare.");
    } catch (e) {
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingFotoTeam(false);
      if (fotoTeamInputRef.current) fotoTeamInputRef.current.value = "";
    }
  };

  const handleRecensioneFotoUpload = async (idx: number, file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Carica un file immagine");
    if (file.size > 8 * 1024 * 1024) return toast.error("File troppo grande (max 8 MB)");
    setUploadingRecIdx(idx);
    try {
      updateRecensione(idx, "foto_url", await uploadTemplateImage(file, "template-recensioni"));
      toast.success("Foto impianto caricata. Salva per applicare.");
    } catch (e) {
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingRecIdx(null);
    }
  };

  // ─── Certificazioni ──────────────────────────────────────────────────────
  const addCertificazione = () => {
    update("certificazioni", [...certificazioni, { nome: "", ente: "" }]);
  };
  const updateCertificazione = (idx: number, field: keyof FvCertificazione, value: string) => {
    const next = [...certificazioni];
    next[idx] = { ...next[idx], [field]: value };
    update("certificazioni", next);
  };
  const removeCertificazione = (idx: number) => {
    update("certificazioni", certificazioni.filter((_, i) => i !== idx));
    setDelCertIdx(null);
  };

  const addGaranzia = () => {
    update("garanzie_conversione", [
      ...garanzie,
      { icona: "shield", titolo: "", descrizione: "" },
    ]);
  };
  const updateGaranzia = <K extends keyof FvGaranziaConversione>(
    idx: number,
    field: K,
    value: FvGaranziaConversione[K],
  ) => {
    const next = [...garanzie];
    next[idx] = { ...next[idx], [field]: value };
    update("garanzie_conversione", next);
  };
  const removeGaranzia = (idx: number) => {
    update("garanzie_conversione", garanzie.filter((_, i) => i !== idx));
  };

  const addFaq = () => {
    update("faq_items", [...faqItems, { domanda: "", risposta: "" }]);
  };
  const updateFaq = <K extends keyof FvFaqItem>(
    idx: number,
    field: K,
    value: FvFaqItem[K],
  ) => {
    const next = [...faqItems];
    next[idx] = { ...next[idx], [field]: value };
    update("faq_items", next);
  };
  const removeFaq = (idx: number) => {
    update("faq_items", faqItems.filter((_, i) => i !== idx));
  };

  const applySharedLegalTemplate = useCallback((mode: "replace" | "append") => {
    if (!selectedSharedLegalTemplate) {
      toast.error("Seleziona prima un blocco legale");
      return;
    }
    setForm((prev) => {
      const current = String(prev.condizioni_legali_testo ?? "").trim();
      const nextText = mode === "append" && current
        ? `${current}\n\n${selectedSharedLegalTemplate.body}`
        : selectedSharedLegalTemplate.body;
      return {
        ...prev,
        condizioni_legali_attivo: true,
        condizioni_legali_testo: nextText,
      };
    });
    setDirty(true);
    toast.success(mode === "append" ? "Blocco aggiunto alle condizioni FV" : "Condizioni FV aggiornate", {
      description: selectedSharedLegalTemplate.name,
    });
  }, [selectedSharedLegalTemplate]);

  const saveSharedLegalTemplate = useCallback(async (kind: SharedLegalTemplateKind) => {
    const text = String(form.condizioni_legali_testo ?? "").trim();
    if (!text) {
      toast.error("Inserisci prima un testo da salvare");
      return;
    }

    const base = blankTemplateForKind(kind);
    await upsertQuoteTemplate.mutateAsync({
      ...base,
      kind,
      name: kind === "condizioni" ? "Condizioni fotovoltaico" : "Termini legali fotovoltaico",
      description: "Creato dal template preventivo fotovoltaico.",
      body_html: text,
      body_format: "plain",
      is_default: false,
      is_active: true,
    });
    toast.success(kind === "condizioni" ? "Condizioni salvate nei Template offerte" : "Termini legali salvati nei Template offerte");
  }, [form.condizioni_legali_testo, upsertQuoteTemplate]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top save bar */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 border-b border-slate-100 bg-background/95 px-1 py-2.5 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="hidden items-center gap-1.5 text-xs sm:flex">
            <span className="text-muted-foreground">Template PDF Fotovoltaico</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="truncate font-semibold text-sky-700">{activeMeta.label}</span>
          </div>
          {dirty ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              ● Modifiche non salvate
            </span>
          ) : (
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 sm:inline-block">
              ✓ Salvato
            </span>
          )}
          <span
            className={
              "hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium lg:inline-flex " +
              (qualityCriticalCount > 0
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : qualityWarningCount > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700")
            }
          >
            {qualityCriticalCount > 0 ? "!" : qualityWarningCount > 0 ? "!" : "✓"}
            Qualità: {qualityCriticalCount > 0 ? `${qualityCriticalCount} critici` : qualityWarningCount > 0 ? `${qualityWarningCount} avvisi` : "pronto"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AiTemplateGenerator
            settoreFn="ai-genera-template-fotovoltaico"
            onApply={applyGeneratedFv}
            className="gap-1.5 h-9 px-3 text-sm bg-orange-500 hover:bg-orange-600"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Anteprima PDF</span>
            <span className="sm:hidden">Anteprima</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-sky-700 hover:bg-sky-800 gap-1"
            size="sm"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </Button>
        </div>
      </div>

      <FvTemplateQualityPanel items={qualityItems} />

      <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2 md:hidden">
        <div className="min-w-0 text-xs text-sky-900">
          <span className="font-semibold">{activeMeta.label}</span>
          <span className="ml-1 text-sky-700">{activeMeta.description}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMobileSidebarOpen((open) => !open)}
          className="h-7 border-sky-300 text-[11px]"
        >
          {mobileSidebarOpen ? "Chiudi" : "Sezioni"}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <aside className={`col-span-12 md:col-span-3 ${mobileSidebarOpen ? "block" : "hidden md:block"}`}>
          <nav className="sticky top-[68px] max-h-[calc(100vh-90px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Modulo fotovoltaico
            </div>
            <div className="space-y-3">
              {FV_EDITOR_SECTION_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.sections.map((sectionId, index) => {
                      const section = FV_EDITOR_SECTIONS.find((item) => item.id === sectionId);
                      if (!section) return null;
                      const isActive = activeSection === section.id;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => selectSection(section.id)}
                          className={
                            "w-full rounded-md px-2 py-2 text-left transition-all " +
                            (isActive
                              ? "bg-sky-700 text-white shadow-sm"
                              : "text-slate-700 hover:bg-sky-50")
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                              {group.title === "Pagine del PDF" ? index + 1 : section.icon.slice(0, 2)}
                            </span>
                            <span className="min-w-0">
                              <span className={`block truncate text-xs font-semibold ${isActive ? "text-white" : "text-slate-900"}`}>
                                {section.label}
                              </span>
                              <span className={`block truncate text-[10px] ${isActive ? "text-sky-50" : "text-slate-500"}`}>
                                {section.description}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="col-span-12 min-w-0 space-y-4 md:col-span-9">

      {activeSection === "page_cover" && (
        <>
          <FvSectionHeader
            title="Cover preventivo fotovoltaico"
            description="Come nel serramento: puoi controllare immagine, titolo, sottotitolo dinamico, colori e card cliente della prima pagina."
            number={1}
          />
          {/* ─── Preset stili cover 1-click (parità Serramenti) ───────────── */}
          <div className="rounded-lg border bg-gradient-to-br from-sky-50 to-cyan-50/30 p-3 space-y-3 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  ✨ Preset stili — anteprima reale 1-click
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Configurazione completa (colori, font, layout) in un click. L'immagine di sfondo non viene modificata.
                </p>
              </div>
              {activeCoverPresetId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 border border-sky-300 text-sky-800 px-2 h-5 text-[10px]">
                  <span className="text-sm leading-none">{COVER_PRESETS.find((p) => p.id === activeCoverPresetId)?.emoji}</span>
                  Attivo: {COVER_PRESETS.find((p) => p.id === activeCoverPresetId)?.nome}
                </span>
              )}
            </div>
            {(["solid", "photo"] as const).map((cat) => {
              const presetsInCat = COVER_PRESETS.filter((p) => p.category === cat);
              if (presetsInCat.length === 0) return null;
              const catLabel = cat === "solid"
                ? { emoji: "🎨", title: "Solo colore (no immagine)", subtitle: "Background solido con titolo e accent" }
                : { emoji: "📷", title: "Con immagine sfondo", subtitle: "Foto come sfondo + overlay scuro per leggibilità" };
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm">{catLabel.emoji}</span>
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{catLabel.title}</span>
                    <span className="text-[10px] text-muted-foreground">{catLabel.subtitle}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {presetsInCat.map((p) => {
                      const isActive = activeCoverPresetId === p.id;
                      const tv = p.patch.pdf_cover_text_vertical ?? "bottom";
                      const ta = p.patch.pdf_cover_text_align ?? "left";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyCoverPreset(p.id)}
                          title={p.descrizione}
                          className={
                            "group relative rounded-lg overflow-hidden transition-all text-left focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white border-2 " +
                            (isActive ? "border-sky-500 shadow-md ring-2 ring-sky-300" : "border-slate-200 hover:border-sky-300 hover:shadow-sm")
                          }
                        >
                          <div className="relative w-full overflow-hidden flex flex-col p-2" style={{ aspectRatio: "210/297", backgroundColor: p.swatchBg, color: p.swatchText }}>
                            {p.category === "photo" && (
                              <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 100%)" }} />
                            )}
                            <div className="absolute top-1.5 left-1.5 text-[7px] font-bold uppercase tracking-wider px-1 py-px rounded-sm z-10" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#475569" }}>
                              {p.category === "solid" ? "● colore" : "📷 foto"}
                            </div>
                            <div className="relative flex-1 flex flex-col z-[1]" style={{ justifyContent: tv === "top" ? "flex-start" : tv === "center" ? "center" : "flex-end" }}>
                              <div style={{ textAlign: ta === "center" ? "center" : "left" }}>
                                <div className="font-bold uppercase tracking-wider mb-1" style={{ fontSize: 5, color: p.swatchAccent, opacity: 0.9 }}>★ Proposta</div>
                                <div className="font-bold leading-tight whitespace-pre-line" style={{ fontSize: Math.max(7, (p.patch.pdf_cover_title_size ?? 40) * 0.16) }}>{p.sampleTitle}</div>
                              </div>
                            </div>
                          </div>
                          <div className="px-2 py-1.5 bg-white border-t border-slate-100">
                            <div className="flex items-center gap-1">
                              <span className="text-sm leading-none">{p.emoji}</span>
                              <span className="text-[11px] font-semibold text-slate-900 truncate">{p.nome}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[8px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1 py-px rounded font-semibold">{p.tag}</span>
                            </div>
                          </div>
                          {isActive && (
                            <div className="absolute top-1.5 right-1.5 bg-sky-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!activeCoverPresetId && (
              <p className="text-[10px] text-amber-700 bg-amber-100/60 rounded px-2 py-1 inline-block">
                💡 Configurazione personalizzata — non corrisponde a nessun preset. I tuoi valori vengono mantenuti.
              </p>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <FvSettingsCard
              title="Testi e stile copertina"
              description="Il sottotitolo dinamico usa i dati del preventivo senza rendere statici prodotti o componenti."
              icon={<ImageIcon className="h-4 w-4" />}
            >
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Eyebrow</Label>
                  <Input
                    value={form.pdf_cover_eyebrow ?? ""}
                    onChange={(e) => update("pdf_cover_eyebrow", e.target.value || null)}
                    placeholder="La tua proposta personalizzata"
                    className="h-9 text-xs"
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_eyebrow ?? ""}
                    onChange={(v) => update("pdf_cover_eyebrow", v || null)}
                  />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Titolo hero</Label>
                  <Textarea
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(e) => update("pdf_cover_hero", e.target.value || null)}
                    rows={2}
                    placeholder={"Il sole\ndiventa tuo."}
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(v) => update("pdf_cover_hero", v || null)}
                  />
                </div>
                <div className="col-span-12">
                  <Label className="text-xs">Sottotitolo statico</Label>
                  <Input
                    value={form.pdf_cover_subhero ?? ""}
                    onChange={(e) => update("pdf_cover_subhero", e.target.value || null)}
                    placeholder="Usato se non compili il template dinamico"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-12">
                  <Label className="text-xs">Sottotitolo dinamico</Label>
                  <Textarea
                    value={form.pdf_cover_subhero_template ?? ""}
                    onChange={(e) => update("pdf_cover_subhero_template", e.target.value || null)}
                    rows={2}
                    placeholder="Impianto fotovoltaico {potenza_kwp} {accumulo_kwh} per {indirizzo}."
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_subhero_template ?? ""}
                    onChange={(v) => update("pdf_cover_subhero_template", v || null)}
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Sfondo solido</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={form.pdf_cover_bg_color ?? "#0F2542"}
                      onChange={(e) => update("pdf_cover_bg_color", e.target.value)}
                      className="h-9 w-14 p-1"
                    />
                    <Input
                      value={form.pdf_cover_bg_color ?? ""}
                      onChange={(e) => update("pdf_cover_bg_color", e.target.value || null)}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Colore testo</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={form.pdf_cover_text_color ?? "#FFFFFF"}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value)}
                      className="h-9 w-14 p-1"
                    />
                    <Input
                      value={form.pdf_cover_text_color ?? ""}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value || null)}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Opacità overlay</Label>
                    <span className="text-[11px] font-semibold text-sky-700">{form.pdf_cover_overlay_opacity ?? 62}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.pdf_cover_overlay_opacity ?? 62}
                    onChange={(e) => update("pdf_cover_overlay_opacity", Number(e.target.value))}
                    className="w-full mt-2 accent-sky-600"
                    aria-label="Opacità overlay scuro"
                  />
                </div>
                <div className="col-span-12 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={(form.pdf_cover_text_align ?? "left") === "left" ? "default" : "outline"}
                    size="sm"
                    onClick={() => update("pdf_cover_text_align", "left")}
                    className={(form.pdf_cover_text_align ?? "left") === "left" ? "bg-sky-700 hover:bg-sky-800" : ""}
                  >
                    Allinea sinistra
                  </Button>
                  <Button
                    type="button"
                    variant={form.pdf_cover_text_align === "center" ? "default" : "outline"}
                    size="sm"
                    onClick={() => update("pdf_cover_text_align", "center")}
                    className={form.pdf_cover_text_align === "center" ? "bg-sky-700 hover:bg-sky-800" : ""}
                  >
                    Centra
                  </Button>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={form.pdf_cover_show_client_card !== false}
                      onChange={(e) => update("pdf_cover_show_client_card", e.target.checked)}
                    />
                    Mostra card cliente
                  </label>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Posizione logo</Label>
                  <select
                    value={form.pdf_cover_logo_position ?? "top_left"}
                    onChange={(e) => update("pdf_cover_logo_position", e.target.value as FvTemplate["pdf_cover_logo_position"])}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="top_left">In alto a sinistra</option>
                    <option value="top_right">In alto a destra</option>
                    <option value="top_center">Centrato</option>
                    <option value="hidden">Nascosto</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">URL immagine cover</Label>
                  <Input
                    value={form.pdf_cover_image_url ?? ""}
                    onChange={(e) => update("pdf_cover_image_url", e.target.value || null)}
                    placeholder="https://..."
                    className="h-9 text-xs"
                  />
                </div>
                {/* ─── Layout cover (parità Serramenti): posizione verticale,
                     overlay, decorazione, dimensioni font ─────────────────── */}
                <div className="col-span-12">
                  <Label className="text-xs">Posizione verticale testo</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {([["top", "In alto"], ["center", "Centro"], ["bottom", "In basso"]] as const).map(([v, lbl]) => (
                      <Button key={v} type="button" size="sm"
                        variant={(form.pdf_cover_text_vertical ?? "bottom") === v ? "default" : "outline"}
                        onClick={() => update("pdf_cover_text_vertical", v)}
                        className={(form.pdf_cover_text_vertical ?? "bottom") === v ? "bg-sky-700 hover:bg-sky-800" : ""}
                      >{lbl}</Button>
                    ))}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Stile overlay (su immagine)</Label>
                  <select
                    value={form.pdf_cover_overlay_style ?? "flat"}
                    onChange={(e) => update("pdf_cover_overlay_style", e.target.value as FvTemplate["pdf_cover_overlay_style"])}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="flat">Piatto</option>
                    <option value="gradient">Gradient (dal basso)</option>
                    <option value="gradient_diag">Gradient diagonale</option>
                    <option value="vignette">Vignette</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Decorazione angolo</Label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={form.pdf_cover_show_decoration !== false}
                        onChange={(e) => update("pdf_cover_show_decoration", e.target.checked)} />
                      Mostra
                    </label>
                    <select
                      value={form.pdf_cover_decoration_style ?? "square"}
                      onChange={(e) => update("pdf_cover_decoration_style", e.target.value as FvTemplate["pdf_cover_decoration_style"])}
                      disabled={form.pdf_cover_show_decoration === false}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="square">Finestra</option>
                      <option value="circle">Anelli</option>
                      <option value="line">Linea</option>
                      <option value="pattern">Pattern</option>
                      <option value="none">Nessuna</option>
                    </select>
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Dim. titolo ({form.pdf_cover_title_size ?? 40})</Label>
                  <input type="range" min={28} max={64} value={form.pdf_cover_title_size ?? 40}
                    onChange={(e) => update("pdf_cover_title_size", Number(e.target.value))} className="w-full" />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Dim. sottotitolo ({form.pdf_cover_subtitle_size ?? 13})</Label>
                  <input type="range" min={10} max={18} value={form.pdf_cover_subtitle_size ?? 13}
                    onChange={(e) => update("pdf_cover_subtitle_size", Number(e.target.value))} className="w-full" />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Dim. eyebrow ({form.pdf_cover_eyebrow_size ?? 11})</Label>
                  <input type="range" min={8} max={14} value={form.pdf_cover_eyebrow_size ?? 11}
                    onChange={(e) => update("pdf_cover_eyebrow_size", Number(e.target.value))} className="w-full" />
                </div>
              </div>
            </FvSettingsCard>

            <FvSettingsCard
              title="Anteprima e immagine"
              description="La cover resta un template; i dati cliente e impianto arrivano dal preventivo."
            >
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
              />
              <div
                className="relative aspect-[3/4] overflow-hidden rounded-md border bg-slate-900 p-5 shadow-sm"
                style={{
                  backgroundColor: form.pdf_cover_bg_color ?? "#0F2542",
                  color: form.pdf_cover_text_color ?? "#FFFFFF",
                  textAlign: form.pdf_cover_text_align === "center" ? "center" : "left",
                }}
              >
                {form.pdf_cover_image_url && (
                  <img loading="lazy"
                    src={form.pdf_cover_image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    aria-hidden="true"
                  />
                )}
                {form.pdf_cover_image_url && (() => {
                  const op = (form.pdf_cover_overlay_opacity ?? 62) / 100;
                  const st = form.pdf_cover_overlay_style ?? "flat";
                  let bg = "#000000"; let o: number = op;
                  if (st === "gradient") { bg = `linear-gradient(to bottom, rgba(0,0,0,${op * 0.15}) 0%, rgba(0,0,0,${op * 0.55}) 55%, rgba(0,0,0,${op}) 100%)`; o = 1; }
                  else if (st === "gradient_diag") { bg = `linear-gradient(135deg, rgba(0,0,0,${op * 0.2}) 0%, rgba(0,0,0,${op}) 100%)`; o = 1; }
                  else if (st === "vignette") { bg = `radial-gradient(ellipse at center, rgba(0,0,0,${op * 0.1}) 0%, rgba(0,0,0,${op * 0.5}) 70%, rgba(0,0,0,${op * 0.95}) 100%)`; o = 1; }
                  return <div className="absolute inset-0 pointer-events-none" style={{ background: bg, opacity: o }} />;
                })()}
                {/* Decoro angolo style-aware (colore = testo cover → armonizza, come Serramenti) */}
                {form.pdf_cover_show_decoration !== false && (() => {
                  const v = form.pdf_cover_decoration_style ?? "square";
                  if (v === "none") return null;
                  const c = form.pdf_cover_text_color || "#FFFFFF";
                  return (
                    <svg viewBox="0 0 180 180" aria-hidden className="absolute top-3 right-3 w-10 h-10 pointer-events-none z-[1]">
                      {v === "circle" ? (
                        <>
                          <circle cx={90} cy={90} r={80} stroke={c} strokeWidth={3} fill="none" opacity={0.7} />
                          <circle cx={90} cy={90} r={56} stroke={c} strokeWidth={1.5} fill="none" opacity={0.4} />
                          <circle cx={90} cy={90} r={32} stroke={c} strokeWidth={1} fill="none" opacity={0.25} />
                        </>
                      ) : v === "line" ? (
                        <>
                          <path d="M 90 10 L 90 170" stroke={c} strokeWidth={2.5} opacity={0.7} />
                          <path d="M 70 40 L 110 40" stroke={c} strokeWidth={1.5} opacity={0.5} />
                          <path d="M 70 140 L 110 140" stroke={c} strokeWidth={1.5} opacity={0.5} />
                        </>
                      ) : v === "pattern" ? (
                        <g opacity={0.45} fill={c}>
                          {Array.from({ length: 25 }).map((_, i) => (<circle key={i} cx={30 + (i % 5) * 30} cy={30 + Math.floor(i / 5) * 30} r={3} />))}
                        </g>
                      ) : (
                        <>
                          <g opacity={0.7} stroke={c} fill="none">
                            <rect x={20} y={20} width={140} height={140} rx={6} strokeWidth={3} />
                            <path d="M 90 25 L 90 155" strokeWidth={2} />
                            <path d="M 25 90 L 155 90" strokeWidth={2} />
                          </g>
                          <circle cx={84} cy={90} r={3} fill={c} opacity={0.7} />
                        </>
                      )}
                    </svg>
                  );
                })()}
                <div className="relative z-[1] flex h-full flex-col">
                  {(form.pdf_cover_logo_position ?? "top_left") !== "hidden" && (
                    <div
                      className={
                        "flex items-center gap-2 " +
                        (form.pdf_cover_logo_position === "top_right"
                          ? "justify-end"
                          : form.pdf_cover_logo_position === "top_center"
                            ? "justify-center"
                            : "justify-start")
                      }
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-orange-500 text-white">
                        {(form.pdf_cover_logo_url ?? form.logo_url) ? (
                          <img loading="lazy" src={(form.pdf_cover_logo_url ?? form.logo_url) as string} alt="" className="h-full w-full rounded object-contain bg-white p-1" />
                        ) : (
                          <Sun className="h-5 w-5" />
                        )}
                      </div>
                      <span className="text-xs font-semibold">Azienda</span>
                    </div>
                  )}
                  <div
                    className="space-y-3"
                    style={{
                      marginTop: (form.pdf_cover_text_vertical ?? "bottom") === "top" ? "1rem" : "auto",
                      marginBottom: (form.pdf_cover_text_vertical ?? "bottom") === "bottom" ? 0 : "auto",
                    }}
                  >
                    <div className="font-bold uppercase tracking-widest text-orange-200" style={{ fontSize: `${(form.pdf_cover_eyebrow_size ?? 11) * 0.85}px` }}>
                      {form.pdf_cover_eyebrow || "La tua proposta personalizzata"}
                    </div>
                    <div className="whitespace-pre-line font-black leading-none" style={{ fontSize: `${(form.pdf_cover_title_size ?? 40) * 0.7}px` }}>
                      {form.pdf_cover_hero || "Il sole\ndiventa tuo."}
                    </div>
                    <div className="leading-relaxed opacity-85" style={{ fontSize: `${(form.pdf_cover_subtitle_size ?? 13) * 0.92}px` }}>
                      {form.pdf_cover_subhero_template || form.pdf_cover_subhero || "Impianto fotovoltaico {potenza_kwp} {accumulo_kwh} per {indirizzo}."}
                    </div>
                    {form.pdf_cover_show_client_card !== false && (
                      <div className="rounded-md border border-white/20 bg-white/10 p-3 text-xs">
                        Card cliente dinamica
                      </div>
                    )}
                  </div>
                </div>
                {uploadingCover && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  className="flex-1 gap-1"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {form.pdf_cover_image_url ? "Cambia" : "Carica"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStockDialogOpen(true)}
                  className="flex-1 gap-1 border-sky-200 text-sky-700 hover:bg-sky-50"
                >
                  📷 Galleria stock
                </Button>
                {form.pdf_cover_image_url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => update("pdf_cover_image_url", null)}
                    className="text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </FvSettingsCard>
          </div>
        </>
      )}

      {/* Branding */}
      {activeSection === "brand" && (
        <>
      <FvSectionHeader
        title="Brand e azienda"
        description="Questa sezione allinea il modulo FV alla struttura serramenti: identità, contatti e dati usati nel PDF."
        number={1}
      />
      <FvSettingsCard
        title="Anagrafica e branding azienda"
        description="Logo, colori e contatti che compaiono nel PDF Fotovoltaico configurabile."
        icon={<Building2 className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-3">
            <Label className="text-xs mb-1 block">Logo PDF</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
            />
            <div
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-sky-300 hover:bg-sky-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
            >
              {form.logo_url ? (
                <img loading="lazy" src={form.logo_url} alt="Logo azienda" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
                </div>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              <Button
                size="sm" variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex-1 h-7 text-[11px]"
              >
                <Upload className="h-3 w-3 mr-1" />
                {form.logo_url ? "Cambia" : "Carica"}
              </Button>
              {form.logo_url && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => update("logo_url", null)}
                  className="h-7 text-[11px] text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">PNG/JPG, max 5 MB. Sfondo trasparente consigliato.</p>
          </div>

          <div className="col-span-12 md:col-span-3">
            <Label className="text-xs mb-1 block">Logo copertina (sfondo scuro)</Label>
            <input
              ref={coverLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCoverLogoUpload(e.target.files[0])}
            />
            <div
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-sky-300 hover:bg-sky-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingCoverLogo && coverLogoInputRef.current?.click()}
            >
              {form.pdf_cover_logo_url ? (
                <img loading="lazy" src={form.pdf_cover_logo_url} alt="Logo copertina" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingCoverLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
                </div>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              <Button
                size="sm" variant="outline"
                onClick={() => coverLogoInputRef.current?.click()}
                disabled={uploadingCoverLogo}
                className="flex-1 h-7 text-[11px]"
              >
                <Upload className="h-3 w-3 mr-1" />
                {form.pdf_cover_logo_url ? "Cambia" : "Carica"}
              </Button>
              {form.pdf_cover_logo_url && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => update("pdf_cover_logo_url", null)}
                  className="h-7 text-[11px] text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Versione chiara/bianca del logo per la copertina con sfondo scuro. Se vuoto, usa il logo principale.</p>
          </div>

          <div className="col-span-12 md:col-span-6 grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore primario</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_primario ?? "#1E3A5F"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_primario ?? "#1E3A5F"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore accento</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_accento ?? "#F97316"}
                  onChange={(e) => update("colore_accento", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_accento ?? "#F97316"}
                  onChange={(e) => update("colore_accento", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Telefono</Label>
              <Input
                value={form.contatto_telefono ?? ""}
                onChange={(e) => update("contatto_telefono", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.telefono, "+39 02 1234 5678")}
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">WhatsApp</Label>
              <Input
                value={form.contatto_whatsapp ?? ""}
                onChange={(e) => update("contatto_whatsapp", e.target.value)}
                placeholder="+39 333 1234567"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.contatto_email ?? ""}
                onChange={(e) => update("contatto_email", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.email, "info@azienda.it")}
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Sito web</Label>
              <Input
                value={form.url_sito ?? ""}
                onChange={(e) => update("url_sito", e.target.value)}
                placeholder="https://azienda.it"
                className="h-9"
              />
            </div>
          </div>
        </div>
      </FvSettingsCard>

        </>
      )}

      {activeSection === "page_chi_siamo" && (
        <>
          <FvSectionHeader
            title="Pagina Chi siamo"
            description="Questi contenuti finiscono nella pagina garanzie/azienda del PDF FV, come nel template serramenti."
            number={2}
          />
          <FvSettingsCard
            title="Presentazione azienda"
            description="Racconta specializzazione FV, metodo, squadra e affidabilita operativa."
            icon={<Building2 className="h-4 w-4" />}
          >
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Titolo pagina</Label>
                <Input
                  value={form.chi_siamo_titolo ?? ""}
                  onChange={(e) => update("chi_siamo_titolo", e.target.value || null)}
                  placeholder="L'azienda dietro al tuo impianto"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12 md:col-span-7">
                <Label className="text-xs">Foto team / azienda</Label>
                <div className="flex items-center gap-3 mt-1">
                  {form.foto_team_url ? (
                    <img
                      src={form.foto_team_url}
                      alt="Foto azienda"
                      className="h-12 w-16 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-12 w-16 rounded border border-dashed border-slate-300 bg-slate-50" />
                  )}
                  <input
                    ref={fotoTeamInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFotoTeamUpload(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingFotoTeam}
                    onClick={() => fotoTeamInputRef.current?.click()}
                  >
                    {uploadingFotoTeam
                      ? "Caricamento…"
                      : form.foto_team_url
                        ? "Cambia"
                        : "Carica foto"}
                  </Button>
                  {form.foto_team_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => update("foto_team_url", null)}
                    >
                      Rimuovi
                    </Button>
                  )}
                </div>
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Testo Chi siamo</Label>
                <CopyPresetRow
                  field="presentazione_impresa_html"
                  current={form.presentazione_impresa_html ?? ""}
                  onPick={(html) => update("presentazione_impresa_html", html)}
                />
                <RichTextEditor
                  value={form.presentazione_impresa_html ?? ""}
                  onChange={(html) => update("presentazione_impresa_html", html)}
                  placeholder="Siamo specializzati in fotovoltaico chiavi in mano, pratiche e assistenza post-installazione…"
                  minHeight={180}
                />
              </div>
            </div>
          </FvSettingsCard>
        </>
      )}

      {activeSection === "page_percorso" && (
        <>
          <FvSectionHeader
            title="Pagina Il tuo percorso"
            description="Copy introduttivo della pagina iter: chiarisce tempi, responsabilita e prossime azioni."
            number={3}
          />
          <FvSettingsCard
            title="Introduzione percorso cliente"
            icon={<FileText className="h-4 w-4" />}
          >
            <CopyPresetRow
              field="percorso_cliente_intro"
              current={form.percorso_cliente_intro ?? ""}
              onPick={(html) => update("percorso_cliente_intro", html)}
            />
            <RichTextEditor
              value={form.percorso_cliente_intro ?? ""}
              onChange={(html) => update("percorso_cliente_intro", html)}
              minHeight={140}
              placeholder="Dal sopralluogo alla connessione, ti accompagniamo in ogni fase…"
            />
          </FvSettingsCard>
        </>
      )}

      {activeSection === "page_consulente" && (
        <>
          <FvSectionHeader
            title="Pagina Consulente"
            description="Messaggio del referente commerciale nella pagina finale, utile per dare continuita tra preventivo e follow-up."
            number={4}
          />
          <FvSettingsCard
            title="Descrizione consulente"
            icon={<Quote className="h-4 w-4" />}
          >
            <CopyPresetRow
              field="consulente_descrizione_default"
              current={form.consulente_descrizione_default ?? ""}
              onPick={(html) => update("consulente_descrizione_default", html)}
            />
            <RichTextEditor
              value={form.consulente_descrizione_default ?? ""}
              onChange={(html) => update("consulente_descrizione_default", html || null)}
              minHeight={120}
              placeholder="Il consulente resta il riferimento unico per firma, pratiche, finanziamento e installazione."
            />
          </FvSettingsCard>
        </>
      )}

      {activeSection === "page_render" && (
        <>
          <FvSectionHeader
            title="Pagina Render AI / anteprima impianto"
            description="Nota di qualita per evitare promesse sbagliate: il layout e' commerciale finche non viene confermato dal sopralluogo."
            number={5}
          />
          <FvSettingsCard
            title="Disclaimer anteprima tetto"
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            <Textarea
              value={form.render_disclaimer ?? ""}
              onChange={(e) => update("render_disclaimer", e.target.value || null)}
              rows={5}
              placeholder="L'anteprima del tetto e' una simulazione commerciale: layout definitivo, ombre e passaggi cavi vengono confermati con sopralluogo tecnico."
            />
          </FvSettingsCard>
        </>
      )}

      {activeSection === "page_cta" && (
        <>
          <FvSectionHeader
            title="Pagina CTA finale"
            description="Titolo e testo prima della firma: deve trasformare il preventivo in prossima azione."
            number={6}
          />
          <FvSettingsCard
            title="Call to action e firma"
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs">Titolo CTA</Label>
                <Textarea
                  value={form.pdf_cta_finale_titolo ?? ""}
                  onChange={(e) => update("pdf_cta_finale_titolo", e.target.value || null)}
                  rows={3}
                  placeholder={"Pronto a\niniziare?"}
                />
              </div>
              <div className="col-span-12 md:col-span-7">
                <Label className="text-xs">Testo CTA</Label>
                <Textarea
                  value={form.pdf_cta_finale_testo ?? ""}
                  onChange={(e) => update("pdf_cta_finale_testo", e.target.value || null)}
                  rows={3}
                  placeholder="<p>Conferma la proposta o prenota un confronto con il consulente per bloccare condizioni e componenti.</p>"
                />
              </div>
            </div>
          </FvSettingsCard>
        </>
      )}

      {activeSection === "page_ordine" && (
        <>
          <FvSectionHeader
            title="Ordine e visibilità delle pagine"
            description="Da qui decidi l'ORDINE e quali pagine mostrare nel PDF: trascina per riordinare, usa l'occhio per nascondere le opzionali. La cover è sempre la prima. Di default 'Chi siamo e garanzie' e 'Percorso cliente' vengono subito dopo la cover."
          />
          <FvSettingsCard
            title="Tutte le pagine del preventivo"
            icon={<FileText className="h-4 w-4" />}
          >
            <FvPagesOrderEditor
              value={form.pdf_pages_order ?? null}
              onChange={(next) => update("pdf_pages_order", next)}
            />
          </FvSettingsCard>
        </>
      )}

      {activeSection === "prodotti" && (
        <>
      <FvSectionHeader
        title="Macro-categorie dal listino prodotti"
        description="Il PDF FV usa la stessa logica dei serramenti: foto, nomi e descrizioni arrivano dal listino prodotti aziendale."
        number={2}
      />
      <FvSettingsCard
        title="Sorgente immagini e testi"
        description="Qui controlli lo stato della sorgente. La modifica delle macro-categorie resta centralizzata nel listino prodotti."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-100 bg-sky-50/70 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Listino prodotti aziendale</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Abilita le macro-categorie per il verticale Fotovoltaico e completa immagine, descrizione e pagina PDF dal listino.
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
              <a href="/azienda/impostazioni/listino">
                <ExternalLink className="h-3.5 w-3.5" />
                Apri listino prodotti
              </a>
            </Button>
          </div>

          {isLoadingListinoMacrocategorie ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((idx) => (
                <Skeleton key={idx} className="h-32 rounded-md" />
              ))}
            </div>
          ) : fvListinoMacrocategorie.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    Nessuna macro-categoria FV trovata nel listino
                  </p>
                  <p className="mt-1 text-xs text-amber-900">
                    Crea o abilita macro-categorie come pannelli, inverter, accumulo e strutture con verticale "Fotovoltaico". Il PDF userà quelle immagini senza duplicarle nel template.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fvListinoMacrocategorie.map((macro) => {
                const description = macro.descrizione_estesa || macro.descrizione || "";
                const hasImage = Boolean(macro.immagine_url);
                const hasDescription = description.trim().length >= 40;
                return (
                  <div key={macro.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex gap-3">
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-400">
                        {macro.immagine_url ? (
                          <img loading="lazy"
                            src={macro.immagine_url}
                            alt=""
                            className="h-full w-full object-cover"
                            aria-hidden="true"
                          />
                        ) : (
                          <ImageIcon className="h-7 w-7" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="truncate text-sm font-semibold text-slate-950">
                            {macro.nome}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {macro.categoria_tipo}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-slate-600">
                          {description || "Descrizione non compilata nel listino."}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
                      <span className={`rounded-full px-2 py-1 ${hasImage ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {hasImage ? "Foto presente" : "Manca foto"}
                      </span>
                      <span className={`rounded-full px-2 py-1 ${hasDescription ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {hasDescription ? "Testo pronto" : "Testo breve"}
                      </span>
                      <span className={`rounded-full px-2 py-1 ${macro.mostra_pagina_dedicata_pdf ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {macro.mostra_pagina_dedicata_pdf ? "Pagina PDF attiva" : "Pagina PDF off"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </FvSettingsCard>

      <FvSettingsCard
        title="Pagine dedicate macrocategoria"
        description="Attiva le pagine PDF storytelling direttamente dal listino prodotti, come nei serramenti."
        icon={<FileText className="h-4 w-4" />}
      >
        <MacroPagineDedicateManager vertical="fotovoltaico" />
      </FvSettingsCard>
        </>
      )}

      {activeSection === "strategia" && (
        <>
      <FvSectionHeader
        title="Default tecnici e noleggio"
        description="Costi base €/kWp, default di preventivo e noleggio operativo B2B usati per il calcolo dell'offerta."
        number={3}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FvSettingsCard
          title="Default tecnici Fotovoltaico"
          description="Valori di controllo per preventivi rapidi, margine e confronto con listini reali."
          icon={<Sun className="h-4 w-4" />}
        >
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Label className="text-xs">Costo base €/kWp</Label>
              <Input
                type="number"
                min={0}
                value={form.costo_kwp_base ?? ""}
                onChange={(e) => update("costo_kwp_base", optionalNumber(e.target.value))}
                placeholder="1450"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-6">
              <Label className="text-xs">Costo accumulo €/kWh</Label>
              <Input
                type="number"
                min={0}
                value={form.costo_accumulo_kwh ?? ""}
                onChange={(e) => update("costo_accumulo_kwh", optionalNumber(e.target.value))}
                placeholder="680"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-6">
              <Label className="text-xs">Costo pratiche default</Label>
              <Input
                type="number"
                min={0}
                value={form.costo_pratiche_default ?? ""}
                onChange={(e) => update("costo_pratiche_default", optionalNumber(e.target.value))}
                placeholder="850"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-6">
              <Label className="text-xs">Manutenzione annua</Label>
              <Input
                type="number"
                min={0}
                value={form.manutenzione_annua_eur ?? ""}
                onChange={(e) => update("manutenzione_annua_eur", optionalNumber(e.target.value))}
                placeholder="180"
                className="h-9 text-xs"
              />
            </div>
          </div>
        </FvSettingsCard>
      </div>

      <FvSettingsCard
        title="Noleggio operativo FV per aziende"
        description="Parametri usati dal preventivatore quando proponi l'alternativa B2B zero anticipo."
        icon={<Settings2 className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium text-slate-900">Mostra noleggio operativo nel wizard</span>
              <span className="block text-[11px] text-slate-600">
                Pensato per PMI, industriali, condomini e CER. I privati restano su cash, rate o tasso zero.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.noleggio_operativo_attivo !== false}
              onChange={(e) => update("noleggio_operativo_attivo", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
            />
          </label>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Durata default (mesi)</Label>
              <Input
                type="number"
                min={36}
                max={144}
                step={12}
                value={form.noleggio_durata_default_mesi ?? 84}
                onChange={(e) => update("noleggio_durata_default_mesi", Number(e.target.value) || 84)}
                className="h-9 text-xs"
                disabled={form.noleggio_operativo_attivo === false}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Fattore canone totale %</Label>
              <Input
                type="number"
                min={100}
                max={180}
                step={1}
                value={Math.round((form.noleggio_fattore_default ?? 1.18) * 100)}
                onChange={(e) => update("noleggio_fattore_default", (optionalNumber(e.target.value) ?? 118) / 100)}
                className="h-9 text-xs"
                disabled={form.noleggio_operativo_attivo === false}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">118% = capitale + servizio/costo finanziario stimato.</p>
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Beneficio fiscale stimato %</Label>
              <Input
                type="number"
                min={0}
                max={45}
                step={1}
                value={Math.round((form.noleggio_aliquota_fiscale_pct ?? 0.24) * 100)}
                onChange={(e) => update("noleggio_aliquota_fiscale_pct", (optionalNumber(e.target.value) ?? 24) / 100)}
                className="h-9 text-xs"
                disabled={form.noleggio_operativo_attivo === false}
              />
            </div>
            <div className="col-span-12">
              <Label className="text-xs">Nota legale/fiscale per proposta e PDF</Label>
              <Textarea
                value={form.noleggio_note_legali ?? ""}
                onChange={(e) => update("noleggio_note_legali", e.target.value)}
                rows={3}
                disabled={form.noleggio_operativo_attivo === false}
                placeholder="Il noleggio operativo e il trattamento fiscale vanno confermati con partner finanziario e consulente fiscale."
              />
            </div>
          </div>
        </div>
      </FvSettingsCard>
        </>
      )}

      {/* Presentazione impresa */}
      {(activeSection === "contenuti" || activeSection === "page_conversione") && (
        <>
      <FvSectionHeader
        title="Contenuti commerciali PDF"
        description="Pagina chi siamo, proposta di valore, garanzie, FAQ e condizioni: è la parte che trasforma il calcolo in offerta vendibile."
        number={4}
      />
      <FvSettingsCard
        title="Presentazione dell'impresa"
        description="Testo che compare nella sezione 'Chi siamo' del PDF. Formatta con la toolbar (grassetto, liste, allineamento)."
        icon={<Sparkles className="h-4 w-4" />}
      >
        <RichTextEditor
          value={form.presentazione_impresa_html ?? ""}
          onChange={(html) => update("presentazione_impresa_html", html)}
          placeholder="Siamo un'azienda specializzata in impianti fotovoltaici chiavi in mano dal 2015…"
          minHeight={160}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Usa la toolbar per formattare (grassetto, corsivo, liste, allineamento).
        </p>
      </FvSettingsCard>

      <FvSettingsCard
        title="Proposta commerciale, garanzie e FAQ"
        description="Blocchi orientati alla conversione: spiegano valore, riducono obiezioni e preparano il cliente alla firma."
        icon={<ShieldCheck className="h-4 w-4" />}
      >
        <div className="space-y-5">
          <div>
            <Label className="text-xs">Proposta di valore FV</Label>
            <CopyPresetRow
              field="valore_proposta_html"
              current={form.valore_proposta_html ?? ""}
              onPick={(html) => update("valore_proposta_html", html)}
            />
            <RichTextEditor
              value={form.valore_proposta_html ?? ""}
              onChange={(html) => update("valore_proposta_html", html)}
              placeholder="Analizziamo consumi, tetto, incentivi, accumulo e ritorno economico prima di proporre l'impianto."
              minHeight={120}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Garanzie commerciali e operative</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => update("garanzie_conversione", DEFAULT_FV_GARANZIE)}
                className="h-7 text-[11px]"
              >
                Ripristina default
              </Button>
            </div>
            {garanzie.map((garanzia, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
                <div className="col-span-12 md:col-span-2">
                  <Label className="text-xs">Icona</Label>
                  <select
                    value={garanzia.icona ?? "shield"}
                    onChange={(e) =>
                      updateGaranzia(idx, "icona", e.target.value as FvGaranziaConversione["icona"])
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="shield">Shield</option>
                    <option value="award">Award</option>
                    <option value="clock">Clock</option>
                    <option value="tools">Tools</option>
                    <option value="battery">Battery</option>
                    <option value="sun">Sun</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Titolo</Label>
                  <Input
                    value={garanzia.titolo}
                    onChange={(e) => updateGaranzia(idx, "titolo", e.target.value)}
                    placeholder="Sopralluogo tecnico incluso"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-10 md:col-span-5">
                  <Label className="text-xs">Descrizione</Label>
                  <Input
                    value={garanzia.descrizione}
                    onChange={(e) => updateGaranzia(idx, "descrizione", e.target.value)}
                    placeholder="Cosa viene verificato prima della conferma ordine"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeGaranzia(idx)}
                    className="h-9 w-9 text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              onClick={addGaranzia}
              variant="outline"
              className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
            >
              <Plus className="h-4 w-4" /> Aggiungi garanzia
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">FAQ e obiezioni frequenti</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => update("faq_items", DEFAULT_FV_FAQ)}
                className="h-7 text-[11px]"
              >
                Ripristina default
              </Button>
            </div>
            {faqItems.map((faq, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-white p-3">
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Domanda</Label>
                  <Input
                    value={faq.domanda}
                    onChange={(e) => updateFaq(idx, "domanda", e.target.value)}
                    placeholder="Conviene sempre l'accumulo?"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-10 md:col-span-7">
                  <Label className="text-xs">Risposta</Label>
                  <Input
                    value={faq.risposta}
                    onChange={(e) => updateFaq(idx, "risposta", e.target.value)}
                    placeholder="Dipende da profilo, consumi serali e budget."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeFaq(idx)}
                    className="h-9 w-9 text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              onClick={addFaq}
              variant="outline"
              className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
            >
              <Plus className="h-4 w-4" /> Aggiungi FAQ
            </Button>
          </div>

          <div className="grid grid-cols-12 gap-3 border-t border-slate-200 pt-4">
            <div className="col-span-12 rounded-md border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Libreria condivisa Template offerte</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Riusa condizioni contrattuali e termini legali anche nei preventivi fotovoltaici.
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {sharedLegalTemplates.length} blocchi
                </span>
              </div>

              <div className="mt-3 grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-5">
                  <Label className="text-xs">Blocco condiviso</Label>
                  <select
                    value={selectedSharedLegalId}
                    onChange={(e) => setSelectedSharedLegalId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    <option value="">
                      {sharedLegalTemplates.length > 0
                        ? "Seleziona un blocco..."
                        : "Nessun blocco disponibile"}
                    </option>
                    {sharedLegalTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.kind === "condizioni" ? "Condizioni" : "Termini legali"} · {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 flex flex-wrap items-end gap-2 md:col-span-7">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedSharedLegalTemplate}
                    onClick={() => applySharedLegalTemplate("replace")}
                  >
                    Sostituisci testo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedSharedLegalTemplate}
                    onClick={() => applySharedLegalTemplate("append")}
                  >
                    Aggiungi in fondo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!String(form.condizioni_legali_testo ?? "").trim() || upsertQuoteTemplate.isPending}
                    onClick={() => void saveSharedLegalTemplate("condizioni")}
                  >
                    {upsertQuoteTemplate.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Salva condizioni
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!String(form.condizioni_legali_testo ?? "").trim() || upsertQuoteTemplate.isPending}
                    onClick={() => void saveSharedLegalTemplate("legali")}
                  >
                    {upsertQuoteTemplate.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Salva termini
                  </Button>
                </div>
              </div>
            </div>
            <label className="col-span-12 flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.condizioni_legali_attivo ?? false}
                onChange={(e) => update("condizioni_legali_attivo", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
              />
              <span>Mostra condizioni commerciali e legali nel PDF</span>
            </label>
            <div className="col-span-12">
              <Label className="text-xs">Condizioni commerciali / legali</Label>
              <Textarea
                value={form.condizioni_legali_testo ?? ""}
                onChange={(e) => update("condizioni_legali_testo", e.target.value)}
                placeholder="Validita offerta, acconto, saldo, pratiche incluse, esclusioni, sopralluogo e gestione varianti."
                rows={3}
                disabled={!form.condizioni_legali_attivo}
              />
            </div>
            <label className="col-span-12 flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.urgenza_attiva ?? false}
                onChange={(e) => update("urgenza_attiva", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
              />
              <span>Mostra nota urgenza su validita offerta e disponibilita componenti</span>
            </label>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Titolo urgenza</Label>
              <Input
                value={form.urgenza_titolo ?? ""}
                onChange={(e) => update("urgenza_titolo", e.target.value)}
                disabled={!form.urgenza_attiva}
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-12 md:col-span-8">
              <Label className="text-xs">Descrizione urgenza</Label>
              <Input
                value={form.urgenza_descrizione ?? ""}
                onChange={(e) => update("urgenza_descrizione", e.target.value)}
                disabled={!form.urgenza_attiva}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </div>
      </FvSettingsCard>
        </>
      )}

      {/* Recensioni */}
      {activeSection === "page_recensioni" && (
        <>
      <FvSectionHeader
        title="Fiducia e prova sociale"
        description="Recensioni e certificazioni sono separate dai contenuti commerciali, come nel modulo serramenti: il venditore capisce subito cosa manca per dare credibilità."
        number={5}
      />
      <FvSettingsCard
        title="Recensioni e testimonianze clienti"
        description="Compaiono nella sezione 'Cosa dicono i nostri clienti' del PDF Fotovoltaico."
        icon={<Quote className="h-4 w-4" />}
      >
        <div className="space-y-3">
          {recensioni.length === 0 && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              Nessuna recensione caricata. Aggiungile per mostrare prova sociale ai nuovi clienti.
            </div>
          )}
          {recensioni.map((r, idx) => (
            <Card key={idx} className="bg-sky-50/30 border-sky-200">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-sky-700">
                  Recensione {idx + 1}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setDelRecIdx(idx)} className="h-7 px-2 text-xs text-rose-600">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2">
                <div className="col-span-12">
                  <Label className="text-xs">Citazione</Label>
                  <Textarea
                    value={r.quote}
                    onChange={(e) => updateRecensione(idx, "quote", e.target.value)}
                    placeholder='"Il nostro impianto produce esattamente come avevano stimato..."'
                    rows={3}
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Autore</Label>
                  <Input
                    value={r.autore}
                    onChange={(e) => updateRecensione(idx, "autore", e.target.value)}
                    placeholder="Mario R."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Città</Label>
                  <Input
                    value={r.citta ?? ""}
                    onChange={(e) => updateRecensione(idx, "citta", e.target.value)}
                    placeholder="Milano"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-5">
                  <Label className="text-xs">Tipo impianto</Label>
                  <Input
                    value={r.intervento ?? ""}
                    onChange={(e) => updateRecensione(idx, "intervento", e.target.value)}
                    placeholder="6 kWp + accumulo 10 kWh"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-12">
                  <Label className="text-xs">Foto impianto installato (opzionale)</Label>
                  <div className="flex items-center gap-3 mt-1">
                    {r.foto_url ? (
                      <img
                        src={r.foto_url}
                        alt="Impianto installato"
                        className="h-12 w-16 rounded object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-12 w-16 rounded border border-dashed border-slate-300 bg-slate-50" />
                    )}
                    <label
                      className={`inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50 ${
                        uploadingRecIdx === idx ? "opacity-60 pointer-events-none" : ""
                      }`}
                    >
                      {uploadingRecIdx === idx
                        ? "Caricamento…"
                        : r.foto_url
                          ? "Cambia foto"
                          : "Carica foto impianto"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleRecensioneFotoUpload(idx, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {r.foto_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => updateRecensione(idx, "foto_url", "")}
                      >
                        Rimuovi
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button
            onClick={addRecensione}
            variant="outline"
            className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
          >
            <Plus className="h-4 w-4" /> Aggiungi recensione
          </Button>
        </div>
      </FvSettingsCard>

      <FvSettingsCard
        title="Gallery lavori"
        description="Foto di lavori realizzati, mostrate nel PDF."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        <GalleryLavoriEditor
          items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
          onChange={(items) => update("gallery_lavori", items)}
          bucket="fv-progetti"
          uploadPath={`${companyId}/fotovoltaico/gallery`}
        />
      </FvSettingsCard>

      {/* Certificazioni */}
      <FvSettingsCard
        title="Certificazioni e qualifiche"
        description="Compaiono nella sezione 'Affidabilità' del PDF. Es. Certificazione installatore PV, UNI EN ISO 9001, ecc."
        icon={<BadgeCheck className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {certificazioni.map((c, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end border-l-4 border-sky-200 pl-3 py-1">
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Nome certificazione</Label>
                <Input
                  value={c.nome}
                  onChange={(e) => updateCertificazione(idx, "nome", e.target.value)}
                  placeholder="Es. Installatore PV qualificato"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-10 md:col-span-5">
                <Label className="text-xs">Ente certificatore</Label>
                <Input
                  value={c.ente ?? ""}
                  onChange={(e) => updateCertificazione(idx, "ente", e.target.value)}
                  placeholder="GSE / ENEA / Bureau Veritas"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Button size="icon" variant="ghost" onClick={() => setDelCertIdx(idx)} className="h-9 w-9">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            onClick={addCertificazione}
            variant="outline"
            className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
          >
            <Plus className="h-4 w-4" /> Aggiungi certificazione
          </Button>
        </div>
      </FvSettingsCard>
        </>
      )}

      {/* Economia */}
      {activeSection === "default" && (
        <>
      <FvSectionHeader
        title="Default economici e condizioni"
        description="Valori di partenza usati nei nuovi preventivi: validità, recesso, acconto e regole economiche standard."
        number={6}
      />
      <FvSettingsCard
        title="Default economia preventivo"
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Validità preventivo (giorni)</Label>
            <Input
              type="number"
              value={form.scadenza_validita_preventivo_giorni ?? 30}
              onChange={(e) => update("scadenza_validita_preventivo_giorni", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Recesso (giorni)</Label>
            <Input
              type="number"
              value={form.recesso_giorni ?? 14}
              onChange={(e) => update("recesso_giorni", Number(e.target.value) || 14)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Acconto %</Label>
            <Input
              type="number"
              min={0} max={100} step={5}
              value={form.acconto_pct ?? 30}
              onChange={(e) => update("acconto_pct", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </FvSettingsCard>
        </>
      )}

        </div>
      </div>

      {/* Save sticky bottom */}
      {!embedded && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-sky-700 hover:bg-sky-800 gap-1 shadow-lg"
            size="lg"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva impostazioni
          </Button>
        </div>
      )}

      {/* Galleria immagini stock cover (parità Serramenti) */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-3 border-b">
            <DialogTitle className="text-base">📷 Galleria immagini stock</DialogTitle>
            <DialogDescription className="text-xs">
              Click su un'immagine per usarla come sfondo cover. Tutte libere da licenza (Unsplash) — uso commerciale incluso.
            </DialogDescription>
            <div className="flex flex-wrap gap-1 pt-2">
              {COVER_STOCK_CATEGORIE.map((cat) => {
                const isActive = stockCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setStockCategory(cat.value)}
                    className={
                      "text-[11px] px-2 py-1 rounded-md border transition-all gap-1 inline-flex items-center " +
                      (isActive ? "bg-sky-600 text-white border-sky-600 font-semibold" : "bg-white border-slate-200 hover:border-sky-300 text-slate-700")
                    }
                  >
                    <span>{cat.emoji}</span>{cat.label}
                  </button>
                );
              })}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {stockFiltered.map((img) => {
                const isActive = form.pdf_cover_image_url === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => applyStockImage(img)}
                    className={
                      "group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-sky-400 " +
                      (isActive ? "border-sky-500 shadow-md ring-2 ring-sky-300" : "border-slate-200 hover:border-sky-300 hover:shadow-sm")
                    }
                    title={img.label}
                  >
                    <img src={img.thumb} alt={img.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <span className="text-[10px] font-semibold text-white">{img.label}</span>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 bg-sky-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {stockFiltered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nessuna immagine in questa categoria.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma rimozione recensione */}
      <AlertDialog open={delRecIdx !== null} onOpenChange={(o) => !o && setDelRecIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la recensione?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà più nei nuovi preventivi. I PDF già generati non verranno modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delRecIdx !== null && removeRecensione(delRecIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog conferma rimozione certificazione */}
      <AlertDialog open={delCertIdx !== null} onOpenChange={(o) => !o && setDelCertIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la certificazione?</AlertDialogTitle>
            <AlertDialogDescription>Non comparirà più nei nuovi preventivi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delCertIdx !== null && removeCertificazione(delCertIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Anteprima PDF completa (lazy) */}
      {previewOpen && (
        <Suspense fallback={null}>
          <FvTemplatePreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            form={form as unknown as Record<string, unknown>}
            logoUrl={(form.logo_url as string | null) ?? null}
          />
        </Suspense>
      )}
    </div>
  );
}
