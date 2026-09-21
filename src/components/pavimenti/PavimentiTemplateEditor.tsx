/**
 * PavimentiTemplateEditor — editor del template PDF del verticale
 * Pavimenti (Task 20).
 *
 * Modellato su `SerramentiTemplateEditor` ma alla scala di `pav_template_pdf`
 * (un record/azienda, upsert via `useUpsertPavTemplatePdf`). Configura:
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
 * path `{company_id}/pavimenti/template/{uuid}.{ext}` → URL pubblico
 * stabile salvato nel template (ideale per il PDF, niente signed URL scaduti).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CopertinaAnteprima } from "@/components/preventivi/CopertinaAnteprima";
import { CondizioniContratto } from "@/components/preventivi/CondizioniContratto";
import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";
import { tipografiaDaModello } from "@/components/preventivi/pdf/temaDocumento";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Save, Loader2, Upload, Image as ImageIcon, Plus, Trash2, GripVertical,
  Palette, FileText, Sparkles, ListChecks, Quote, Clock, Building2,
  Eye, EyeOff, BadgeEuro, AlertTriangle, FileSearch, Route, ShieldCheck, Percent,
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
import { cn } from "@/lib/utils";
import { RichTextEditorSafe } from "@/components/ui/rich-text-editor-safe";
import { usePavimentiPDF } from "@/hooks/usePavimentiPDF";
import { PavimentiTemplatePreviewDialog } from "@/components/pavimenti/PavimentiTemplatePreviewDialog";
import { PavimentiLivePreviewPanel } from "@/components/pavimenti/PavimentiLivePreviewPanel";
import { AiTemplateReviewDialog } from "@/components/preventivi/AiTemplateReviewDialog";
import { AiSalesProfileForm } from "@/components/preventivi/AiSalesProfileForm";
import { useCompanySalesProfile, EMPTY_SALES_PROFILE, type CompanySalesProfile } from "@/hooks/useCompanySalesProfile";
import {
  usePavTemplatePdf,
  useUpsertPavTemplatePdf,
  usePavBackendReady,
  useEffectiveCompanyId,
  type PavTemplatePatch,
} from "@/hooks/usePavimentiProgetto";
import type {
  PavTemplatePdf, PavListItem, PavFaqItem, PavTestimonianza, PavCronoFase,
  PavProgetto, PavComputoVoce,
} from "@/types/pavimenti";
import { COVER_PRESETS, detectActiveCoverPreset, type CoverPresetPatch } from "@/components/pavimenti/coverPresets";
import {
  COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage,
} from "@/components/pavimenti/coverStockImages";
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import type { GalleryLavoroItem } from "@/types/gallery";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { FinanziamentoPromoField } from "@/components/preventivi/FinanziamentoPromoField";

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

// NB: i preset di copertina (8 layout completi) ora vivono in
// `@/components/pavimenti/coverPresets` (COVER_PRESETS) — parità Serramenti/FV.
// Il vecchio set "Stili copertina" basato sui soli campi legacy cover_* è stato
// rimosso a favore della galleria preset pdf_cover_*.

// Campi cover "parità Serramenti" (pdf_cover_*). NON sono sul tipo PavTemplatePdf
// (né nei types generati): vivono solo nel form locale e si persistono/leggono via
// `(supabase as any)` direttamente sulla tabella pav_template_pdf (le colonne sono
// aggiunte da 20271110050000_pavimenti_cover_parity.sql). Le union literal estendono
// `CoverPresetPatch` con i campi testuali (eyebrow/hero/subhero) → setForm type-safe.
type CoverFormFields = CoverPresetPatch & {
  pdf_cover_eyebrow?: string | null;
  pdf_cover_hero?: string | null;
  pdf_cover_subhero?: string | null;
  pdf_cover_subhero_template?: string | null;
  /** Scala logo cover 60–160% (colonna già in pav_template_pdf, prima mai usata). */
  pdf_cover_logo_size?: number | null;
};

// Sottoinsieme persistente del form (mappato 1:1 su PavTemplatePdf).
type BaseFormState = Required<Pick<PavTemplatePdf,
  | "pdf_ordine_capitoli" | "pdf_pagine_libere"
  | "condizioni_legali_testo" | "condizioni_legali_attivo"
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
  | "gallery_lavori"
>>;

// Forma del form locale: campi persistenti + campi cover pdf_cover_*.
type FormState = BaseFormState & CoverFormFields;

// Chiavi cover pdf_cover_* — usate per separare il payload pdf_cover_* (upsert via
// cast) dal patch tipato `PavTemplatePatch` al salvataggio, e per l'idratazione.
const PDF_COVER_KEYS = [
  "pdf_cover_bg_color", "pdf_cover_image_url", "pdf_cover_eyebrow", "pdf_cover_hero",
  "pdf_cover_subhero", "pdf_cover_subhero_template", "pdf_cover_text_color",
  "pdf_cover_text_align", "pdf_cover_overlay_opacity", "pdf_cover_eyebrow_size",
  "pdf_cover_title_size", "pdf_cover_subtitle_size", "pdf_cover_logo_size", "pdf_cover_show_client_card",
  "pdf_cover_show_decoration", "pdf_cover_decoration_style", "pdf_cover_text_vertical",
  "pdf_cover_overlay_style", "pdf_cover_logo_position",
] as const satisfies ReadonlyArray<keyof CoverFormFields>;

function templateToForm(t: PavTemplatePdf): FormState {
  return {
    pdf_ordine_capitoli: t.pdf_ordine_capitoli ?? null,
    pdf_pagine_libere: t.pdf_pagine_libere ?? [],
    condizioni_legali_testo: t.condizioni_legali_testo ?? "",
    condizioni_legali_attivo: t.condizioni_legali_attivo ?? true,
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
    gallery_lavori: t.gallery_lavori ?? null,
    // Campi cover pdf_cover_* — default sensati (Serramenti-like). I valori reali
    // dal DB vengono idratati a parte (vedi effetto hydrateCover): usePavTemplatePdf
    // li scarta perché non sono nel tipo normalizzato. Si parte dai legacy cover_*
    // dove sensato per non perdere configurazioni già esistenti.
    pdf_cover_bg_color: null,
    pdf_cover_image_url: t.cover_image_url ?? null,
    pdf_cover_eyebrow: null,
    pdf_cover_hero: t.cover_title ?? null,
    pdf_cover_subhero: t.cover_subtitle ?? null,
    pdf_cover_subhero_template: null,
    pdf_cover_text_color: t.cover_text_color ?? "#FFFFFF",
    pdf_cover_text_align: t.cover_text_align === "center" ? "center" : "left",
    pdf_cover_overlay_opacity: typeof t.cover_overlay_opacity === "number"
      ? Math.round(t.cover_overlay_opacity * 100)
      : 62,
    pdf_cover_eyebrow_size: 11,
    pdf_cover_title_size: t.cover_title_size ?? 40,
    pdf_cover_subtitle_size: 13,
    pdf_cover_logo_size: null,
    pdf_cover_show_client_card: true,
    pdf_cover_show_decoration: true,
    pdf_cover_decoration_style: "square",
    pdf_cover_text_vertical: "bottom",
    pdf_cover_overlay_style: "flat",
    pdf_cover_logo_position: (t.cover_logo_position ?? "top_left") as CoverFormFields["pdf_cover_logo_position"],
  };
}

/** Shape dei testi restituiti dall'edge function ai-genera-template-pavimenti. */
interface GeneratedTemplateTexts {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  chi_siamo?: string | null;
  esigenze?: PavListItem[];
  soluzione?: PavListItem[];
  usp?: PavListItem[];
  garanzie?: PavListItem[];
  percorso?: PavListItem[];
  cronoprogramma?: PavCronoFase[];
  faq?: PavFaqItem[];
  payment_terms_text?: string | null;
  validity_text?: string | null;
  footer_text?: string | null;
}

// Placeholder cliccabili per i testi cover dinamici (eyebrow/hero/subhero).
// Sostituiti nel PDF da applyCoverPlaceholders (PavimentiPDF.tsx).
const PAV_PLACEHOLDERS = [
  "cliente_nome",
  "cliente_cognome",
  "cliente_nome_completo",
  "cantiere_citta",
  "cantiere_provincia",
  "tipo_intervento",
  "anno",
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
        {PAV_PLACEHOLDERS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange((value ?? "") + `{${n}}`)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-slate-600 hover:text-orange-700 transition-colors"
          >
            {`{${n}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  /** Render dentro la tab Impostazioni (no padding/header extra di pagina). */
  embedded?: boolean;
}

export function PavimentiTemplateEditor({ embedded = false }: Props) {
  const companyId = useEffectiveCompanyId();
  // Profilo azienda (impostazioni/profilo): usato per mostrare i dati EREDITATI
  // come placeholder nell'anagrafica. Se un campo del template è vuoto, nel PDF
  // viene usato questo valore del profilo (auto-import via fallback nel renderer).
  const { data: companyAnagrafica } = useQuery({
    queryKey: ["pav-template-company-anagrafica", companyId],
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
  const { data: template, isLoading } = usePavTemplatePdf();
  const upsert = useUpsertPavTemplatePdf();
  // Probe: il modulo è pubblicato sul DB? Se no, l'editor mostra comunque i default
  // (vedi getPavTemplatePdf) + un banner, e il salvataggio segnala che serve pubblicare.
  const { data: backendReady } = usePavBackendReady();
  const { previewPDF, isGenerating: isPreviewing } = usePavimentiPDF();

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  // Chiudere/ricaricare la scheda con modifiche non salvate ora chiede conferma
  // (il salvataggio qui è solo manuale: prima si perdeva tutto in silenzio).
  useBeforeUnload(dirty);
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  // Template "vivo" per l'anteprima in dialog: ricalcolato solo quando il form cambia.
  const previewTemplate = useMemo<PavTemplatePdf | null>(
    () => (form ? ({ id: "preview", company_id: companyId ?? "", ...form } as PavTemplatePdf) : null),
    [form, companyId],
  );
  // Idratazione una-tantum: appena arriva il template lo riversiamo nel form,
  // ma NON sovrascriviamo se l'utente ha già iniziato a editare (dirty).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!template) return;
    if (hydratedRef.current) return;
    setForm(templateToForm(template));
    hydratedRef.current = true;
  }, [template]);

  // Idratazione dedicata dei campi cover pdf_cover_* (una-tantum): usePavTemplatePdf
  // li scarta (non sono nel tipo normalizzato), quindi li leggiamo grezzi via
  // `(supabase as any)`. Se il modulo non è pubblicato o le colonne non esistono,
  // l'errore viene ignorato e restano i default di templateToForm.
  const coverHydratedRef = useRef(false);
  useEffect(() => {
    if (!companyId) return;
    if (coverHydratedRef.current) return;
    coverHydratedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("pav_template_pdf")
          .select(PDF_COVER_KEYS.join(","))
          .eq("company_id", companyId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const row = data as Record<string, unknown>;
        setForm((prev) => {
          if (!prev) return prev;
          // Non sovrascrivere edit utente in corso.
          if (dirty) return prev;
          const patch: Partial<CoverFormFields> = {};
          for (const k of PDF_COVER_KEYS) {
            const v = row[k];
            if (v !== null && v !== undefined) {
              (patch as Record<string, unknown>)[k] = v;
            }
          }
          return { ...prev, ...patch };
        });
      } catch {
        // silenzioso: degrada ai default
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  // ─── Cover presets 1-click (parità Serramenti/FV) ─────────────────────────
  // Applica in batch tutti i campi pdf_cover_* del preset selezionato.
  const applyCoverPreset = (presetId: string) => {
    const preset = COVER_PRESETS.find((pr) => pr.id === presetId);
    if (!preset) return;
    setForm((prev) => (prev ? { ...prev, ...preset.patch } : prev));
    setDirty(true);
  };
  // Detection live del preset attivo (evidenzia la card). null = personalizzato.
  const activeCoverPresetId = useMemo(
    () => (form ? detectActiveCoverPreset(form) : null),
    [form],
  );

  // Galleria immagini stock cover.
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockCategory, setStockCategory] = useState<CoverStockImage["categoria"] | "all">("all");
  const stockFiltered = useMemo(
    () => (stockCategory === "all" ? COVER_STOCK_IMAGES : COVER_STOCK_IMAGES.filter((img) => img.categoria === stockCategory)),
    [stockCategory],
  );
  const applyStockImage = (img: CoverStockImage) => {
    setForm((prev) => (prev ? { ...prev, pdf_cover_image_url: img.url } : prev));
    setDirty(true);
    setStockDialogOpen(false);
  };

  const handleSave = async () => {
    if (!form) return;
    // Separa i campi cover pdf_cover_* (non tipizzati su PavTemplatePatch) dal
    // patch persistente standard. I primi si inviano alla tabella via cast.
    const coverPayload: Record<string, unknown> = {};
    const basePatch: Record<string, unknown> = {};
    const coverKeySet = new Set<string>(PDF_COVER_KEYS as readonly string[]);
    for (const [k, v] of Object.entries(form)) {
      if (coverKeySet.has(k)) coverPayload[k] = v;
      else basePatch[k] = v;
    }
    const patch = basePatch as PavTemplatePatch;
    try {
      // Upsert standard (campi tipizzati): crea/aggiorna la riga e la rimette in cache.
      await upsert.mutateAsync(patch);
      // Upsert dedicato dei campi pdf_cover_* via cast. onConflict company_id =
      // stessa riga appena creata/aggiornata. Se le colonne non esistono ancora
      // (modulo non pubblicato), l'errore è segnalato a parte.
      if (companyId && Object.keys(coverPayload).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("pav_template_pdf")
          .upsert(
            { ...coverPayload, company_id: companyId, updated_at: new Date().toISOString() },
            { onConflict: "company_id" },
          );
        if (error) throw new Error(error.message);
      }
      setDirty(false);
      toast.success("Template salvato", {
        description: "Verrà applicato ai nuovi preventivi pavimenti.",
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
    if (g.cover_title) set("cover_title", g.cover_title);
    if (g.cover_subtitle) set("cover_subtitle", g.cover_subtitle);
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
    if (aiLoading) return;
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
        "ai-genera-template-pavimenti",
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
  // esempio. `previewPDF` non rilegge le tabelle pav_* (passiamo il template) →
  // funziona anche con il modulo non ancora pubblicato sul DB.
  const handlePreview = async () => {
    if (!form || !companyId) return;
    const template: PavTemplatePdf = { id: "preview", company_id: companyId, ...form };
    const row = (
      i: number, cap: string, descrizione: string,
      um: PavComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
    ): PavComputoVoce => ({
      id: String(i), progetto_id: "preview", company_id: companyId, capitolo_nome: cap, descrizione,
      unita_misura: um, quantita: q, prezzo_unitario: p, costo_materiali: cm, costo_manodopera: cl,
      sconto_pct: 0, importo: q * p, margine_eur: q * (p - cm - cl),
      margine_pct: p > 0 ? ((p - cm - cl) / p) * 100 : 0, listino_voce_id: null, ordine: i,
    });
    const progetto: PavProgetto = {
      id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
      tipo_intervento: "Pavimento completo",
      numero_ambienti: 4, tipo_materiale: "Gres porcellanato", massimale_detrazione: null,
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
      cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
      immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
      opportunita_id: null, cliente_id: null, template_id: null,
      sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
      totale_imponibile: 0, totale: 0, note: null,
    };
    const computo: PavComputoVoce[] = [
      row(0, "Demolizioni e rimozioni", "Demolizione tramezzi interni", "mq", 25, 18, 2, 10),
      row(1, "Demolizioni e rimozioni", "Rimozione pavimenti esistenti", "mq", 90, 12, 1, 6),
      row(2, "Opere edili", "Nuove pareti divisorie in cartongesso", "mq", 40, 28, 8, 12),
      row(3, "Impianti", "Rifacimento impianto elettrico certificato", "corpo", 1, 6500, 2000, 2500),
      row(4, "Impianti", "Rifacimento impianto idraulico", "corpo", 1, 4200, 1500, 1500),
      row(5, "Finiture", "Posa pavimento gres porcellanato", "mq", 90, 42, 22, 14),
    ];
    await previewPDF({ progetto, computo, media: [], template });
  };

  // ─── Sidebar navigation sezioni ────────────────────────────────────────
  // Layout app-like: sidebar a sinistra + content panel a destra. Una sezione
  // visibile alla volta — niente più scroll infinito. Deeplink via `?section=`.
  type PavSection =
    | "brand"
    | "page_ordine" | "page_cover" | "page_chi_siamo" | "page_percorso" | "page_testimonianze" | "page_crono" | "page_condizioni"
    | "garanzie" | "contenuti" | "opzioni";
  const PAV_SECTION_GROUPS: Array<{
    label: string;
    items: Array<{ id: PavSection; label: string; emoji: string; descr?: string }>;
  }> = [
    {
      label: "AZIENDA",
      items: [
        { id: "brand", label: "Brand & azienda", emoji: "🏢", descr: "Logo e colori del PDF" },
      ],
    },
    {
      label: "PAGINE DEL PDF",
      items: [
        { id: "page_ordine",        label: "Ordine e pagine", emoji: "🔀", descr: "Capitoli, ordine e pagine vostre" },
        { id: "page_cover",         label: "Copertina",     emoji: "🖼️", descr: "Prima pagina del preventivo" },
        { id: "page_chi_siamo",     label: "Chi siamo",     emoji: "👋", descr: "Presentazione impresa" },
        { id: "page_percorso",      label: "Come lavoriamo", emoji: "🗺️", descr: "Le fasi del cantiere" },
        { id: "page_testimonianze", label: "Testimonianze", emoji: "⭐", descr: "Recensioni clienti" },
        { id: "page_crono",         label: "Cronoprogramma", emoji: "📅", descr: "Fasi del cantiere" },
        { id: "page_condizioni",    label: "Condizioni",    emoji: "📄", descr: "Pagamenti, validità, condizioni e firma" },
      ],
    },
    {
      label: "DATI & CONTENUTI",
      items: [
        { id: "garanzie",  label: "Garanzie & FAQ", emoji: "🛡️", descr: "Garanzie e domande frequenti" },
        { id: "contenuti", label: "Contenuti",   emoji: "📝", descr: "Esigenze, soluzione, USP" },
        { id: "opzioni",   label: "Opzioni PDF", emoji: "⚙️", descr: "Visibilità documento" },
      ],
    },
  ];
  const PAV_SECTIONS = PAV_SECTION_GROUPS.flatMap((g) => g.items);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = (searchParams.get("section") ?? "brand") as PavSection;
  const activeSection: PavSection = PAV_SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : ("brand" as PavSection);
  const setActiveSection = (id: PavSection) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("section", id);
      return next;
    }, { replace: true });
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", embedded ? "" : "mx-auto max-w-4xl p-4")}>
      {backendReady === false && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Modulo Pavimenti non ancora pubblicato sul database</p>
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
              <p className="text-sm font-semibold">Scrivi il template con l&apos;AI</p>
              <p className="text-[12px] text-muted-foreground">
                In un click generi una bozza professionale di tutti i testi — chi siamo, esigenze,
                garanzie, FAQ, condizioni… Poi rifinisci e salvi.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setAiOpen(true)}
            className="shrink-0 gap-1.5 bg-orange-500 hover:bg-orange-600"
          >
            <Sparkles className="h-4 w-4" />
            Genera testi con AI
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="col-span-12 md:col-span-3">
          <nav className="sticky top-[68px] rounded-lg border bg-card p-2 max-h-[calc(100vh-90px)] overflow-y-auto">
            {PAV_SECTION_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-3 pt-2 border-t" : ""}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5 mb-0.5">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActiveSection(s.id)}
                        className={cn(
                          "w-full text-left rounded-md px-2 py-1.5 transition-all flex items-center gap-2",
                          isActive
                            ? "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-sm"
                            : "hover:bg-orange-50 text-foreground",
                        )}
                      >
                        <span className="text-sm leading-none">{s.emoji}</span>
                        <span className={cn("text-[12px] font-medium leading-tight flex-1 truncate", isActive ? "text-white" : "text-foreground")}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
        </aside>

        {/* ── CONTENT PANEL ────────────────────────────────────────── */}
        <div className="col-span-12 md:col-span-9 xl:col-span-5 space-y-4 min-w-0">
          {/* Branding */}
          {activeSection === "brand" && (
            <>
            <SectionCard icon={Palette} title="Branding" description="Logo e colori usati nel PDF.">
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageUploadField
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
                  sovrascriverli nei preventivi pavimenti.
                </span>
              </div>
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

          {/* Copertina */}
          {/* Ordine dei capitoli e pagine libere: stesso blocco degli otto moduli. */}
          {activeSection === "page_ordine" && (
            <SectionCard icon={ListOrdered} title="Ordine e pagine" description="In che ordine escono i capitoli, quali nascondere, e le pagine scritte da voi.">
              <OrdineCapitoli
                ordine={form.pdf_ordine_capitoli}
                pagine={form.pdf_pagine_libere}
                onOrdine={(v) => set("pdf_ordine_capitoli", v)}
                onPagine={(v) => set("pdf_pagine_libere", v)}
                campoFoto={(valore, onChange) => (
                  <ImageUploadField label="Foto della pagina" value={valore} companyId={companyId} onChange={onChange} aspect="aspect-[16/9]" />
                )}
              />
            </SectionCard>
          )}

          {activeSection === "page_cover" && (
            <SectionCard icon={FileText} title="Copertina" description="Layout, testi, immagine e stile della prima pagina del preventivo.">
              {/* ─── Preset stili cover 1-click (parità Serramenti) ───────────── */}
              <div className="rounded-lg border bg-gradient-to-br from-orange-50 to-amber-50/30 p-3 space-y-3 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                      ✨ Preset stili — anteprima reale 1-click
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Configurazione completa (colori, font, layout) in un click. L&apos;immagine di sfondo non viene modificata dai preset.
                    </p>
                  </div>
                  {activeCoverPresetId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-300 text-orange-800 px-2 h-5 text-[10px]">
                      <span className="text-sm leading-none">{COVER_PRESETS.find((pr) => pr.id === activeCoverPresetId)?.emoji}</span>
                      Attivo: {COVER_PRESETS.find((pr) => pr.id === activeCoverPresetId)?.nome}
                    </span>
                  )}
                </div>
                {(["solid", "photo"] as const).map((cat) => {
                  const presetsInCat = COVER_PRESETS.filter((pr) => pr.category === cat);
                  if (presetsInCat.length === 0) return null;
                  const catLabel = cat === "solid"
                    ? { emoji: "🎨", title: "Solo colore (no immagine)", subtitle: "Background solido con titolo e accent" }
                    : { emoji: "📷", title: "Con immagine sfondo", subtitle: "Foto come sfondo + overlay per leggibilità" };
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm">{catLabel.emoji}</span>
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{catLabel.title}</span>
                        <span className="text-[10px] text-muted-foreground">{catLabel.subtitle}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        {presetsInCat.map((pr) => {
                          const isActive = activeCoverPresetId === pr.id;
                          const tv = pr.patch.pdf_cover_text_vertical ?? "bottom";
                          const ta = pr.patch.pdf_cover_text_align ?? "left";
                          return (
                            <button
                              key={pr.id}
                              type="button"
                              onClick={() => applyCoverPreset(pr.id)}
                              title={pr.descrizione}
                              className={cn(
                                "group relative rounded-lg overflow-hidden transition-all text-left focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white border-2",
                                isActive ? "border-orange-500 shadow-md ring-2 ring-orange-300" : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                              )}
                            >
                              <div className="relative w-full overflow-hidden flex flex-col p-2" style={{ aspectRatio: "210/297", backgroundColor: pr.swatchBg, color: pr.swatchText }}>
                                {pr.category === "photo" && (
                                  <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 100%)" }} />
                                )}
                                <div className="absolute top-1.5 left-1.5 text-[7px] font-bold uppercase tracking-wider px-1 py-px rounded-sm z-10" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#475569" }}>
                                  {pr.category === "solid" ? "● colore" : "📷 foto"}
                                </div>
                                <div className="relative flex-1 flex flex-col z-[1]" style={{ justifyContent: tv === "top" ? "flex-start" : tv === "center" ? "center" : "flex-end" }}>
                                  <div style={{ textAlign: ta === "center" ? "center" : "left" }}>
                                    <div className="font-bold uppercase tracking-wider mb-1" style={{ fontSize: 5, color: pr.swatchAccent, opacity: 0.9 }}>★ Proposta</div>
                                    <div className="font-bold leading-tight whitespace-pre-line" style={{ fontSize: Math.max(7, (pr.patch.pdf_cover_title_size ?? 40) * 0.16) }}>{pr.sampleTitle}</div>
                                  </div>
                                </div>
                              </div>
                              <div className="px-2 py-1.5 bg-white border-t border-slate-100">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm leading-none">{pr.emoji}</span>
                                  <span className="text-[11px] font-semibold text-slate-900 truncate">{pr.nome}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-[8px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1 py-px rounded font-semibold">{pr.tag}</span>
                                </div>
                              </div>
                              {isActive && (
                                <div className="absolute top-1.5 right-1.5 bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
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

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                {/* Colonna controlli */}
                <div className="space-y-4">
                  {/* Testi cover */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Eyebrow (occhiello)</Label>
                      <Input
                        value={form.pdf_cover_eyebrow ?? ""}
                        onChange={(e) => set("pdf_cover_eyebrow", e.target.value || null)}
                        placeholder="La tua proposta personalizzata"
                      />
                      <PlaceholderChips
                        value={form.pdf_cover_eyebrow ?? ""}
                        onChange={(v) => set("pdf_cover_eyebrow", v || null)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Titolo (hero)</Label>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        Una parola fra asterischi esce in corsivo: <span className="font-mono">Il *progetto* per la tua casa.</span>
                      </p>
                      <Textarea
                        value={form.pdf_cover_hero ?? ""}
                        onChange={(e) => {
                          set("pdf_cover_hero", e.target.value || null);
                          // Tiene allineato il campo legacy cover_title (usato anche dall'AI).
                          set("cover_title", e.target.value);
                        }}
                        rows={2}
                        placeholder={"Preventivo\npavimenti."}
                      />
                      <PlaceholderChips
                        value={form.pdf_cover_hero ?? ""}
                        onChange={(v) => { set("pdf_cover_hero", v || null); set("cover_title", v); }}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Sottotitolo</Label>
                      <Textarea
                        value={form.pdf_cover_subhero ?? ""}
                        onChange={(e) => {
                          set("pdf_cover_subhero", e.target.value || null);
                          set("cover_subtitle", e.target.value);
                        }}
                        rows={2}
                        placeholder="Pavimenti e rivestimenti, chiavi in mano"
                      />
                      <PlaceholderChips
                        value={form.pdf_cover_subhero ?? ""}
                        onChange={(v) => { set("pdf_cover_subhero", v || null); set("cover_subtitle", v); }}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Sottotitolo dinamico (con campi cliente) — opzionale</Label>
                      <Input
                        value={form.pdf_cover_subhero_template ?? ""}
                        onChange={(e) => set("pdf_cover_subhero_template", e.target.value || null)}
                        placeholder="Intervento di {tipo_intervento} a {cantiere_citta} per {cliente_nome_completo}."
                      />
                      <PlaceholderChips
                        value={form.pdf_cover_subhero_template ?? ""}
                        onChange={(v) => set("pdf_cover_subhero_template", v || null)}
                        label="Se valorizzato, ha la priorità sul sottotitolo statico. Campi:"
                      />
                    </div>
                  </div>

                  {/* Colori + overlay + allineamento */}
                  <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Colore sfondo (no immagine)</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={form.pdf_cover_bg_color ?? "#0F1B2A"}
                          onChange={(e) => set("pdf_cover_bg_color", e.target.value.toUpperCase())}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded border bg-background p-0.5"
                          aria-label="Colore sfondo cover"
                        />
                        <Input
                          value={form.pdf_cover_bg_color ?? ""}
                          onChange={(e) => set("pdf_cover_bg_color", e.target.value || null)}
                          placeholder="auto"
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <ColorField
                      label="Colore testo"
                      value={form.pdf_cover_text_color ?? "#FFFFFF"}
                      onChange={(v) => set("pdf_cover_text_color", v)}
                    />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Opacità overlay</Label>
                        <span className="text-[11px] font-mono text-muted-foreground">{form.pdf_cover_overlay_opacity ?? 62}%</span>
                      </div>
                      <Slider
                        value={[form.pdf_cover_overlay_opacity ?? 62]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(v) => set("pdf_cover_overlay_opacity", v[0])}
                        className="mt-2"
                      />
                    </div>
                  </div>

                  {/* Posizione verticale + allineamento + card cliente */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Posizione verticale testo</Label>
                      <div className="flex flex-wrap gap-2">
                        {([["top", "In alto"], ["center", "Centro"], ["bottom", "In basso"]] as const).map(([v, lbl]) => (
                          <Button key={v} type="button" size="sm"
                            variant={(form.pdf_cover_text_vertical ?? "bottom") === v ? "default" : "outline"}
                            onClick={() => set("pdf_cover_text_vertical", v)}
                            className={(form.pdf_cover_text_vertical ?? "bottom") === v ? "bg-orange-500 hover:bg-orange-600" : ""}
                          >{lbl}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Allineamento orizzontale</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm"
                          variant={(form.pdf_cover_text_align ?? "left") === "left" ? "default" : "outline"}
                          onClick={() => set("pdf_cover_text_align", "left")}
                          className={(form.pdf_cover_text_align ?? "left") === "left" ? "bg-orange-500 hover:bg-orange-600" : ""}
                        >Sinistra</Button>
                        <Button type="button" size="sm"
                          variant={form.pdf_cover_text_align === "center" ? "default" : "outline"}
                          onClick={() => set("pdf_cover_text_align", "center")}
                          className={form.pdf_cover_text_align === "center" ? "bg-orange-500 hover:bg-orange-600" : ""}
                        >Centro</Button>
                        <label className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs">
                          <input
                            type="checkbox"
                            checked={form.pdf_cover_show_client_card !== false}
                            onChange={(e) => set("pdf_cover_show_client_card", e.target.checked)}
                          />
                          Card cliente
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Logo + overlay style + decorazione */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Posizione logo</Label>
                      <select
                        value={form.pdf_cover_logo_position ?? "top_left"}
                        onChange={(e) => set("pdf_cover_logo_position", e.target.value as CoverFormFields["pdf_cover_logo_position"])}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="top_left">In alto a sinistra</option>
                        <option value="top_center">In alto al centro</option>
                        <option value="top_right">In alto a destra</option>
                        <option value="hidden">Nascosto</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Stile overlay (su immagine)</Label>
                      <select
                        value={form.pdf_cover_overlay_style ?? "flat"}
                        onChange={(e) => set("pdf_cover_overlay_style", e.target.value as CoverFormFields["pdf_cover_overlay_style"])}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="flat">Piatto</option>
                        <option value="gradient">Gradient (dal basso)</option>
                        <option value="gradient_diag">Gradient diagonale</option>
                        <option value="vignette">Vignette</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Decorazione angolo</Label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <input type="checkbox" checked={form.pdf_cover_show_decoration !== false}
                            onChange={(e) => set("pdf_cover_show_decoration", e.target.checked)} />
                          Mostra
                        </label>
                        <select
                          value={form.pdf_cover_decoration_style ?? "square"}
                          onChange={(e) => set("pdf_cover_decoration_style", e.target.value as CoverFormFields["pdf_cover_decoration_style"])}
                          disabled={form.pdf_cover_show_decoration === false}
                          className="h-9 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                        >
                          <option value="square">Squadre da progetto</option>
                          <option value="circle">Anelli</option>
                          <option value="line">Linea</option>
                          <option value="pattern">Pattern</option>
                          <option value="none">Nessuna</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Dimensioni font */}
                  <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dim. titolo ({form.pdf_cover_title_size ?? 40})</Label>
                      <Slider value={[form.pdf_cover_title_size ?? 40]} min={28} max={64} step={1}
                        onValueChange={(v) => set("pdf_cover_title_size", v[0])} className="mt-2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dim. sottotitolo ({form.pdf_cover_subtitle_size ?? 13})</Label>
                      <Slider value={[form.pdf_cover_subtitle_size ?? 13]} min={10} max={18} step={1}
                        onValueChange={(v) => set("pdf_cover_subtitle_size", v[0])} className="mt-2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dim. eyebrow ({form.pdf_cover_eyebrow_size ?? 11})</Label>
                      <Slider value={[form.pdf_cover_eyebrow_size ?? 11]} min={8} max={14} step={1}
                        onValueChange={(v) => set("pdf_cover_eyebrow_size", v[0])} className="mt-2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dim. logo ({form.pdf_cover_logo_size ?? 100}%)</Label>
                      <Slider value={[form.pdf_cover_logo_size ?? 100]} min={60} max={160} step={5}
                        onValueChange={(v) => set("pdf_cover_logo_size", v[0])} className="mt-2" />
                    </div>
                  </div>
                </div>

                {/* Colonna anteprima live A4 + immagine */}
                <div className="space-y-3">
                  <Label className="text-xs font-medium">Anteprima copertina</Label>
                  <CopertinaAnteprima
                    modulo="pavimenti"
                    form={form as unknown as Record<string, unknown>}
                    maiSalvato={!template?.id}
                    nomeAzienda={(form as unknown as { ragione_sociale?: string | null }).ragione_sociale ?? companyAnagrafica?.ragione_sociale ?? null}
                    logoUrl={(form as unknown as { logo_url?: string | null }).logo_url ?? null}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setStockDialogOpen(true)} className="flex-1 gap-1 border-orange-200 text-orange-700 hover:bg-orange-50">
                      📷 Galleria stock
                    </Button>
                    {form.pdf_cover_image_url && (
                      <Button type="button" variant="outline" size="sm" onClick={() => set("pdf_cover_image_url", null)} className="text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <ImageUploadField
                    label="Logo copertina — opzionale (default: logo principale)"
                    hint="Versione chiara/bianca del logo per la copertina con sfondo scuro. Se vuoto, usa il logo principale."
                    value={form.cover_logo_url}
                    companyId={companyId}
                    onChange={(url) => set("cover_logo_url", url)}
                    aspect="aspect-square"
                  />
                  <ImageUploadField
                    label="Immagine copertina"
                    hint="Foto orizzontale di un cantiere/render. Override sull'immagine."
                    value={form.pdf_cover_image_url ?? null}
                    companyId={companyId}
                    onChange={(url) => set("pdf_cover_image_url", url)}
                    aspect="aspect-[16/9]"
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {/* Chi siamo */}
          {activeSection === "page_chi_siamo" && (
            <SectionCard
              icon={Building2}
              title="Chi siamo"
              description="Presentazione dell'impresa nel PDF."
              toggle={{ value: form.show_chi_siamo, onChange: (v) => set("show_chi_siamo", v), label: "Mostra nel PDF" }}
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
                <ImageUploadField
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
              toggle={{ value: form.show_percorso, onChange: (v) => set("show_percorso", v), label: "Mostra nel PDF" }}
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

          {/* Garanzie & FAQ */}
          {activeSection === "garanzie" && (
            <SectionCard
              icon={ShieldCheck}
              title="Garanzie & FAQ"
              description="Garanzie e domande frequenti mostrate nel PDF."
              toggle={{ value: form.show_garanzie, onChange: (v) => set("show_garanzie", v), label: "Mostra nel PDF" }}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Garanzie</Label>
                  <ListItemsEditor
                    items={form.garanzie}
                    onChange={(items) => set("garanzie", items)}
                    addLabel="Aggiungi garanzia"
                    titlePlaceholder="Es. Garanzia 10 anni sulle opere"
                    descPlaceholder="Dettaglio (opzionale)"
                  />
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-xs font-medium">Domande frequenti</Label>
                  <FaqEditor items={form.faq} onChange={(items) => set("faq", items)} />
                </div>
              </div>
            </SectionCard>
          )}

          {/* Testimonianze */}
          {activeSection === "page_testimonianze" && (
            <SectionCard icon={Quote} title="Testimonianze" description="Recensioni dei clienti mostrate nel PDF.">
              <TestimonianzeEditor
                items={form.testimonianze}
                onChange={(items) => set("testimonianze", items)}
              />
            </SectionCard>
          )}

          {activeSection === "page_testimonianze" && (
            <SectionCard icon={ImageIcon} title="Gallery lavori" description="Foto di lavori realizzati, mostrate nel PDF.">
              {/* Nello stesso bucket delle altre immagini del modello: il bucket
                  "companies" non esiste e ogni foto finiva in errore. */}
              <GalleryLavoriEditor
                items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
                onChange={(items) => set("gallery_lavori", items)}
                bucket={BUCKET}
                uploadPath={`${companyId}/pavimenti/gallery`}
              />
            </SectionCard>
          )}

          {/* Cronoprogramma */}
          {activeSection === "page_crono" && (
            <SectionCard
              icon={Clock}
              title="Cronoprogramma"
              description="Le fasi tipiche del cantiere con durata indicativa."
              toggle={{ value: form.show_cronoprogramma, onChange: (v) => set("show_cronoprogramma", v), label: "Mostra nel PDF" }}
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
                <CondizioniContratto
                  companyId={companyId}
                  settore="pavimenti"
                  attivo={form.condizioni_legali_attivo !== false}
                  testo={form.condizioni_legali_testo ?? ""}
                  onAttivo={(v) => set("condizioni_legali_attivo", v)}
                  onTesto={(v) => set("condizioni_legali_testo", v)}
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
              <SectionCard icon={Percent} title="Default economici" description="Valori precompilati sui nuovi preventivi pavimenti.">
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

          {/* Barra salvataggio sticky */}
          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur">
            <span className={cn("text-[11px]", dirty ? "text-amber-600" : "text-muted-foreground")}>
              {dirty ? "Modifiche non salvate" : "Tutto salvato"}
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
                disabled={!dirty || upsert.isPending}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600"
              >
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salva template
              </Button>
            </div>
          </div>
        </div>

        <aside className="col-span-12 xl:col-span-4 min-w-0">
          <div className="xl:sticky xl:top-[68px] xl:self-start xl:h-[calc(100vh-96px)] h-[75vh]">
            <PavimentiLivePreviewPanel template={previewTemplate} companyId={companyId} />
          </div>
        </aside>
      </div>
      <PavimentiTemplatePreviewDialog
        open={livePreviewOpen}
        onOpenChange={setLivePreviewOpen}
        template={previewTemplate}
        companyId={companyId}
        onOpenInTab={() => void handlePreview()}
      />

      {/* ── Dialog: galleria immagini stock cover ────────────────────── */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-orange-500" />
              Galleria immagini copertina
            </DialogTitle>
            <DialogDescription>
              Scegli un&apos;immagine pronta all&apos;uso per la copertina. Potrai sempre caricarne una tua.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {COVER_STOCK_CATEGORIE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setStockCategory(c.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  stockCategory === c.value
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-input bg-background hover:bg-orange-50",
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {stockFiltered.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => applyStockImage(img)}
                className="group relative overflow-hidden rounded-lg border border-slate-200 transition-all hover:border-orange-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <img loading="lazy" src={img.thumb} alt={img.label} className="aspect-[4/3] w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-left text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {img.label}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
interface SectionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  toggle?: { value: boolean; onChange: (v: boolean) => void; label: string };
  children: React.ReactNode;
}

function SectionCard({ icon: Icon, title, description, toggle, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {toggle && (
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {toggle.value ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{toggle.label}</span>
              <Switch checked={toggle.value} onCheckedChange={toggle.onChange} />
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

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
  label: string;
  hint?: string;
  value: string | null;
  companyId: string | null;
  onChange: (url: string | null) => void;
  aspect?: string;
}

function ImageUploadField({ label, hint, value, companyId, onChange, aspect = "aspect-[4/3]" }: ImageUploadFieldProps) {
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
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
      // folder[1] DEVE essere company_id (policy storage company-scoped).
      const path = `${companyId}/pavimenti/template/${crypto.randomUUID()}.${ext}`;
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
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className={cn("relative overflow-hidden rounded-lg border bg-muted/40", aspect)}>
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-7 w-7" />
            <span className="text-[11px]">Nessuna immagine</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={uploading || !companyId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Sostituisci" : "Carica"}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            onClick={() => onChange(null)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Rimuovi
          </Button>
        )}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── List items editor ({titolo, descrizione}) ───────────────────────────────
interface ListItemsEditorProps {
  items: PavListItem[];
  onChange: (items: PavListItem[]) => void;
  addLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
}

function ListItemsEditor({ items, onChange, addLabel, titlePlaceholder, descPlaceholder }: ListItemsEditorProps) {
  const update = (idx: number, patch: Partial<PavListItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna voce. Aggiungine almeno una per arricchire il PDF.
        </p>
      )}
      {items.map((it, idx) => (
        <div key={idx} className="flex items-start gap-2 rounded-lg border p-2">
          <div className="mt-1 flex flex-col">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-1.5">
            <Input
              value={it.titolo}
              onChange={(e) => update(idx, { titolo: e.target.value })}
              placeholder={titlePlaceholder}
              className="h-8 text-sm font-medium"
            />
            <Input
              value={it.descrizione ?? ""}
              onChange={(e) => update(idx, { descrizione: e.target.value })}
              placeholder={descPlaceholder}
              className="h-8 text-xs"
            />
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { titolo: "", descrizione: "" }])}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

// ─── Testimonianze editor ─────────────────────────────────────────────────────
function TestimonianzeEditor({ items, onChange }: { items: PavTestimonianza[]; onChange: (items: PavTestimonianza[]) => void }) {
  const update = (idx: number, patch: Partial<PavTestimonianza>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna testimonianza.
        </p>
      )}
      {items.map((t, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border p-2.5">
          <Textarea
            value={t.testo}
            onChange={(e) => update(idx, { testo: e.target.value })}
            placeholder="«Lavoro impeccabile, tempi rispettati...»"
            rows={2}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Input
              value={t.autore}
              onChange={(e) => update(idx, { autore: e.target.value })}
              placeholder="Nome cliente"
              className="h-8 text-xs"
            />
            <Input
              value={t.ruolo ?? ""}
              onChange={(e) => update(idx, { ruolo: e.target.value })}
              placeholder="Città / tipo lavoro"
              className="h-8 text-xs"
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { autore: "", ruolo: "", testo: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Aggiungi testimonianza
      </Button>
    </div>
  );
}

// ─── FAQ editor ({domanda, risposta}) ─────────────────────────────────────────
function FaqEditor({ items, onChange }: { items: PavFaqItem[]; onChange: (items: PavFaqItem[]) => void }) {
  const update = (idx: number, patch: Partial<PavFaqItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna FAQ. Aggiungi le domande più frequenti dei tuoi clienti.
        </p>
      )}
      {items.map((f, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border p-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={f.domanda}
              onChange={(e) => update(idx, { domanda: e.target.value })}
              placeholder="Domanda (es. Servono permessi per i lavori?)"
              className="h-8 flex-1 text-sm font-medium"
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={f.risposta}
            onChange={(e) => update(idx, { risposta: e.target.value })}
            placeholder="Risposta"
            rows={2}
            className="text-xs"
          />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { domanda: "", risposta: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Aggiungi FAQ
      </Button>
    </div>
  );
}

// ─── Cronoprogramma editor ────────────────────────────────────────────────────
function CronoEditor({ items, onChange }: { items: PavCronoFase[]; onChange: (items: PavCronoFase[]) => void }) {
  const update = (idx: number, patch: Partial<PavCronoFase>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna fase. Aggiungi le tappe del cantiere (es. Demolizioni → Impianti → Finiture).
        </p>
      )}
      {items.map((f, idx) => (
        <div key={idx} className="flex items-start gap-2 rounded-lg border p-2">
          <div className="mt-1 flex flex-col">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={f.fase}
                onChange={(e) => update(idx, { fase: e.target.value })}
                placeholder="Fase (es. Demolizioni)"
                className="h-8 flex-1 text-sm font-medium"
              />
              <Input
                value={f.durata ?? ""}
                onChange={(e) => update(idx, { durata: e.target.value })}
                placeholder="Durata (es. 1 settimana)"
                className="h-8 w-40 text-xs"
              />
            </div>
            <Input
              value={f.descrizione ?? ""}
              onChange={(e) => update(idx, { descrizione: e.target.value })}
              placeholder="Dettaglio (opzionale)"
              className="h-8 text-xs"
            />
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { fase: "", durata: "", descrizione: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Aggiungi fase
      </Button>
    </div>
  );
}

export default PavimentiTemplateEditor;
