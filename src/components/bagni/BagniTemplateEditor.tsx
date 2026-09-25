import { TemplateSectionNavigation } from "@/components/preventivi/TemplateSectionNavigation";
import { edileSectionExcluded } from "@/components/preventivi/templateNavigationState";
import { withEdilePageVisibility } from "@/components/preventivi/edilePageVisibility";
import { TemplateCoverDesignControls, COVER_DESIGN_CHOICES } from "@/components/preventivi/TemplateCoverDesignControls";
import { TemplateSectionCard as SectionCard, TemplateListItemsEditor as ListItemsEditor, TemplateTestimonianzeEditor as TestimonianzeEditor, TemplateFaqEditor as FaqEditor, TemplateCronoEditor as CronoEditor } from "@/components/preventivi/TemplateContentControls";
import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";
import { TemplateCoverStylePicker, TemplateCoverTextFields, coverStyleOnly } from "@/components/preventivi/TemplateCoverControls";
/**
 * BagniTemplateEditor — editor del template PDF del verticale
 * Bagni (Task 20).
 *
 * Modellato su `SerramentiTemplateEditor` ma alla scala di `bgn_template_pdf`
 * (un record/azienda, upsert via `useUpsertBgnTemplatePdf`). Configura:
 *  - Branding: logo (upload) + 4 colori (primario/secondario/accent/testo)
 *  - Copertina: titolo, sottotitolo, immagine hero (upload)
 *  - Chi siamo: testo + foto (upload) + toggle visibilità
 *  - Liste editabili: esigenze / soluzione / USP ({titolo, descrizione})
 *  - Testimonianze ({autore, ruolo, testo})
 *  - Cronoprogramma fasi ({fase, durata, descrizione}) + toggle visibilità
 *  - Condizioni: pagamenti, validità, footer
 *  - Toggle "mostra margini nel PDF"
 *
 * Stato locale del form seedato UNA volta dal server tramite `key` montaggio
 * (il parent monta con key sul template id quando disponibile) + un effetto di
 * idratazione controllato con un ref "hydrated" per non sovrascrivere edit utente
 * a ogni refetch. Nessun `Date.now()`/`Math.random()` in render: gli id riga
 * delle liste usano un contatore stabile via `useRef`.
 *
 * Upload immagini: bucket PUBLIC `company-photo-library` (pattern StepMedia),
 * path `{company_id}/bagni/template/{uuid}.{ext}` → URL pubblico
 * stabile salvato nel template (ideale per il PDF, niente signed URL scaduti).
 */
import { templateEditorLayout, TemplateEditorSaveBar, TemplateEditorWorkspace, TemplateEditorNavigation } from "@/components/preventivi/TemplateEditorLayout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CondizioniContratto } from "@/components/preventivi/CondizioniContratto";
import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";
import { SezionePaginaEdile } from "@/components/preventivi/SezionePaginaEdile";
import { PAGINE_EDITOR_EDILI } from "@/components/preventivi/pagineEditor";
import { tipografiaDaModello } from "@/components/preventivi/pdf/temaDocumento";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Save, Loader2, Upload, Image as ImageIcon, Plus, Trash2, GripVertical,
  Palette, FileText, Sparkles, ListChecks, Clock, Building2,
  Eye, EyeOff, BadgeEuro, AlertTriangle, FileSearch, Route, Percent,
  Wand2, ListOrdered,} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RichTextEditorSafe } from "@/components/ui/rich-text-editor-safe";
// Cover PDF "1-click" — parity Serramenti (stesso stack @react-pdf).
import { COVER_PRESETS as COVER_LAYOUT_PRESETS, detectActiveCoverPreset } from "@/components/bagni/coverPresets";
import { COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage } from "@/components/bagni/coverStockImages";
import { useBagniPDF } from "@/hooks/useBagniPDF";
import { BagniTemplatePreviewDialog } from "@/components/bagni/BagniTemplatePreviewDialog";
import { BagniLivePreviewPanel } from "@/components/bagni/BagniLivePreviewPanel";
import { AiTemplateReviewDialog } from "@/components/preventivi/AiTemplateReviewDialog";
import { StandardTextTemplatePicker } from "@/components/preventivi/StandardTextTemplatePicker";
import { AiSalesProfileForm } from "@/components/preventivi/AiSalesProfileForm";
import { useCompanySalesProfile, EMPTY_SALES_PROFILE, type CompanySalesProfile } from "@/hooks/useCompanySalesProfile";
import {
  useBgnTemplatePdf,
  useUpsertBgnTemplatePdf,
  useBgnBackendReady,
  useEffectiveCompanyId,
  type BgnTemplatePatch,
} from "@/hooks/useBagniProgetto";
import type {
  BgnTemplatePdf, BgnListItem, BgnFaqItem, BgnTestimonianza, BgnCronoFase,
  BgnProgetto, BgnComputoVoce,
} from "@/types/bagni";
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import type { GalleryLavoroItem } from "@/types/gallery";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { FinanziamentoPromoField } from "@/components/preventivi/FinanziamentoPromoField";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";
import { createFullBgnTemplate, buildBgnModulePreview, type FullBgnModuleId } from "@/lib/moduli-vendita/fullBgnModules";
import { bgnCopyChoices } from "@/lib/moduli-vendita/bgnInterventionCopy";
import { InterventionTextPicker } from "@/components/preventivi/modules/InterventionTextPicker";
import { fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";

const BUCKET = "company-photo-library";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Stili rapidi: applicano in un click i 4 colori del brand. Pura UI (nessun nuovo
// campo/colonna): ogni preset scrive sui colori esistenti via `set(...)`.
const PALETTE_PRESETS: Array<{ nome: string; color_primary: string; color_secondary: string; color_accent: string; color_text: string }> = [
  { nome: "Blu professionale", color_primary: "#1E3A5F", color_secondary: "#F97316", color_accent: "#16A34A", color_text: "#212529" },
  { nome: "Verde natura",      color_primary: "#14532D", color_secondary: "#65A30D", color_accent: "#0EA5E9", color_text: "#1C1917" },
  { nome: "Grafite elegante",  color_primary: "#1F2937", color_secondary: "#D97706", color_accent: "#0891B2", color_text: "#111827" },
  { nome: "Bordeaux caldo",    color_primary: "#7F1D1D", color_secondary: "#B45309", color_accent: "#15803D", color_text: "#1C1917" },
  { nome: "Indaco moderno",    color_primary: "#3730A3", color_secondary: "#EC4899", color_accent: "#10B981", color_text: "#1E1B4B" },
];

// Campi {placeholder} sostituiti nel PDF (cover hero/subhero/eyebrow). Riusabili
// in qualsiasi campo testo della copertina; restano allineati al renderer PDF.
const BGN_PLACEHOLDERS = [
  "cliente_nome", "cliente_cognome", "cliente_nome_completo",
  "cantiere_citta", "cantiere_provincia", "tipo_intervento", "anno",
] as const;

/** Chip cliccabili che inseriscono un campo personalizzato nel testo collegato.
 *  Con `targetRef` inserisce al cursore; senza, appende in coda. */
function PlaceholderChips({
  value, onChange, targetRef, label = "Inserisci campo personalizzato (cliccabile):",
}: {
  value: string;
  onChange: (next: string) => void;
  targetRef?: { current: HTMLTextAreaElement | HTMLInputElement | null };
  label?: string;
}) {
  const insert = (name: string) => {
    const token = `{${name}}`;
    const el = targetRef?.current;
    const v = value ?? "";
    if (!el || el.selectionStart == null) { onChange(v + token); return; }
    const start = el.selectionStart ?? v.length;
    const end = el.selectionEnd ?? v.length;
    onChange(v.slice(0, start) + token + v.slice(end));
    requestAnimationFrame(() => {
      try { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos); } catch { /* input non selezionabile */ }
    });
  };
  return (
    <div className="mt-1.5">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {BGN_PLACEHOLDERS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => insert(n)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-slate-600 hover:text-orange-700 transition-colors"
          >
            {`{${n}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// Forma del form locale: stesso shape del patch persistito.
type FormState = Required<Pick<BgnTemplatePdf,
  | "pdf_ordine_capitoli" | "pdf_pagine_libere"
  | "condizioni_legali_testo" | "condizioni_legali_attivo" | "modulo_recesso_attivo" | "pdf_blocchi"
  | "logo_url" | "color_primary" | "color_secondary" | "color_accent" | "color_text"
  | "chi_siamo" | "chi_siamo_foto_url" | "esigenze" | "soluzione" | "usp"
  | "testimonianze" | "cronoprogramma" | "cover_title" | "cover_subtitle"
  | "cover_image_url" | "payment_terms_text" | "validity_text" | "footer_text"
  | "show_chi_siamo" | "show_cronoprogramma" | "show_margine"
  | "ragione_sociale" | "indirizzo_completo" | "telefono" | "email" | "partita_iva"
  | "font_family" | "show_footer_version" | "show_footer_legal"
  | "cover_logo_position" | "cover_text_color" | "cover_overlay_opacity"
  | "cover_logo_url"
  | "garanzie" | "faq" | "percorso" | "show_garanzie" | "show_percorso"
  | "cover_title_size" | "cover_text_align"
  | "default_iva_pct" | "default_detrazione_pct" | "default_validita_giorni"
  // Cover PDF "1-click" (parity sr_template_pdf)
  | "pdf_cover_bg_color" | "pdf_cover_image_url" | "pdf_cover_eyebrow"
  | "pdf_cover_hero" | "pdf_cover_subhero" | "pdf_cover_subhero_template"
  | "pdf_cover_text_color" | "pdf_cover_text_align" | "pdf_cover_overlay_opacity"
  | "pdf_cover_eyebrow_size" | "pdf_cover_title_size" | "pdf_cover_subtitle_size"
  | "pdf_cover_logo_size" | "pdf_cover_show_client_card" | "pdf_cover_show_decoration"
  | "pdf_cover_decoration_style" | "pdf_cover_text_vertical" | "pdf_cover_overlay_style"
  | "pdf_cover_logo_position"
  | "gallery_lavori"
>>;

function templateToForm(t: BgnTemplatePdf): FormState {
  return {
    pdf_ordine_capitoli: t.pdf_ordine_capitoli ?? null,
    pdf_pagine_libere: t.pdf_pagine_libere ?? [],
    condizioni_legali_testo: t.condizioni_legali_testo ?? "",
    condizioni_legali_attivo: t.condizioni_legali_attivo ?? true,
    modulo_recesso_attivo: t.modulo_recesso_attivo === true,
    pdf_blocchi: t.pdf_blocchi ?? {},
    logo_url: t.logo_url ?? null,
    cover_logo_url: t.cover_logo_url ?? null,
    color_primary: t.color_primary ?? "#1E3A5F",
    color_secondary: t.color_secondary ?? "#F97316",
    color_accent: t.color_accent ?? "#16A34A",
    color_text: t.color_text ?? "#212529",
    chi_siamo: t.chi_siamo ?? "",
    chi_siamo_foto_url: t.chi_siamo_foto_url ?? null,
    esigenze: t.esigenze ?? [],
    soluzione: t.soluzione ?? [],
    usp: t.usp ?? [],
    testimonianze: t.testimonianze ?? [],
    cronoprogramma: t.cronoprogramma ?? [],
    cover_title: t.cover_title ?? "",
    cover_subtitle: t.cover_subtitle ?? "",
    cover_image_url: t.cover_image_url ?? null,
    payment_terms_text: t.payment_terms_text ?? "",
    validity_text: t.validity_text ?? "",
    footer_text: t.footer_text ?? "",
    show_chi_siamo: t.show_chi_siamo ?? true,
    show_cronoprogramma: t.show_cronoprogramma ?? true,
    show_margine: t.show_margine ?? false,
    ragione_sociale: t.ragione_sociale ?? null,
    indirizzo_completo: t.indirizzo_completo ?? null,
    telefono: t.telefono ?? null,
    email: t.email ?? null,
    partita_iva: t.partita_iva ?? null,
    font_family: t.font_family ?? "helvetica",
    show_footer_version: t.show_footer_version ?? true,
    show_footer_legal: t.show_footer_legal ?? false,
    cover_logo_position: t.cover_logo_position ?? "top_left",
    cover_text_color: t.cover_text_color ?? "#FFFFFF",
    cover_overlay_opacity: t.cover_overlay_opacity ?? 0.4,
    garanzie: t.garanzie ?? [],
    faq: t.faq ?? [],
    percorso: t.percorso ?? [],
    show_garanzie: t.show_garanzie ?? true,
    show_percorso: t.show_percorso ?? true,
    cover_title_size: t.cover_title_size ?? 30,
    cover_text_align: t.cover_text_align ?? "left",
    default_iva_pct: t.default_iva_pct ?? 10,
    default_detrazione_pct: t.default_detrazione_pct ?? 50,
    default_validita_giorni: t.default_validita_giorni ?? 30,
    // Cover PDF "1-click". Idratiamo i pdf_cover_* ripiegando sui legacy cover_*
    // così i template salvati prima della migration mostrano subito i valori
    // corretti nell'editor (e i preset si attivano se combaciano).
    pdf_cover_bg_color: t.pdf_cover_bg_color ?? null,
    pdf_cover_image_url: t.pdf_cover_image_url ?? t.cover_image_url ?? null,
    pdf_cover_eyebrow: t.pdf_cover_eyebrow ?? null,
    pdf_cover_hero: t.pdf_cover_hero ?? t.cover_title ?? null,
    pdf_cover_subhero: t.pdf_cover_subhero ?? t.cover_subtitle ?? null,
    pdf_cover_subhero_template: t.pdf_cover_subhero_template ?? null,
    pdf_cover_text_color: t.pdf_cover_text_color ?? t.cover_text_color ?? "#FFFFFF",
    pdf_cover_text_align: t.pdf_cover_text_align ?? (t.cover_text_align === "center" ? "center" : "left"),
    pdf_cover_overlay_opacity: t.pdf_cover_overlay_opacity ?? null,
    pdf_cover_eyebrow_size: t.pdf_cover_eyebrow_size ?? null,
    pdf_cover_title_size: t.pdf_cover_title_size ?? null,
    pdf_cover_subtitle_size: t.pdf_cover_subtitle_size ?? null,
    pdf_cover_logo_size: t.pdf_cover_logo_size ?? null,
    pdf_cover_show_client_card: t.pdf_cover_show_client_card ?? true,
    pdf_cover_show_decoration: t.pdf_cover_show_decoration ?? false,
    pdf_cover_decoration_style: t.pdf_cover_decoration_style ?? "square",
    pdf_cover_text_vertical: t.pdf_cover_text_vertical ?? "bottom",
    pdf_cover_overlay_style: t.pdf_cover_overlay_style ?? "flat",
    pdf_cover_logo_position: t.pdf_cover_logo_position ?? t.cover_logo_position ?? "top_left",
    gallery_lavori: t.gallery_lavori ?? [],
  };
}

/** Shape dei testi restituiti dall'edge function ai-genera-template-bagni. */
interface GeneratedTemplateTexts {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  chi_siamo?: string | null;
  esigenze?: BgnListItem[];
  soluzione?: BgnListItem[];
  usp?: BgnListItem[];
  garanzie?: BgnListItem[];
  percorso?: BgnListItem[];
  cronoprogramma?: BgnCronoFase[];
  faq?: BgnFaqItem[];
  payment_terms_text?: string | null;
  validity_text?: string | null;
  footer_text?: string | null;
}

interface Props {
  /** Render dentro la tab Impostazioni (no padding/header extra di pagina). */
  embedded?: boolean;
  localModule?: { id: FullBgnModuleId; template: BgnTemplatePdf; saved: boolean; save: (template: BgnTemplatePdf) => void; onDirtyChange: (dirty: boolean) => void };
}

export function BagniTemplateEditor({ embedded = false, localModule }: Props) {
  const companyId = useEffectiveCompanyId();
  // Profilo azienda (impostazioni/profilo): usato per mostrare i dati EREDITATI
  // come placeholder nell'anagrafica. Se un campo del template è vuoto, nel PDF
  // viene usato questo valore del profilo (auto-import via fallback nel renderer).
  const { data: companyAnagrafica } = useQuery({
    queryKey: ["bgn-template-company-anagrafica", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number")
        .eq("id", companyId!)
        .maybeSingle();
      if (!data) return null;
      const indirizzo = [
        data.legal_address,
        [data.legal_postal_code, data.legal_city].filter(Boolean).join(" "),
        data.legal_province,
      ].filter(Boolean).join(", ");
      return {
        ragione_sociale: (data.business_name || data.name || "").trim() || null,
        indirizzo_completo: indirizzo || null,
        telefono: (data.phone || "").trim() || null,
        email: (data.email || "").trim() || null,
        partita_iva: (data.vat_number || "").trim() || null,
      };
    },
  });
  const { data: template, isLoading } = useBgnTemplatePdf();
  const upsert = useUpsertBgnTemplatePdf();
  // Probe: il modulo è pubblicato sul DB? Se no, l'editor mostra comunque i default
  // (vedi getBgnTemplatePdf) + un banner, e il salvataggio segnala che serve pubblicare.
  const { data: backendReady } = useBgnBackendReady();
  const { previewPDF, isGenerating: isPreviewing } = useBagniPDF();

  const [form, setForm] = useState<FormState | null>(() => localModule ? templateToForm(localModule.template) : null);
  const [dirty, setDirty] = useState(false);
  const [localSaved, setLocalSaved] = useState(localModule?.saved ?? true);
  const [moduleDefaults] = useState(() => localModule ? createFullBgnTemplate(localModule.template, localModule.id) : null);
  const onDirtyChange = localModule?.onDirtyChange;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  // Chiudere/ricaricare la scheda con modifiche non salvate ora chiede conferma
  // (il salvataggio qui è solo manuale: prima si perdeva tutto in silenzio).
  useBeforeUnload(dirty);
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  // Template "vivo" per l'anteprima in dialog: ricalcolato solo quando il form cambia.
  const previewTemplate = useMemo<BgnTemplatePdf | null>(
    () => (form ? ({ id: "preview", company_id: companyId ?? "", ...form } as BgnTemplatePdf) : null),
    [form, companyId],
  );
  // Idratazione una-tantum: appena arriva il template lo riversiamo nel form,
  // ma NON sovrascriviamo se l'utente ha già iniziato a editare (dirty).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (localModule || !template) return;
    if (hydratedRef.current) return;
    setForm(templateToForm(template));
    hydratedRef.current = true;
  }, [template, localModule]);

  const setPageVisibility = (chapter: string, visible: boolean) => {
    setForm(previous => previous ? withEdilePageVisibility(previous, chapter, visible) : previous);
    setDirty(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (localModule && key === "pdf_cover_image_url") next.cover_image_url = value as string | null;
      if (localModule && key === "cover_title") next.pdf_cover_hero = value as string | null;
      if (localModule && key === "cover_subtitle") next.pdf_cover_subhero = value as string | null;
      if (localModule && key === "pdf_cover_hero") next.cover_title = value as string | null;
      if (localModule && key === "pdf_cover_subhero") next.cover_subtitle = value as string | null;
      return next;
    });
    setDirty(true);
  };

  // ─── Cover "1-click": applica preset di LAYOUT (batch pdf_cover_*) ─────────
  // Setta in un colpo tutti i campi del preset. L'immagine di sfondo dei preset
  // 'photo' viene applicata (stock fallback) solo se l'utente non ne ha già una.
  const applyCoverPreset = useCallback((presetId: string) => {
    const preset = COVER_LAYOUT_PRESETS.find(item => item.id === presetId);
    if (!preset) return;
    setForm(prev => prev ? { ...prev, ...coverStyleOnly(preset.patch) } : prev);
    setDirty(true);
  }, []);
  // Detection live del preset attivo (evidenzia la card selezionata).
  const activeCoverPresetId = useMemo(
    () => (form ? detectActiveCoverPreset(form) : null),
    [form],
  );

  // ─── Stock images dialog (galleria immagini curate EiC) ───────────────────
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockCategory, setStockCategory] = useState<CoverStockImage["categoria"] | "all">("all");
  const stockFiltered = useMemo(
    () => (stockCategory === "all"
      ? COVER_STOCK_IMAGES
      : COVER_STOCK_IMAGES.filter((img) => img.categoria === stockCategory)),
    [stockCategory],
  );

  const handleSave = async () => {
    if (!form) return;
    const patch: BgnTemplatePatch = { ...form };
    try {
      if (localModule) {
        if (localModule.template.company_id !== companyId) throw new Error("L'azienda è cambiata. Riapri il modulo prima di salvare.");
        localModule.save({ ...localModule.template, ...form });
        setLocalSaved(true);
      } else await upsert.mutateAsync(patch);
      setDirty(false);
      toast.success(localModule ? "Modello salvato" : "Template salvato", {
        description: localModule ? "Salvato per l'azienda: lo usano i nuovi preventivi con questo intervento." : "Verrà applicato ai nuovi preventivi bagni.",
      });
    } catch (e) {
      toast.error("Salvataggio non riuscito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  // ─── AI: genera la bozza dei testi del template in un click ────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { profile: salesProfile, save: saveSalesProfile } = useCompanySalesProfile();
  const [intake, setIntake] = useState<CompanySalesProfile>(EMPTY_SALES_PROFILE);
  useEffect(() => { if (!aiOpen) setIntake(salesProfile); }, [salesProfile, aiOpen]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<GeneratedTemplateTexts | null>(null);

  /** Riversa i testi generati nel form (solo i campi valorizzati: non-distruttivo). */
  const applyGenerated = (g: GeneratedTemplateTexts) => {
    // Cover: scriviamo sia i campi legacy (retrocompat) sia i pdf_cover_* (letti
    // dalla cover "1-click") così il testo generato compare subito in anteprima.
    if (g.cover_title) { set("cover_title", g.cover_title); set("pdf_cover_hero", g.cover_title); }
    if (g.cover_subtitle) { set("cover_subtitle", g.cover_subtitle); set("pdf_cover_subhero", g.cover_subtitle); }
    if (g.chi_siamo) set("chi_siamo", g.chi_siamo);
    if (g.esigenze?.length) set("esigenze", g.esigenze);
    if (g.soluzione?.length) set("soluzione", g.soluzione);
    if (g.usp?.length) set("usp", g.usp);
    if (g.garanzie?.length) set("garanzie", g.garanzie);
    if (g.percorso?.length) set("percorso", g.percorso);
    if (g.cronoprogramma?.length) set("cronoprogramma", g.cronoprogramma);
    if (g.faq?.length) set("faq", g.faq);
    if (g.payment_terms_text) set("payment_terms_text", g.payment_terms_text);
    if (g.validity_text) set("validity_text", g.validity_text);
    if (g.footer_text) set("footer_text", g.footer_text);
  };

  const handleGenerateAi = async () => {
    if (localModule || aiLoading) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setAiLoading(true);
    try {
      const descrizione = [
        intake.attivita.trim() && `Cosa fa / da quanto / zona: ${intake.attivita.trim()}`,
        intake.problema.trim() && `Problema tipico del cliente: ${intake.problema.trim()}`,
        intake.usp.trim() && `Cosa lo differenzia (USP): ${intake.usp.trim()}`,
        intake.prove.trim() && `Fatti veri (numeri, garanzie, certificazioni): ${intake.prove.trim()}`,
        intake.offerta.trim() && `Incluso e condizioni: ${intake.offerta.trim()}`,
        intake.obiezioni.trim() && `Domande frequenti del cliente: ${intake.obiezioni.trim()}`,
        intake.vietati.trim() && `Da NON dire mai: ${intake.vietati.trim()}`,
      ].filter(Boolean).join("\n");
      void saveSalesProfile(intake).catch((e) => console.warn("[AI template] profilo vendita non salvato:", e));
      const { data, error } = await supabase.functions.invoke(
        "ai-genera-template-bagni",
        {
          body: {
            company_id: companyId,
            descrizione: descrizione || undefined,
            cliente_tipo: intake.cliente_tipo,
            tono: intake.voce.trim() || undefined,
          },
        },
      );
      if (error) throw error;
      const payload = data as { success?: boolean; error?: string; generated?: GeneratedTemplateTexts };
      if (!payload?.success || !payload.generated) {
        throw new Error(payload?.error ?? "Generazione non riuscita");
      }
      setAiDraft(payload.generated);
      setAiOpen(false);
      setReviewOpen(true);
    } catch (e) {
      toast.error("Generazione non riuscita", {
        description: e instanceof Error ? e.message : "Riprova tra poco.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Anteprima dal vivo del PDF cliente: usa il template in editing + dati di
  // esempio. `previewPDF` non rilegge le tabelle bgn_* (passiamo il template) →
  // funziona anche con il modulo non ancora pubblicato sul DB.
  const handlePreview = async () => {
    if (!form || !companyId) return;
    const template: BgnTemplatePdf = { id: "preview", company_id: companyId, ...form };
    await previewPDF(buildBgnModulePreview(companyId, template, localModule?.id));
  };

  // ─── Sidebar navigation sezioni ────────────────────────────────────────
  // Layout app-like: sidebar a sinistra + content panel a destra. Una sezione
  // visibile alla volta — niente più scroll infinito. Deeplink via `?section=`.
  type BgnSection =
    | "brand"
    | "page_ordine" | "page_cover" | "page_chi_siamo" | "page_percorso" | "page_testimonianze" | "page_crono" | "page_condizioni"
    // Le pagine nuove del documento, una sezione ciascuna (vedi pagineEditor.ts).
    | "page_come_funziona" | "page_protezione" | "page_controlli" | "page_lavori" | "page_compreso" | "page_documenti" | "page_diario" | "page_domande" | "page_chiusura"
    | "garanzie" | "contenuti" | "opzioni";
  const BGN_SECTION_GROUPS: Array<{
    label: string;
    items: Array<{ id: BgnSection; label: string; emoji: string; descr?: string }>;
  }> = [
    {
      label: "AZIENDA",
      items: [
        { id: "brand", label: "Azienda e stile", emoji: "🏢", descr: "Logo e colori del PDF" },
      ],
    },
    {
      label: "PAGINE DEL PDF",
      // Una sezione per pagina, nell'ordine in cui escono nel documento: le pagine nuove
      // stanno qui come le altre, non solo in «Ordine e pagine» (vedi pagineEditor.ts).
      items: PAGINE_EDITOR_EDILI.map((p) => ({ id: p.id as BgnSection, label: p.voce, emoji: p.emoji, descr: p.descrizione })),
    },
    {
      label: "DATI & CONTENUTI",
      items: [
        { id: "contenuti", label: "Contenuti",   emoji: "📝", descr: "Esigenze, soluzione, USP" },
        { id: "opzioni",   label: "Opzioni PDF", emoji: "⚙️", descr: "Visibilità documento" },
      ],
    },
  ];
  const BGN_SECTIONS = BGN_SECTION_GROUPS.flatMap((g) => g.items);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = (searchParams.get("section") ?? "brand") as BgnSection;
  const activeSection: BgnSection = BGN_SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : ("brand" as BgnSection);
  const setActiveSection = (id: BgnSection) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("section", id);
      return next;
    }, { replace: true });
  };

  if ((!localModule && isLoading) || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const ragioneSocialePdf = form.ragione_sociale?.trim() || companyAnagrafica?.ragione_sociale;
  const contattoPdf = form.telefono?.trim() || companyAnagrafica?.telefono || form.email?.trim() || companyAnagrafica?.email;
  const anagraficaPdfCompleta = Boolean(ragioneSocialePdf && contattoPdf);

  // Il contenuto delle pagine che raccontano l'azienda: la sezione della pagina lo
  // mostra sotto occhiello, titolo e introduzione (vedi SezionePaginaEdile).
  const contenutiPagine = {
    recensioni: (
      <TestimonianzeEditor
        items={form.testimonianze}
        onChange={(items) => set("testimonianze", items)}
      />
    ),
    domande: (
      <FaqEditor items={form.faq} onChange={(items) => set("faq", items)} />
    ),
    garanzie: (
      <ListItemsEditor
        items={form.garanzie}
        onChange={(items) => set("garanzie", items)}
        addLabel="Aggiungi garanzia"
        titlePlaceholder="Es. Garanzia 10 anni sulle opere"
        descPlaceholder="Dettaglio (opzionale)"
      />
    ),
    lavori: (
      <GalleryLavoriEditor localOnly={!!localModule}
        items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
        onChange={(items) => set("gallery_lavori", items)}
        bucket={BUCKET}
        uploadPath={`${companyId}/bagni/gallery`}
      />
    ),
  };

  return (
    <div className={cn("space-y-4", embedded ? "" : "mx-auto max-w-4xl p-4")}>
      {!localModule && backendReady === false && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Modulo Bagni non ancora pubblicato sul database</p>
            <p className="text-amber-800 dark:text-amber-300/90">
              Stai vedendo e modificando i valori predefiniti: l'editor è pienamente
              funzionante, ma il salvataggio sarà attivo solo dopo la pubblicazione del
              modulo (applicazione della migrazione sul database).
            </p>
          </div>
        </div>
      )}

      {/* ── CTA: genera la bozza dei testi con l'AI ───────────────── */}
      <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 dark:border-orange-900/40 dark:from-orange-950/30 dark:to-amber-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{localModule ? "Testi pronti per questo intervento" : "Scrivi il template con l'AI"}</p>
              <p className="text-[12px] text-muted-foreground">
                {localModule ? "Personalizza le pagine e verifica il PDF a destra. Ogni variante modifica solo la sezione scelta." : "Genera una bozza dei testi, poi rifinisci e salva."}
              </p>
            </div>
          </div>
          {!localModule && <Button
            type="button"
            onClick={() => setAiOpen(true)}
            className="shrink-0 gap-1.5 bg-orange-500 hover:bg-orange-600"
          >
            <Sparkles className="h-4 w-4" />
            Genera testi con AI
          </Button>}
          {localModule && moduleDefaults ? <InterventionTextPicker title={moduleDefaults.cover_title || "Bagni"} choices={bgnCopyChoices(localModule.id, moduleDefaults)} onApply={patch => {
            setForm(prev => prev ? { ...prev, ...patch, ...(typeof patch.cover_title === "string" ? { pdf_cover_hero: patch.cover_title } : {}), ...(typeof patch.cover_subtitle === "string" ? { pdf_cover_subhero: patch.cover_subtitle } : {}) } : prev); setDirty(true);
          }} /> : <StandardTextTemplatePicker
            module="bagni"
            onApply={(draft) => applyGenerated(draft as GeneratedTemplateTexts)}
            snapshot={form as unknown as Record<string, unknown>}
            className="shrink-0"
          />}
        </div>
      </div>

      <TemplateEditorWorkspace moduleId={localModule?.id}>
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <TemplateEditorNavigation>
          <nav className={templateEditorLayout.navigationPanel}>
            <TemplateSectionNavigation groups={BGN_SECTION_GROUPS} activeSection={activeSection} onSelect={setActiveSection} isExcluded={id => edileSectionExcluded(form, id)} />
            {/* Footer sidebar: anteprima live + apri in scheda */}
            <div className="mt-3 space-y-1.5 border-t pt-2">
              <Button
                type="button"
                onClick={() => setLivePreviewOpen(true)}
                size="sm"
                className="h-8 w-full gap-1.5 bg-orange-500 hover:bg-orange-600"
              >
                <Eye className="h-3.5 w-3.5" />
                Anteprima live
              </Button>
              <Button
                type="button"
                onClick={() => void handlePreview()}
                disabled={isPreviewing}
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50"
              >
                {isPreviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
                Apri in scheda
              </Button>
            </div>
          </nav>
        </TemplateEditorNavigation>

        {/* ── CONTENT PANEL ────────────────────────────────────────── */}
        <div data-template-content className={templateEditorLayout.content}>
          {/* Branding */}
          {activeSection === "brand" && (
            <>
            <SectionCard icon={Palette} title="Branding" description="Logo e colori usati nel PDF.">
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageUploadField localOnly={!!localModule}
                  label="Logo azienda"
                  hint="PNG con sfondo trasparente consigliato."
                  value={form.logo_url}
                  companyId={companyId}
                  onChange={(url) => set("logo_url", url)}
                  aspect="aspect-[3/1]"
                />
                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Primario" value={form.color_primary} onChange={(v) => set("color_primary", v)} />
                  <ColorField label="Secondario" value={form.color_secondary} onChange={(v) => set("color_secondary", v)} />
                  <ColorField label="Accent" value={form.color_accent} onChange={(v) => set("color_accent", v)} />
                  <ColorField label="Testo" value={form.color_text} onChange={(v) => set("color_text", v)} />
                </div>
              </div>

              {/* Stili rapidi: palette pronte che impostano i 4 colori in un click */}
              <div className="mt-4 border-t pt-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  <Label className="text-xs font-medium">Palette pronte</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PALETTE_PRESETS.map((p) => {
                    const isActive =
                      form.color_primary === p.color_primary &&
                      form.color_secondary === p.color_secondary &&
                      form.color_accent === p.color_accent &&
                      form.color_text === p.color_text;
                    return (
                      <button
                        key={p.nome}
                        type="button"
                        onClick={() => {
                          set("color_primary", p.color_primary);
                          set("color_secondary", p.color_secondary);
                          set("color_accent", p.color_accent);
                          set("color_text", p.color_text);
                        }}
                        aria-pressed={isActive}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:border-orange-300 hover:bg-orange-50",
                          isActive
                            ? "border-orange-400 bg-orange-50 ring-2 ring-orange-300"
                            : "border-input bg-background",
                        )}
                      >
                        <span className="flex shrink-0 items-center gap-0.5">
                          {[p.color_primary, p.color_secondary, p.color_accent, p.color_text].map((c, ci) => (
                            <span
                              key={ci}
                              className="h-3.5 w-3.5 rounded-full border border-black/10"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </span>
                        <span className="text-[11px] font-medium text-foreground">{p.nome}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Applica una combinazione coordinata ai 4 colori del brand. Puoi sempre ritoccarli dopo.
                </p>
              </div>
            </SectionCard>

            {/* Anagrafica azienda — dati che compaiono in header/footer del PDF */}
            <SectionCard icon={Building2} title="Anagrafica azienda" description="Dati che compaiono nell'header e nel footer di ogni preventivo PDF.">
              {/* I dati arrivano dal Profilo azienda: se lasci un campo vuoto, nel
                  PDF usiamo il valore del profilo (mostrato come placeholder). */}
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[11px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Questi dati arrivano dal{" "}
                  <Link to="/azienda/impostazioni/profilo" className="font-medium underline">
                    Profilo azienda
                  </Link>
                  . Lascia un campo vuoto per usarli in automatico; compila solo per
                  sovrascriverli nei preventivi bagni.
                </span>
              </div>
              {!anagraficaPdfCompleta && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>PDF non ancora pronto per l&apos;invio.</strong> Verifica che
                    ragione sociale e almeno telefono o email siano presenti qui o nel Profilo azienda.
                  </span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Ragione sociale</Label>
                  <Input
                    value={form.ragione_sociale ?? ""}
                    onChange={(e) => set("ragione_sociale", e.target.value)}
                    placeholder={companyAnagrafica?.ragione_sociale ? `${companyAnagrafica.ragione_sociale} · dal profilo` : "Es. Edil Rossi S.r.l."}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Indirizzo completo</Label>
                  <Input
                    value={form.indirizzo_completo ?? ""}
                    onChange={(e) => set("indirizzo_completo", e.target.value)}
                    placeholder={companyAnagrafica?.indirizzo_completo ? `${companyAnagrafica.indirizzo_completo} · dal profilo` : "Es. Via Roma 42 · 20121 Milano (MI)"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefono</Label>
                  <Input
                    value={form.telefono ?? ""}
                    onChange={(e) => set("telefono", e.target.value)}
                    placeholder={companyAnagrafica?.telefono ? `${companyAnagrafica.telefono} · dal profilo` : "+39 02 1234 5678"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder={companyAnagrafica?.email ? `${companyAnagrafica.email} · dal profilo` : "info@azienda.it"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">P.IVA</Label>
                  <Input
                    value={form.partita_iva ?? ""}
                    onChange={(e) => set("partita_iva", e.target.value)}
                    placeholder={companyAnagrafica?.partita_iva ? `${companyAnagrafica.partita_iva} · dal profilo` : "IT12345670156"}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Tipografia del documento</Label>
                  <select
                    value={tipografiaDaModello(form.font_family)}
                    onChange={(e) => set("font_family", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="lineare">Lineare · titoli e testo senza grazie</option>
                    <option value="editoriale">Editoriale · titoli con le grazie, testo lineare</option>
                    <option value="classica">Classica · tutto con le grazie</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Cambia davvero il PDF: sono i caratteri che il documento ha già dentro, quindi non c'è niente da
                    scaricare e nessun carattere può mancare alla stampa.
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Footer PDF — toggle informazioni in coda a ogni pagina */}
            <SectionCard icon={FileText} title="Footer PDF" description="Cosa mostrare nel piè di pagina di ogni foglio del preventivo.">
              <div className="space-y-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Mostra info versione nel footer</p>
                    <p className="text-[11px] text-muted-foreground">
                      Aggiunge codice preventivo, data e numero di pagina su ogni foglio.
                    </p>
                  </div>
                  <Switch checked={form.show_footer_version} onCheckedChange={(v) => set("show_footer_version", v)} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Mostra footer legale esteso (B2B)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Aggiunge i dati legali dell'azienda (ragione sociale, indirizzo, P.IVA) in coda.
                    </p>
                  </div>
                  <Switch checked={form.show_footer_legal} onCheckedChange={(v) => set("show_footer_legal", v)} />
                </label>
              </div>
            </SectionCard>
            </>
          )}

          {/* Copertina — parity Serramenti: preset 1-click + anteprima live A4 */}
          {/* Ordine dei capitoli e pagine libere: stesso blocco degli otto moduli. */}
          {activeSection === "page_ordine" && (
            <SectionCard icon={ListOrdered} title="Ordine e pagine" description="In che ordine escono i capitoli, quali nascondere, e le pagine scritte da voi.">
              <OrdineCapitoli visibilitySettings={form} onVisibilityChange={setPageVisibility}
                ordine={form.pdf_ordine_capitoli}
                pagine={form.pdf_pagine_libere}
                onOrdine={(v) => set("pdf_ordine_capitoli", v)}
                onPagine={(v) => set("pdf_pagine_libere", v)}
                settore="bagni"
                blocchi={form.pdf_blocchi}
                onBlocchi={(v) => set("pdf_blocchi", v)}
                apriSezione={(sezione) => setActiveSection(sezione as BgnSection)}
                campoFoto={(valore, onChange) => (
                  <ImageUploadField localOnly={!!localModule} label="Foto della pagina" value={valore} companyId={companyId} onChange={onChange} aspect="aspect-[16/9]" />
                )}
              />
            </SectionCard>
          )}

          {activeSection === "page_cover" && (
            <SectionCard icon={FileText} title="Copertina" description="Layout completo della prima pagina: preset, immagine, testo, decorazione.">
              <TemplateCoverStylePicker presets={COVER_LAYOUT_PRESETS} activeId={activeCoverPresetId} onApply={applyCoverPreset} />
              <TemplateCoverTextFields value={{ eyebrow: form.pdf_cover_eyebrow, title: form.pdf_cover_hero, subtitle: form.pdf_cover_subhero }} onChange={(field, value) => { if (field === "eyebrow") { set("pdf_cover_eyebrow", (value ?? "") || null); }
if (field === "title") { set("pdf_cover_hero", (value ?? "") || null); }
if (field === "subtitle") { set("pdf_cover_subhero", (value ?? "") || null); } }}   placeholders={(value, onChange) => <PlaceholderChips value={value} onChange={onChange}  />} />
              <div data-cover-media className="space-y-4">
<ImageUploadField localOnly={!!localModule}
                    label="Logo copertina — opzionale (default: logo principale)"
                    hint="Versione chiara/bianca del logo per la copertina con sfondo scuro. Se vuoto, usa il logo principale."
                    value={form.cover_logo_url}
                    companyId={companyId}
                    onChange={(url) => set("cover_logo_url", url)}
                    aspect="aspect-[3/1]"
                  />
<ImageUploadField localOnly={!!localModule}
                      label="Immagine di sfondo cover (opzionale)"
                      hint="Carica una foto (PNG/JPG max 8 MB) o scegli dalla galleria stock."
                      value={form.pdf_cover_image_url}
                      companyId={companyId}
                      onChange={(url) => set("pdf_cover_image_url", url)}
                      aspect="aspect-[16/9]"
                    />
<Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button>
</div>
              <TemplateCoverDesignControls hasImage={!!form.pdf_cover_image_url} fields={[
{ id: "overlayOpacity", kind: "range", value: form.pdf_cover_overlay_opacity ?? 55, min: 0, max: 100, step: 5, unit: "%", onChange: value => set("pdf_cover_overlay_opacity", value) },
{ id: "eyebrowSize", kind: "range", value: form.pdf_cover_eyebrow_size ?? 10, min: 8, max: 14, step: 1, unit: "pt", onChange: value => set("pdf_cover_eyebrow_size", value) },
{ id: "titleSize", kind: "range", value: form.pdf_cover_title_size ?? 30, min: 20, max: 64, step: 1, unit: "pt", onChange: value => set("pdf_cover_title_size", value) },
{ id: "subtitleSize", kind: "range", value: form.pdf_cover_subtitle_size ?? 13, min: 10, max: 18, step: 1, unit: "pt", onChange: value => set("pdf_cover_subtitle_size", value) },
{ id: "logoSize", kind: "range", value: form.pdf_cover_logo_size ?? 100, min: 60, max: 160, step: 5, unit: "%", onChange: value => set("pdf_cover_logo_size", value) },
{ id: "textAlign", kind: "choice", value: form.pdf_cover_text_align ?? "left", choices: COVER_DESIGN_CHOICES.textAlign, onChange: value => set("pdf_cover_text_align", value as typeof form.pdf_cover_text_align) },
{ id: "textVertical", kind: "choice", value: form.pdf_cover_text_vertical ?? "bottom", choices: COVER_DESIGN_CHOICES.textVertical, onChange: value => set("pdf_cover_text_vertical", value as typeof form.pdf_cover_text_vertical) },
{ id: "logoPosition", kind: "choice", value: form.pdf_cover_logo_position ?? "top_left", choices: COVER_DESIGN_CHOICES.logoPosition, onChange: value => set("pdf_cover_logo_position", value as typeof form.pdf_cover_logo_position) },
{ id: "overlayStyle", kind: "choice", value: form.pdf_cover_overlay_style ?? "flat", choices: COVER_DESIGN_CHOICES.overlayStyle, onChange: value => set("pdf_cover_overlay_style", value as typeof form.pdf_cover_overlay_style) },
{ id: "decorationStyle", kind: "choice", value: form.pdf_cover_decoration_style ?? "square", choices: COVER_DESIGN_CHOICES.decorationStyle, onChange: value => set("pdf_cover_decoration_style", value as typeof form.pdf_cover_decoration_style) },
{ id: "textColor", kind: "color", value: form.pdf_cover_text_color, fallback: "#FFFFFF", onChange: value => set("pdf_cover_text_color", value) },
{ id: "backgroundColor", kind: "color", value: form.pdf_cover_bg_color, fallback: "#0F1B2A", onChange: value => set("pdf_cover_bg_color", value) },
{ id: "showDecoration", kind: "toggle", value: !!(form.pdf_cover_show_decoration === true), onChange: value => set("pdf_cover_show_decoration", value) },
{ id: "showClientCard", kind: "toggle", value: !!(form.pdf_cover_show_client_card !== false), onChange: value => set("pdf_cover_show_client_card", value) }
]} />
            </SectionCard>
          )}

          {/* Chi siamo */}
          {activeSection === "page_chi_siamo" && (
            <SectionCard
              icon={Building2}
              title="Chi siamo"
              description="Presentazione dell'impresa nel PDF."
              toggle={{ value: !edileSectionExcluded(form, "page_chi_siamo"), onChange: (v) => setPageVisibility("chiSiamo", v), label: "Mostra nel PDF" }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Testo presentazione</Label>
                  <RichTextEditorSafe
                    value={form.chi_siamo ?? ""}
                    onChange={(html) => set("chi_siamo", html)}
                    placeholder="Da oltre 20 anni realizziamo ristrutturazioni complete..."
                    minHeight={160}
                  />
                </div>
                <ImageUploadField localOnly={!!localModule}
                  label="Foto azienda / team"
                  value={form.chi_siamo_foto_url}
                  companyId={companyId}
                  onChange={(url) => set("chi_siamo_foto_url", url)}
                  aspect="aspect-[4/3]"
                />
              </div>
            </SectionCard>
          )}

          {/* Come lavoriamo (percorso) */}
          {activeSection === "page_percorso" && (
            <SectionCard
              icon={Route}
              title="Come lavoriamo"
              description="Le fasi del cantiere mostrate nel PDF."
              toggle={{ value: !edileSectionExcluded(form, "page_percorso"), onChange: (v) => setPageVisibility("percorso", v), label: "Mostra nel PDF" }}
            >
              <ListItemsEditor
                items={form.percorso}
                onChange={(items) => set("percorso", items)}
                addLabel="Aggiungi fase"
                titlePlaceholder="Es. Sopralluogo e rilievo"
                descPlaceholder="Cosa succede in questa fase (opzionale)"
              />
            </SectionCard>
          )}

          {/* Cronoprogramma */}
          {activeSection === "page_crono" && (
            <SectionCard
              icon={Clock}
              title="Cronoprogramma"
              description="Le fasi tipiche del cantiere con durata indicativa."
              toggle={{ value: !edileSectionExcluded(form, "page_crono"), onChange: (v) => setPageVisibility("tempi", v), label: "Mostra nel PDF" }}
            >
              <CronoEditor
                items={form.cronoprogramma}
                onChange={(items) => set("cronoprogramma", items)}
              />
            </SectionCard>
          )}

          {/* Condizioni */}
          {activeSection === "page_condizioni" && (
            <SectionCard icon={FileText} title="Condizioni e validità" description="Testi legali e di pagamento in coda al PDF.">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Modalità di pagamento</Label>
                  <RichTextEditorSafe
                    value={form.payment_terms_text ?? ""}
                    onChange={(html) => set("payment_terms_text", html)}
                    placeholder="30% all'accettazione, 40% a metà lavori, 30% a fine lavori..."
                    minHeight={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Validità dell'offerta</Label>
                  <Input
                    value={form.validity_text ?? ""}
                    onChange={(e) => set("validity_text", e.target.value)}
                    placeholder="Preventivo valido 30 giorni dalla data di emissione."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nota a piè di pagina</Label>
                  <Input
                    value={form.footer_text ?? ""}
                    onChange={(e) => set("footer_text", e.target.value)}
                    placeholder="Testo aggiuntivo nel footer (opzionale)"
                  />
                </div>

                {/* Condizioni generali di contratto: il preventivo firmato è il contratto.
                    Stesso blocco di tutti i moduli (CondizioniContratto). */}
                <CondizioniContratto localOnly={!!localModule}
                  companyId={companyId}
                  settore="bagni"
                  attivo={form.condizioni_legali_attivo !== false}
                  testo={form.condizioni_legali_testo ?? ""}
                  onAttivo={(v) => set("condizioni_legali_attivo", v)}
                  onTesto={(v) => set("condizioni_legali_testo", v)}
                  recesso={form.modulo_recesso_attivo === true}
                  onRecesso={(v) => set("modulo_recesso_attivo", v)}
                />
              </div>
            </SectionCard>
          )}

          {/* Contenuti: Esigenze / Soluzione / USP */}
          {activeSection === "contenuti" && (
            <>
              <SectionCard icon={ListChecks} title="Esigenze tipiche" description="I problemi del cliente che il vostro intervento risolve.">
                <ListItemsEditor
                  items={form.esigenze}
                  onChange={(items) => set("esigenze", items)}
                  addLabel="Aggiungi esigenza"
                  titlePlaceholder="Es. Impianti vecchi e non a norma"
                  descPlaceholder="Dettaglio (opzionale)"
                />
              </SectionCard>

              <SectionCard icon={Sparkles} title="La nostra soluzione" description="Come affrontate il lavoro.">
                <ListItemsEditor
                  items={form.soluzione}
                  onChange={(items) => set("soluzione", items)}
                  addLabel="Aggiungi voce soluzione"
                  titlePlaceholder="Es. Rifacimento impianti certificato"
                  descPlaceholder="Dettaglio (opzionale)"
                />
              </SectionCard>

              <SectionCard icon={ListChecks} title="Perché sceglierci (USP)" description="I punti di forza dell'impresa.">
                <ListItemsEditor
                  items={form.usp}
                  onChange={(items) => set("usp", items)}
                  addLabel="Aggiungi punto di forza"
                  titlePlaceholder="Es. Cantiere pulito e puntuale"
                  descPlaceholder="Dettaglio (opzionale)"
                />
              </SectionCard>
            </>
          )}

          {/* Opzioni PDF */}
          {activeSection === "opzioni" && (
            <>
              <SectionCard icon={BadgeEuro} title="Opzioni PDF" description="Impostazioni di visibilità del documento.">
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Mostra i margini nel PDF</p>
                    <p className="text-[11px] text-muted-foreground">
                      Visibile solo a te: stampa la marginalità per voce e capitolo. Tienilo
                      SPENTO per i PDF da consegnare al cliente.
                    </p>
                  </div>
                  <Switch checked={form.show_margine} onCheckedChange={(v) => set("show_margine", v)} />
                </label>

              {/* Promo finanziamento nel PDF: legge il jsonb dal template raw e scrive
                  via set con cast (campo fuori dal FormState tipato di questo editor). */}
              <FinanziamentoPromoField
                rawValue={(template as unknown as Record<string, unknown> | null)?.finanziamento_promo}
                onChange={(v) => (set as unknown as (k: string, val: unknown) => void)("finanziamento_promo", v)}
              />
              </SectionCard>
              <SectionCard icon={Percent} title="Default economici" description="Valori precompilati sui nuovi preventivi bagni.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">IVA predefinita (%)</Label>
                    <Input type="number" min={0} max={99} value={form.default_iva_pct ?? 10} onChange={(e) => set("default_iva_pct", Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Detrazione fiscale (%)</Label>
                    <Input type="number" min={0} max={100} value={form.default_detrazione_pct ?? 50} onChange={(e) => set("default_detrazione_pct", Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Validità offerta (giorni)</Label>
                    <Input type="number" min={1} step={1} value={form.default_validita_giorni ?? 30} onChange={(e) => set("default_validita_giorni", Math.trunc(Number(e.target.value)))} />
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {/* Le pagine del documento che non avevano una sezione (i blocchi, «Dicono di
              noi», le garanzie, le domande…), e la foto di quelle che l'avevano già. */}
          <SezionePaginaEdile
            sezione={activeSection}
            settore="bagni"
            blocchi={form.pdf_blocchi}
            onBlocchi={(v) => set("pdf_blocchi", v)}
            ordine={form.pdf_ordine_capitoli}
            pagine={form.pdf_pagine_libere}
            onOrdine={(v) => set("pdf_ordine_capitoli", v)}
            mostraGaranzie={form.show_garanzie !== false}
            onMostraGaranzie={(v) => set("show_garanzie", v)}
            contenuti={contenutiPagine}
            campoFoto={(valore, onChange) => (
              <ImageUploadField localOnly={!!localModule} label="Foto della pagina" value={valore} companyId={companyId} onChange={onChange} aspect="aspect-[16/9]" />
            )}
          />

          {/* Barra salvataggio sticky */}
          <TemplateEditorSaveBar>
            <span className={cn("text-[11px]", dirty ? "text-amber-600" : "text-muted-foreground")}>
              {dirty ? "Modifiche non salvate" : localSaved ? "Tutto salvato" : "Modello pronto · non ancora salvato"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePreview()}
                disabled={isPreviewing}
                className="gap-1.5"
              >
                {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                Anteprima PDF
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={(!dirty && localSaved) || upsert.isPending}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600"
              >
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {localModule ? "Salva modello" : "Salva template"}
              </Button>
            </div>
          </TemplateEditorSaveBar>
        </div>

        <aside data-template-preview className={templateEditorLayout.preview}>
          <div className={templateEditorLayout.previewPanel}>
            <BagniLivePreviewPanel activeSection={activeSection} template={previewTemplate} companyId={companyId} moduleId={localModule?.id} />
          </div>
        </aside>
      </TemplateEditorWorkspace>
      <BagniTemplatePreviewDialog
        moduleId={localModule?.id}
        open={livePreviewOpen}
        onOpenChange={setLivePreviewOpen}
        template={previewTemplate}
        companyId={companyId}
        onOpenInTab={() => void handlePreview()}
      />

      {/* ── Dialog: genera testi con AI ──────────────────────────────── */}
      <AiTemplateReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        draft={aiDraft}
        onApply={(d) => {
          applyGenerated(d);
          setReviewOpen(false);
          toast.success("Testi applicati al template", { description: "Rivedi le singole sezioni e salva." });
        }}
      />

      <Dialog open={aiOpen} onOpenChange={(o) => !aiLoading && setAiOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Genera testi con AI
            </DialogTitle>
            <DialogDescription>
              Rispondi a poche domande sulla tua impresa: l&apos;AI scrive la bozza dei testi.
              Le risposte si salvano nel profilo vendita e si riusano in ogni modulo.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <AiSalesProfileForm value={intake} onChange={setIntake} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAiOpen(false)} disabled={aiLoading}>
              Annulla
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateAi()}
              disabled={aiLoading}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generazione…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Genera bozza
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: galleria immagini curate EiC per la cover ── */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-3 border-b">
            <DialogTitle className="text-base">📷 Galleria immagini stock</DialogTitle>
            <DialogDescription className="text-xs">
              {localModule ? "Immagini illustrative dedicate al modulo. Non documentano lavori aziendali e non sostituiscono il progetto del tuo bagno." : "Scegli una foto per la copertina dalla libreria locale del modulo."}
            </DialogDescription>
            <div className="flex flex-wrap gap-1 pt-2">
              {COVER_STOCK_CATEGORIE.filter(cat => !localModule || cat.value === "all").map((cat) => {
                const isActive = stockCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setStockCategory(cat.value)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-md border transition-all gap-1 inline-flex items-center",
                      isActive ? "bg-orange-500 text-white border-orange-500 font-semibold" : "bg-white border-slate-200 hover:border-orange-300 text-slate-700",
                    )}
                  >
                    <span>{cat.emoji}</span>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(localModule && moduleDefaults ? fotoDellaLibreria("bagni", moduleDefaults.pdf_blocchi).map((f, i) => ({ id: `modulo-${i}`, url: f.url, thumb: f.url, label: f.nome })) : stockFiltered).map((img) => {
                const isActive = form?.pdf_cover_image_url === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => { set("pdf_cover_image_url", img.url); setStockDialogOpen(false); }}
                    className={cn(
                      "group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-400",
                      isActive ? "border-orange-500 shadow-md ring-2 ring-orange-300" : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                    )}
                    title={img.label}
                  >
                    <img src={img.thumb} alt={img.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <span className="text-[10px] font-semibold text-white">{img.label}</span>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
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
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────




// ─── Color field ──────────────────────────────────────────────────────────────
function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const safe = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-background p-0.5"
          aria-label={`Colore ${label}`}
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1E3A5F"
          className="h-9 font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}

// ─── Image upload field ───────────────────────────────────────────────────────
interface ImageUploadFieldProps {
  localOnly?: boolean;
  label: string;
  hint?: string;
  value: string | null;
  companyId: string | null;
  onChange: (url: string | null) => void;
  aspect?: string;
}

function ImageUploadField({ label, hint, value, companyId, onChange, aspect = "aspect-[4/3]", localOnly = false }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      toast.error(`"${file.name}" non supportato`, { description: "Usa PNG, JPG o WEBP." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`"${file.name}" troppo grande`, { description: "Massimo 8 MB." });
      return;
    }
    setUploading(true);
    try {
      if (localOnly) { onChange(await readLocalTemplateImage(file)); toast.success("Immagine aggiunta"); return; }
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
      // folder[1] DEVE essere company_id (policy storage company-scoped).
      const path = `${companyId}/bagni/template/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error("Upload fallito", { description: upErr.message });
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success("Immagine caricata");
    } catch (error) {
      toast.error("Immagine non caricata", { description: error instanceof Error ? error.message : "Riprova con un'altra immagine." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return <TemplateImageFieldView label={label} hint={hint} value={value} busy={uploading} disabled={!companyId} localOnly={localOnly} inputRef={inputRef} onFile={handleFile} onRemove={() => onChange(null)} aspect={aspect} />;
}

// ─── List items editor ({titolo, descrizione}) ───────────────────────────────




// ─── Testimonianze editor ─────────────────────────────────────────────────────


// ─── FAQ editor ({domanda, risposta}) ─────────────────────────────────────────


// ─── Cronoprogramma editor ────────────────────────────────────────────────────


export default BagniTemplateEditor;
