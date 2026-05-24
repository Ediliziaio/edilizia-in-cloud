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
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save, Plus, Trash2, Loader2, Sparkles, Quote, BadgeCheck, Building2,
  Upload, Image as ImageIcon, AlertTriangle, CheckCircle2, ShieldCheck, Sun,
  Settings2, FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  buildFvTemplateQualityItems,
  DEFAULT_FV_FAQ,
  DEFAULT_FV_GARANZIE,
  type FvFaqItem,
  type FvGaranziaConversione,
  type FvTemplateQualityItem,
} from "@/lib/fotovoltaico/preventivatore";

// ─── Types locali (no dipendenza forte da fv types globali) ─────────────────

interface FvRecensione {
  quote: string;
  autore: string;
  citta?: string;
  intervento?: string;
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
  | "fiducia"
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
    label: "Strategia",
    icon: "ROI",
    description: "Margini, CPL, capacita e noleggio B2B.",
  },
  {
    id: "contenuti",
    label: "Contenuti",
    icon: "PDF",
    description: "Presentazione, valore, garanzie, FAQ e condizioni.",
  },
  {
    id: "fiducia",
    label: "Fiducia",
    icon: "Trust",
    description: "Recensioni, certificazioni e prova sociale.",
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
      "page_ordine",
    ],
  },
  {
    title: "Dati & contenuti",
    sections: ["prodotti", "strategia", "contenuti", "fiducia", "default"],
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
  number: number;
}) {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/70 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-700 text-xs font-bold text-white">
          {number}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-600">{description}</p>
        </div>
      </div>
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
  const [dirty, setDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<FvEditorSection>(initialSection);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [delRecIdx, setDelRecIdx] = useState<number | null>(null);
  const [delCertIdx, setDelCertIdx] = useState<number | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [selectedSharedLegalId, setSelectedSharedLegalId] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

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
        <Button
          onClick={handleSave}
          disabled={!dirty || upsertMut.isPending}
          className="shrink-0 bg-sky-700 hover:bg-sky-800 gap-1"
          size="sm"
        >
          {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </Button>
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
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Titolo hero</Label>
                  <Textarea
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(e) => update("pdf_cover_hero", e.target.value || null)}
                    rows={2}
                    placeholder={"Il sole\ndiventa tuo."}
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
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Placeholder: {"{cliente_nome}"}, {"{potenza_kwp}"}, {"{accumulo_kwh}"}, {"{indirizzo}"}, {"{comune}"}, {"{numero_pannelli}"}.
                  </p>
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
                  <Label className="text-xs">Overlay immagine</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.pdf_cover_overlay_opacity ?? 62}
                    onChange={(e) => update("pdf_cover_overlay_opacity", Number(e.target.value) || 0)}
                    className="h-9 text-xs"
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
                  <img
                    src={form.pdf_cover_image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    aria-hidden="true"
                  />
                )}
                {form.pdf_cover_image_url && (
                  <div
                    className="absolute inset-0 bg-slate-950"
                    style={{ opacity: (form.pdf_cover_overlay_opacity ?? 62) / 100 }}
                  />
                )}
                <div className="relative flex h-full flex-col">
                  {(form.pdf_cover_logo_position ?? "top_left") !== "hidden" && (
                    <div
                      className={
                        "mb-auto flex items-center gap-2 " +
                        (form.pdf_cover_logo_position === "top_right"
                          ? "justify-end"
                          : form.pdf_cover_logo_position === "top_center"
                            ? "justify-center"
                            : "justify-start")
                      }
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-orange-500 text-white">
                        {form.logo_url ? (
                          <img src={form.logo_url} alt="" className="h-full w-full rounded object-contain bg-white p-1" />
                        ) : (
                          <Sun className="h-5 w-5" />
                        )}
                      </div>
                      <span className="text-xs font-semibold">Azienda</span>
                    </div>
                  )}
                  <div className="mt-auto space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-orange-200">
                      {form.pdf_cover_eyebrow || "La tua proposta personalizzata"}
                    </div>
                    <div className="whitespace-pre-line text-3xl font-black leading-none">
                      {form.pdf_cover_hero || "Il sole\ndiventa tuo."}
                    </div>
                    <div className="text-xs leading-relaxed opacity-85">
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
                  Carica immagine
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
                <img src={form.logo_url} alt="Logo azienda" className="w-full h-full object-contain p-2" />
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

          <div className="col-span-12 md:col-span-9 grid grid-cols-12 gap-3">
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
                placeholder="+39 02 1234 5678"
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
                placeholder="info@azienda.it"
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
                <Input
                  value={form.foto_team_url ?? ""}
                  onChange={(e) => update("foto_team_url", e.target.value || null)}
                  placeholder="https://..."
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Testo Chi siamo</Label>
                <Textarea
                  value={form.presentazione_impresa_html ?? ""}
                  onChange={(e) => update("presentazione_impresa_html", e.target.value)}
                  placeholder="<p>Siamo specializzati in fotovoltaico chiavi in mano, pratiche e assistenza post-installazione...</p>"
                  rows={8}
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
            <Textarea
              value={form.percorso_cliente_intro ?? ""}
              onChange={(e) => update("percorso_cliente_intro", e.target.value)}
              rows={6}
              placeholder="<p>Dal sopralluogo alla connessione, ti accompagniamo in ogni fase...</p>"
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
            <Textarea
              value={form.consulente_descrizione_default ?? ""}
              onChange={(e) => update("consulente_descrizione_default", e.target.value || null)}
              rows={5}
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
            title="Ordine e visibilita pagine PDF"
            description="Come per il serramento: cover fissa, pagine riordinabili, opzionali nascondibili. Componenti e macro rimangono dinamici dal listino."
            number={7}
          />
          <FvSettingsCard
            title="Struttura del preventivo"
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
                          <img
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
        title="Strategia economica e vendita"
        description="Margine, capacità, CPL e noleggio operativo: qui il modulo decide se un'offerta è sostenibile prima di venderla o scalarla."
        number={3}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FvSettingsCard
          title="Strategia economica e commerciale"
          description="Serve per capire se l'offerta FV e le campagne hanno senso prima di scalare budget."
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6 md:col-span-4">
              <Label className="text-xs">Margine target %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round((form.margine_target_pct ?? 0) * 100)}
                onChange={(e) => update("margine_target_pct", (optionalNumber(e.target.value) ?? 0) / 100)}
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-6 md:col-span-4">
              <Label className="text-xs">CPL max sostenibile</Label>
              <Input
                type="number"
                min={0}
                value={form.cpl_max_sostenibile ?? ""}
                onChange={(e) => update("cpl_max_sostenibile", optionalNumber(e.target.value))}
                placeholder="120"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Installazioni/mese</Label>
              <Input
                type="number"
                min={0}
                value={form.capacita_installazioni_mese ?? ""}
                onChange={(e) => update("capacita_installazioni_mese", optionalNumber(e.target.value))}
                placeholder="6"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-12">
              <Label className="text-xs">Zona servita e vincoli commerciali</Label>
              <Textarea
                value={form.zona_servita_note ?? ""}
                onChange={(e) => update("zona_servita_note", e.target.value)}
                placeholder="Es. Monza Brianza, Milano nord, Lecco. Escludere tetti non accessibili o condomini senza delibera."
                rows={3}
              />
            </div>
          </div>
        </FvSettingsCard>

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
        description="Testo che compare nella sezione 'Chi siamo' del PDF. Puoi usare HTML semplice."
        icon={<Sparkles className="h-4 w-4" />}
      >
        <Textarea
          value={form.presentazione_impresa_html ?? ""}
          onChange={(e) => update("presentazione_impresa_html", e.target.value)}
          placeholder="<p>Siamo un'azienda specializzata in impianti fotovoltaici chiavi in mano dal 2015...</p>"
          rows={6}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Tag supportati: <code>&lt;p&gt;</code>, <code>&lt;br&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;ul&gt;</code>, <code>&lt;li&gt;</code>
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
            <Textarea
              value={form.valore_proposta_html ?? ""}
              onChange={(e) => update("valore_proposta_html", e.target.value)}
              placeholder="<p>Analizziamo consumi, tetto, incentivi, accumulo e ritorno economico prima di proporre l'impianto.</p>"
              rows={4}
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
      {(activeSection === "fiducia" || activeSection === "page_recensioni") && (
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
    </div>
  );
}
