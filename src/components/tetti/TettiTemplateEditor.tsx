/**
 * TettiTemplateEditor — editor del template PDF del verticale
 * Tetti (Task 20).
 *
 * Modellato su `SerramentiTemplateEditor` ma alla scala di `tet_template_pdf`
 * (un record/azienda, upsert via `useUpsertTetTemplatePdf`). Configura:
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
 * path `{company_id}/tetti/template/{uuid}.{ext}` → URL pubblico
 * stabile salvato nel template (ideale per il PDF, niente signed URL scaduti).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Save, Loader2, Upload, Image as ImageIcon, Plus, Trash2, GripVertical,
  Palette, FileText, Sparkles, ListChecks, Quote, Clock, Building2,
  Eye, EyeOff, BadgeEuro, AlertTriangle, FileSearch, Route, ShieldCheck, Percent,
  Wand2,
} from "lucide-react";
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
import { useTettiPDF } from "@/hooks/useTettiPDF";
import { TettiTemplatePreviewDialog } from "@/components/tetti/TettiTemplatePreviewDialog";
import { AiTemplateReviewDialog } from "@/components/preventivi/AiTemplateReviewDialog";
import { AiSalesProfileForm } from "@/components/preventivi/AiSalesProfileForm";
import { useCompanySalesProfile, EMPTY_SALES_PROFILE, type CompanySalesProfile } from "@/hooks/useCompanySalesProfile";
import {
  useTetTemplatePdf,
  useUpsertTetTemplatePdf,
  useTetBackendReady,
  useEffectiveCompanyId,
  type TetTemplatePatch,
} from "@/hooks/useTettiProgetto";
import type {
  TetTemplatePdf, TetListItem, TetFaqItem, TetTestimonianza, TetCronoFase,
  TetProgetto, TetComputoVoce,
} from "@/types/tetti";
import { COVER_PRESETS, detectActiveCoverPreset } from "@/components/tetti/coverPresets";
import { COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage } from "@/components/tetti/coverStockImages";
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import type { GalleryLavoroItem } from "@/types/gallery";

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

// Campi {placeholder} sostituiti nel PDF (cover eyebrow/titolo/sottotitolo).
// Riusabili in qualsiasi campo testo della copertina; restano allineati al renderer.
const TET_PLACEHOLDERS = [
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
        {TET_PLACEHOLDERS.map((n) => (
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
type FormState = Required<Pick<TetTemplatePdf,
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
  // Cover parity (preset 1-click) — stesso set di sr_template_pdf (schema cover_*).
  | "cover_bg_color" | "cover_eyebrow" | "cover_eyebrow_size" | "cover_subtitle_size"
  | "cover_logo_size" | "cover_overlay_style" | "cover_text_vertical"
  | "cover_decoration_style" | "cover_show_decoration" | "cover_show_client_card"
  | "default_iva_pct" | "default_detrazione_pct" | "default_validita_giorni"
  | "gallery_lavori"
>>;

function templateToForm(t: TetTemplatePdf): FormState {
  return {
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
    // Cover parity (preset 1-click) — default difensivi allineati a normalizeTemplate.
    cover_bg_color: t.cover_bg_color ?? null,
    cover_eyebrow: t.cover_eyebrow ?? null,
    cover_eyebrow_size: t.cover_eyebrow_size ?? null,
    cover_subtitle_size: t.cover_subtitle_size ?? null,
    cover_logo_size: t.cover_logo_size ?? null,
    cover_overlay_style: t.cover_overlay_style ?? "flat",
    cover_text_vertical: t.cover_text_vertical ?? "bottom",
    cover_decoration_style: t.cover_decoration_style ?? "square",
    cover_show_decoration: t.cover_show_decoration ?? true,
    cover_show_client_card: t.cover_show_client_card ?? true,
    default_iva_pct: t.default_iva_pct ?? 10,
    default_detrazione_pct: t.default_detrazione_pct ?? 50,
    default_validita_giorni: t.default_validita_giorni ?? 30,
    gallery_lavori: t.gallery_lavori ?? [],
  };
}

/** Shape dei testi restituiti dall'edge function ai-genera-template-tetti. */
interface GeneratedTemplateTexts {
  cover_title?: string | null;
  cover_subtitle?: string | null;
  chi_siamo?: string | null;
  esigenze?: TetListItem[];
  soluzione?: TetListItem[];
  usp?: TetListItem[];
  garanzie?: TetListItem[];
  percorso?: TetListItem[];
  cronoprogramma?: TetCronoFase[];
  faq?: TetFaqItem[];
  payment_terms_text?: string | null;
  validity_text?: string | null;
  footer_text?: string | null;
}

interface Props {
  /** Render dentro la tab Impostazioni (no padding/header extra di pagina). */
  embedded?: boolean;
}

export function TettiTemplateEditor({ embedded = false }: Props) {
  const companyId = useEffectiveCompanyId();
  // Profilo azienda (impostazioni/profilo): usato per mostrare i dati EREDITATI
  // come placeholder nell'anagrafica. Se un campo del template è vuoto, nel PDF
  // viene usato questo valore del profilo (auto-import via fallback nel renderer).
  const { data: companyAnagrafica } = useQuery({
    queryKey: ["tet-template-company-anagrafica", companyId],
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
  const { data: template, isLoading } = useTetTemplatePdf();
  const upsert = useUpsertTetTemplatePdf();
  // Probe: il modulo è pubblicato sul DB? Se no, l'editor mostra comunque i default
  // (vedi getTetTemplatePdf) + un banner, e il salvataggio segnala che serve pubblicare.
  const { data: backendReady } = useTetBackendReady();
  const { previewPDF, isGenerating: isPreviewing } = useTettiPDF();

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  // Template "vivo" per l'anteprima in dialog: ricalcolato solo quando il form cambia.
  const previewTemplate = useMemo<TetTemplatePdf | null>(
    () => (form ? ({ id: "preview", company_id: companyId ?? "", ...form } as TetTemplatePdf) : null),
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  // ─── Preset cover 1-click ──────────────────────────────────────────────
  // Applica in batch tutti i campi cover_* del preset selezionato. L'immagine
  // sfondo dei preset 'solid' viene azzerata (cover_image_url: null); per i
  // preset 'photo' il patch porta una stock image suggerita.
  const applyCoverPreset = useCallback((presetId: string) => {
    const preset = COVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => (prev ? { ...prev, ...preset.patch } : prev));
    setDirty(true);
  }, []);
  // Detection live del preset attivo (per evidenziare la card selezionata).
  const activeCoverPresetId = useMemo(
    () => (form ? detectActiveCoverPreset(form) : null),
    [form],
  );

  // ─── Stock images dialog (galleria Unsplash free) ─────────────────────────
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
    const patch: TetTemplatePatch = { ...form };
    try {
      await upsert.mutateAsync(patch);
      setDirty(false);
      toast.success("Template salvato", {
        description: "Verrà applicato ai nuovi preventivi tetti.",
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
        "ai-genera-template-tetti",
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
  // esempio. `previewPDF` non rilegge le tabelle tet_* (passiamo il template) →
  // funziona anche con il modulo non ancora pubblicato sul DB.
  const handlePreview = async () => {
    if (!form || !companyId) return;
    const template: TetTemplatePdf = { id: "preview", company_id: companyId, ...form };
    const row = (
      i: number, cap: string, descrizione: string,
      um: TetComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
    ): TetComputoVoce => ({
      id: String(i), progetto_id: "preview", company_id: companyId, capitolo_nome: cap, descrizione,
      unita_misura: um, quantita: q, prezzo_unitario: p, costo_materiali: cm, costo_manodopera: cl,
      sconto_pct: 0, importo: q * p, margine_eur: q * (p - cm - cl),
      margine_pct: p > 0 ? ((p - cm - cl) / p) * 100 : 0, listino_voce_id: null, ordine: i,
    });
    const progetto: TetProgetto = {
      id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
      tipo_intervento: "Rifacimento copertura completo",
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
      cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
      immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
      opportunita_id: null, cliente_id: null, template_id: null,
      sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
      totale_imponibile: 0, totale: 0, note: null,
    };
    const computo: TetComputoVoce[] = [
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
  type TetSection =
    | "brand"
    | "page_cover" | "page_chi_siamo" | "page_percorso" | "page_testimonianze" | "page_crono" | "page_condizioni"
    | "garanzie" | "contenuti" | "opzioni";
  const TET_SECTION_GROUPS: Array<{
    label: string;
    items: Array<{ id: TetSection; label: string; emoji: string; descr?: string }>;
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
        { id: "page_cover",         label: "Copertina",     emoji: "🖼️", descr: "Prima pagina del preventivo" },
        { id: "page_chi_siamo",     label: "Chi siamo",     emoji: "👋", descr: "Presentazione impresa" },
        { id: "page_percorso",      label: "Come lavoriamo", emoji: "🗺️", descr: "Le fasi del cantiere" },
        { id: "page_testimonianze", label: "Testimonianze", emoji: "⭐", descr: "Recensioni clienti" },
        { id: "page_crono",         label: "Cronoprogramma", emoji: "📅", descr: "Fasi del cantiere" },
        { id: "page_condizioni",    label: "Condizioni",    emoji: "📄", descr: "Pagamenti e validità" },
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
  const TET_SECTIONS = TET_SECTION_GROUPS.flatMap((g) => g.items);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = (searchParams.get("section") ?? "brand") as TetSection;
  const activeSection: TetSection = TET_SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : ("brand" as TetSection);
  const setActiveSection = (id: TetSection) => {
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
            <p className="font-medium">Modulo Tetti non ancora pubblicato sul database</p>
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
            {TET_SECTION_GROUPS.map((group, gi) => (
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
        <div className="col-span-12 md:col-span-9 space-y-4 min-w-0">
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
                  sovrascriverli nei preventivi tetti.
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipografia PDF</Label>
                  <select
                    value={form.font_family ?? "helvetica"}
                    onChange={(e) => set("font_family", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="helvetica">Helvetica · classico</option>
                    <option value="inter">Inter</option>
                    <option value="roboto">Roboto</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Inter/Roboto richiedono font self-hosted: fallback Helvetica nel PDF.
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
          {activeSection === "page_cover" && (
            <SectionCard icon={FileText} title="Copertina" description="Titolo, sottotitolo, immagine e stile della prima pagina.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Titolo</Label>
                    <Input
                      value={form.cover_title ?? ""}
                      onChange={(e) => set("cover_title", e.target.value)}
                      placeholder="Preventivo di tetti"
                    />
                    <PlaceholderChips value={form.cover_title ?? ""} onChange={(v) => set("cover_title", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sottotitolo</Label>
                    <Input
                      value={form.cover_subtitle ?? ""}
                      onChange={(e) => set("cover_subtitle", e.target.value)}
                      placeholder="La tua casa, rinnovata chiavi in mano"
                    />
                    <PlaceholderChips value={form.cover_subtitle ?? ""} onChange={(v) => set("cover_subtitle", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Eyebrow (testo piccolo sopra il titolo)</Label>
                    <Input
                      value={form.cover_eyebrow ?? ""}
                      onChange={(e) => set("cover_eyebrow", e.target.value || null)}
                      placeholder="★ La tua proposta personalizzata"
                    />
                    <PlaceholderChips value={form.cover_eyebrow ?? ""} onChange={(v) => set("cover_eyebrow", v || null)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <ImageUploadField
                    label="Immagine copertina"
                    hint="Foto orizzontale di un cantiere/render, o scegli dalla galleria stock."
                    value={form.cover_image_url}
                    companyId={companyId}
                    onChange={(url) => set("cover_image_url", url)}
                    aspect="aspect-[16/9]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setStockDialogOpen(true)}
                    className="h-8 gap-1.5 border-orange-200 text-xs text-orange-700 hover:bg-orange-50"
                  >
                    📷 Galleria stock
                  </Button>
                </div>
              </div>

              {/* ─── Preset stili cover — anteprima reale 1-click ──────────────
                   Gallery con 8 preset di LAYOUT (no solo colore): ogni preset
                   combina bg/immagine + posizione testo (top/center/bottom) +
                   decorazione + overlay. Divisi in 2 gruppi: 🎨 Solid (4) e
                   📷 Photo (4). Click → applica in batch su cover_*. */}
              <div className="mt-4 space-y-3 rounded-lg border bg-gradient-to-br from-orange-50 to-amber-50/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                      ✨ Preset stili — anteprima reale 1-click
                    </Label>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Configurazione completa (colori, font, layout) in un click.
                    </p>
                  </div>
                  {activeCoverPresetId && (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2 text-[10px] font-medium text-orange-800">
                      <span className="text-sm leading-none">{COVER_PRESETS.find((p) => p.id === activeCoverPresetId)?.emoji}</span>
                      Attivo: {COVER_PRESETS.find((p) => p.id === activeCoverPresetId)?.nome}
                    </span>
                  )}
                </div>
                {(["solid", "photo"] as const).map((cat) => {
                  const presetsInCat = COVER_PRESETS.filter((p) => p.category === cat);
                  if (presetsInCat.length === 0) return null;
                  const catLabel = cat === "solid"
                    ? { emoji: "🎨", title: "Solo colore (no immagine)", subtitle: "Sfondo solido con titolo e accent" }
                    : { emoji: "📷", title: "Con immagine sfondo", subtitle: "Foto come sfondo + overlay scuro per leggibilità" };
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm">{catLabel.emoji}</span>
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{catLabel.title}</span>
                        <span className="text-[10px] text-muted-foreground">{catLabel.subtitle}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {presetsInCat.map((p) => {
                          const isActive = activeCoverPresetId === p.id;
                          const tv = p.patch.cover_text_vertical ?? "bottom";
                          const ta = p.patch.cover_text_align ?? "left";
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyCoverPreset(p.id)}
                              title={p.descrizione}
                              className={cn(
                                "group relative overflow-hidden rounded-lg border-2 bg-white text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-400",
                                isActive
                                  ? "border-orange-500 shadow-md ring-2 ring-orange-300"
                                  : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                              )}
                            >
                              {/* Mini-anteprima A4 — aspect 210/297 */}
                              <div
                                className="relative flex w-full flex-col overflow-hidden p-2"
                                style={{ aspectRatio: "210/297", backgroundColor: p.swatchBg, color: p.swatchText }}
                              >
                                {p.category === "photo" && (
                                  <div
                                    className="pointer-events-none absolute inset-0 opacity-40"
                                    style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 100%)" }}
                                  />
                                )}
                                <div
                                  className="absolute left-1.5 top-1.5 z-10 rounded-sm px-1 py-px text-[7px] font-bold uppercase tracking-wider"
                                  style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#475569" }}
                                >
                                  {p.category === "solid" ? "● colore" : "📷 foto"}
                                </div>
                                <div
                                  className="relative z-[1] flex flex-1 flex-col"
                                  style={{ justifyContent: tv === "top" ? "flex-start" : tv === "center" ? "center" : "flex-end" }}
                                >
                                  {tv === "top" && (
                                    <div
                                      className="mb-2 flex items-center gap-1"
                                      style={{
                                        justifyContent: p.patch.cover_logo_position === "top_right" ? "flex-end"
                                          : p.patch.cover_logo_position === "top_center" ? "center" : "flex-start",
                                      }}
                                    >
                                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.swatchAccent, opacity: 0.7 }} />
                                      <div className="h-1 w-5 rounded-full opacity-30" style={{ backgroundColor: p.swatchText }} />
                                    </div>
                                  )}
                                  <div style={{ textAlign: ta === "center" ? "center" : "left" }}>
                                    <div className="mb-1 font-bold uppercase tracking-wider" style={{ fontSize: 5, color: p.swatchAccent, opacity: 0.9 }}>
                                      ★ Proposta
                                    </div>
                                    <div
                                      className="whitespace-pre-line font-bold leading-tight"
                                      style={{ fontSize: Math.max(7, (p.patch.cover_title_size ?? 30) * 0.2) }}
                                    >
                                      {p.sampleTitle}
                                    </div>
                                    {p.patch.cover_show_client_card !== false && (
                                      <div className="mt-1 inline-block rounded-sm px-1 py-0.5" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                                        <div className="h-0.5 w-3 rounded-full opacity-50" style={{ backgroundColor: p.swatchText }} />
                                        <div className="mt-0.5 h-1 w-4 rounded-full" style={{ backgroundColor: p.swatchText }} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="border-t border-slate-100 bg-white px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm leading-none">{p.emoji}</span>
                                  <span className="truncate text-[11px] font-semibold text-slate-900">{p.nome}</span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1">
                                  <span className="rounded bg-slate-100 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-slate-600">{p.tag}</span>
                                </div>
                              </div>
                              {isActive && (
                                <div className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-md">
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
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
                  <p className="inline-block rounded bg-amber-100/60 px-2 py-1 text-[10px] text-amber-700">
                    💡 Configurazione personalizzata — non corrisponde a nessun preset. I tuoi valori vengono mantenuti.
                  </p>
                )}
              </div>

              {/* ─── Logo copertina (versione chiara per sfondo scuro) ───────── */}
              <div className="mt-4 border-t pt-4">
                <ImageUploadField
                  label="Logo copertina (sfondo scuro)"
                  hint="Versione chiara/bianca del logo per la copertina con sfondo scuro. Se vuoto, usa il logo principale."
                  value={form.cover_logo_url}
                  companyId={companyId}
                  onChange={(url) => set("cover_logo_url", url)}
                  aspect="aspect-square"
                />
              </div>

              {/* ─── Anteprima live A4 + controlli ──────────────────────────── */}
              <div className="mt-4 grid grid-cols-12 gap-4 border-t pt-4">
                {/* PREVIEW LIVE — formato A4 portrait scalato (fedele a TettiPDF) */}
                <div className="col-span-12 md:col-span-5">
                  <Label className="mb-1.5 block text-xs">Anteprima cover</Label>
                  <div
                    className="relative w-full overflow-hidden rounded-lg border-2 border-slate-200 shadow-sm"
                    style={{ aspectRatio: "210/297", backgroundColor: form.cover_bg_color || "#0F1B2A" }}
                  >
                    {form.cover_image_url && (
                      <img loading="lazy" src={form.cover_image_url} alt="cover bg" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {/* Overlay scuro su immagine — stile selezionabile (CSS replica del PDF SVG). */}
                    {form.cover_image_url && (() => {
                      const op = form.cover_overlay_opacity ?? 0.4;
                      const style = form.cover_overlay_style ?? "flat";
                      let bgValue = "#000000";
                      let opacityValue: number = op;
                      if (style === "gradient") {
                        bgValue = `linear-gradient(to bottom, rgba(0,0,0,${op * 0.15}) 0%, rgba(0,0,0,${op * 0.55}) 55%, rgba(0,0,0,${op}) 100%)`;
                        opacityValue = 1;
                      } else if (style === "gradient_diag") {
                        bgValue = `linear-gradient(135deg, rgba(0,0,0,${op * 0.2}) 0%, rgba(0,0,0,${op}) 100%)`;
                        opacityValue = 1;
                      } else if (style === "vignette") {
                        bgValue = `radial-gradient(ellipse at center, rgba(0,0,0,${op * 0.1}) 0%, rgba(0,0,0,${op * 0.5}) 70%, rgba(0,0,0,${op * 0.95}) 100%)`;
                        opacityValue = 1;
                      }
                      return <div className="pointer-events-none absolute inset-0" style={{ background: bgValue, opacity: opacityValue }} />;
                    })()}
                    {/* Decoro in alto a destra — FEDELE al PDF (CoverDecorationSvg):
                        rispetta cover_decoration_style e usa il colore del TESTO cover. */}
                    {form.cover_show_decoration !== false && (() => {
                      const v = form.cover_decoration_style ?? "square";
                      if (v === "none") return null;
                      const c = form.cover_text_color || "#FFFFFF";
                      return (
                        <svg viewBox="0 0 180 180" aria-hidden className="pointer-events-none absolute right-3 top-3 h-11 w-11">
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
                              {Array.from({ length: 25 }).map((_, i) => (
                                <circle key={i} cx={30 + (i % 5) * 30} cy={30 + Math.floor(i / 5) * 30} r={3} />
                              ))}
                            </g>
                          ) : (
                            <>
                              <g opacity={0.7} stroke={c} fill="none">
                                <rect x={20} y={20} width={140} height={140} rx={6} strokeWidth={3} />
                                <path d="M 90 25 L 90 155" strokeWidth={2} />
                                <path d="M 25 90 L 155 90" strokeWidth={2} />
                              </g>
                              <circle cx={84} cy={90} r={3} fill={c} opacity={0.7} />
                              <g opacity={0.3} stroke={c}>
                                <path d="M 0 90 L 18 90" strokeWidth={1.5} />
                                <path d="M 162 90 L 180 90" strokeWidth={1.5} />
                                <path d="M 90 0 L 90 18" strokeWidth={1.5} />
                                <path d="M 90 162 L 90 180" strokeWidth={1.5} />
                              </g>
                            </>
                          )}
                        </svg>
                      );
                    })()}
                    {/* Contenuto testuale */}
                    <div
                      className="absolute inset-0 flex flex-col p-4"
                      style={{
                        color: form.cover_text_color || "#FFFFFF",
                        textAlign: form.cover_text_align === "center" ? "center" : "left",
                        alignItems: form.cover_text_align === "center" ? "center" : "flex-start",
                      }}
                    >
                      {(form.cover_logo_position ?? "top_left") !== "hidden" && (
                        <div
                          className="mb-auto flex w-full items-center gap-2"
                          style={{
                            justifyContent: form.cover_logo_position === "top_right" ? "flex-end"
                              : form.cover_logo_position === "top_center" ? "center" : "flex-start",
                          }}
                        >
                          {(form.cover_logo_url ?? form.logo_url) ? (
                            <img width={28} height={28} loading="lazy" src={(form.cover_logo_url ?? form.logo_url) as string} alt="logo" className="h-7 w-7 rounded bg-white/10 object-contain p-0.5" />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">A</div>
                          )}
                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            {form.ragione_sociale || companyAnagrafica?.ragione_sociale ? "Azienda" : "Il tuo brand"}
                          </span>
                        </div>
                      )}
                      <div
                        className="mb-4 w-full"
                        style={{
                          marginTop: (form.cover_text_vertical ?? "bottom") === "top" ? 0 : "auto",
                          marginBottom: form.cover_text_vertical === "center" ? "auto" : "1rem",
                        }}
                      >
                        <div
                          className="mb-2 font-semibold uppercase tracking-wider"
                          style={{ color: form.color_primary || "#1E3A5F", fontSize: `${(form.cover_eyebrow_size ?? 11) * 0.6}px` }}
                        >
                          {form.cover_eyebrow || "★ La tua proposta personalizzata"}
                        </div>
                        <div
                          className="mb-1.5 whitespace-pre-wrap font-bold leading-tight"
                          style={{ fontSize: `${(form.cover_title_size ?? 30) * 0.5}px` }}
                        >
                          {form.cover_title || "Preventivo di tetti"}
                        </div>
                        <div className="line-clamp-2 opacity-80" style={{ fontSize: `${(form.cover_subtitle_size ?? 13) * 0.6}px` }}>
                          {form.cover_subtitle || "La tua casa, rinnovata chiavi in mano"}
                        </div>
                        {form.cover_show_client_card !== false && (
                          <div className="mt-3 rounded-md bg-white/10 p-2 text-left backdrop-blur-sm">
                            <div className="text-[8px] uppercase opacity-70">Preparato per</div>
                            <div className="text-xs font-semibold">Mario Rossi</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Anteprima approssimativa · il PDF finale può differire leggermente per tipografia.
                  </p>
                </div>

                {/* CONTROLLI */}
                <div className="col-span-12 space-y-3 md:col-span-7">
                  {/* Sfondo: opacità + stile overlay (con immagine) oppure colore (senza) */}
                  {form.cover_image_url ? (
                    <div className="space-y-2">
                      <div>
                        <Label className="mb-1 flex items-center justify-between text-xs">
                          <span>Opacità velo scuro sull'immagine</span>
                          <span className="font-mono text-muted-foreground">{Math.round((form.cover_overlay_opacity ?? 0.4) * 100)}%</span>
                        </Label>
                        <Slider
                          value={[form.cover_overlay_opacity ?? 0.4]}
                          min={0}
                          max={1}
                          step={0.05}
                          onValueChange={(v) => set("cover_overlay_opacity", v[0])}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs">Stile overlay</Label>
                        <div className="grid grid-cols-4 gap-1">
                          {([
                            { v: "flat", label: "Piatto", hint: "Nero uniforme" },
                            { v: "gradient", label: "Gradient ↓", hint: "Trasparente in alto, scuro in basso" },
                            { v: "gradient_diag", label: "Gradient ↘", hint: "Diagonale alto-sx → basso-dx" },
                            { v: "vignette", label: "Vignette", hint: "Centro chiaro, angoli scuri" },
                          ] as const).map((opt) => {
                            const isActive = (form.cover_overlay_style ?? "flat") === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                title={opt.hint}
                                onClick={() => set("cover_overlay_style", opt.v)}
                                className={cn(
                                  "rounded border px-1 py-1 text-[10px] transition-all",
                                  isActive ? "border-orange-500 bg-orange-500 font-semibold text-white" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
                                )}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Gradient migliora la leggibilità del testo su foto chiare.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Colore di sfondo cover</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.cover_bg_color || "#0F1B2A"}
                          onChange={(e) => set("cover_bg_color", e.target.value)}
                          className="h-8 w-12 cursor-pointer rounded border"
                        />
                        <Input
                          value={form.cover_bg_color ?? ""}
                          onChange={(e) => set("cover_bg_color", e.target.value || null)}
                          placeholder="#0F1B2A"
                          className="h-8 flex-1 font-mono text-xs"
                        />
                        {form.cover_bg_color && (
                          <Button size="sm" variant="ghost" onClick={() => set("cover_bg_color", null)} className="h-8 text-[11px]">
                            Reset
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Senza immagine, la cover usa questo colore pieno di sfondo.</p>
                    </div>
                  )}

                  {/* Posizione logo + colore testo */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Posizione logo</Label>
                      <select
                        value={form.cover_logo_position ?? "top_left"}
                        onChange={(e) => set("cover_logo_position", e.target.value as FormState["cover_logo_position"])}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="top_left">In alto a sinistra</option>
                        <option value="top_center">In alto al centro</option>
                        <option value="top_right">In alto a destra</option>
                        <option value="hidden">Nascosto</option>
                      </select>
                    </div>
                    <ColorField label="Colore testo copertina" value={form.cover_text_color} onChange={(v) => set("cover_text_color", v)} />
                  </div>

                  {/* Allineamento orizzontale + posizione verticale */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Allineamento titolo</Label>
                      <select
                        value={form.cover_text_align ?? "left"}
                        onChange={(e) => set("cover_text_align", e.target.value as FormState["cover_text_align"])}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="left">Sinistra</option>
                        <option value="center">Centro</option>
                        <option value="right">Destra</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Posizione testo (verticale)</Label>
                      <div className="grid grid-cols-3 gap-1">
                        {([
                          { v: "top", label: "↑ Alto", title: "Testo subito sotto al logo" },
                          { v: "center", label: "↕ Centro", title: "Testo centrato verticalmente" },
                          { v: "bottom", label: "↓ Basso", title: "Testo in fondo (default)" },
                        ] as const).map((opt) => {
                          const isActive = (form.cover_text_vertical ?? "bottom") === opt.v;
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              title={opt.title}
                              onClick={() => set("cover_text_vertical", opt.v)}
                              className={cn(
                                "h-9 rounded border text-[10px] font-semibold transition-all",
                                isActive ? "border-orange-500 bg-orange-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Dimensioni font: eyebrow / titolo / sottotitolo */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between text-[11px]">
                        <span>Eyebrow</span>
                        <span className="font-mono text-muted-foreground">{form.cover_eyebrow_size ?? 11} pt</span>
                      </Label>
                      <Slider value={[form.cover_eyebrow_size ?? 11]} min={8} max={20} step={1} onValueChange={(v) => set("cover_eyebrow_size", v[0])} className="mt-1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between text-[11px]">
                        <span>Titolo</span>
                        <span className="font-mono text-muted-foreground">{form.cover_title_size ?? 30} pt</span>
                      </Label>
                      <Slider value={[form.cover_title_size ?? 30]} min={20} max={48} step={1} onValueChange={(v) => set("cover_title_size", v[0])} className="mt-1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between text-[11px]">
                        <span>Sottotitolo</span>
                        <span className="font-mono text-muted-foreground">{form.cover_subtitle_size ?? 13} pt</span>
                      </Label>
                      <Slider value={[form.cover_subtitle_size ?? 13]} min={9} max={22} step={1} onValueChange={(v) => set("cover_subtitle_size", v[0])} className="mt-1" />
                    </div>
                  </div>

                  {/* Dimensione logo (solo se visibile) */}
                  {(form.cover_logo_position ?? "top_left") !== "hidden" && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between text-[11px]">
                        <span>Dimensione logo</span>
                        <span className="font-mono text-muted-foreground">{form.cover_logo_size ?? 100}%</span>
                      </Label>
                      <Slider value={[form.cover_logo_size ?? 100]} min={60} max={160} step={5} onValueChange={(v) => set("cover_logo_size", v[0])} className="mt-1" />
                    </div>
                  )}

                  {/* Elementi visibili: decorazione + card cliente */}
                  <div className="space-y-1.5">
                    <Label className="block text-[11px]">Elementi visibili</Label>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.cover_show_decoration !== false}
                        onChange={(e) => set("cover_show_decoration", e.target.checked)}
                        className="h-3.5 w-3.5 accent-orange-500"
                      />
                      Decorazione SVG (alto destra)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.cover_show_client_card !== false}
                        onChange={(e) => set("cover_show_client_card", e.target.checked)}
                        className="h-3.5 w-3.5 accent-orange-500"
                      />
                      Card "Preparato per" (cliente)
                    </label>
                  </div>

                  {/* Stile decorazione (solo se decorazione ON) */}
                  {form.cover_show_decoration !== false && (
                    <div className="space-y-1.5">
                      <Label className="block text-[11px]">Stile decorazione</Label>
                      <div className="grid grid-cols-5 gap-1">
                        {([
                          { v: "square", label: "⊞ Box", title: "Riquadro stilizzato (default)" },
                          { v: "circle", label: "◯ Cerchio", title: "Cerchi concentrici outline" },
                          { v: "line", label: "│ Linea", title: "Linea verticale + tick" },
                          { v: "pattern", label: "⋮⋮ Dots", title: "Pattern 5×5 dots geometrico" },
                          { v: "none", label: "✕ None", title: "Nessuna decorazione" },
                        ] as const).map((opt) => {
                          const isActive = (form.cover_decoration_style ?? "square") === opt.v;
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              title={opt.title}
                              onClick={() => set("cover_decoration_style", opt.v)}
                              className={cn(
                                "h-8 rounded border text-[10px] font-semibold transition-all",
                                isActive ? "border-orange-500 bg-orange-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
              <GalleryLavoriEditor
                items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
                onChange={(items) => set("gallery_lavori", items)}
                bucket="companies"
                uploadPath={`${companyId}/tetti/gallery`}
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
              </SectionCard>
              <SectionCard icon={Percent} title="Default economici" description="Valori precompilati sui nuovi preventivi tetti.">
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
                    <Input type="number" min={1} value={form.default_validita_giorni ?? 30} onChange={(e) => set("default_validita_giorni", Number(e.target.value))} />
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
      </div>
      <TettiTemplatePreviewDialog
        open={livePreviewOpen}
        onOpenChange={setLivePreviewOpen}
        template={previewTemplate}
        companyId={companyId}
        onOpenInTab={() => void handlePreview()}
      />

      {/* ── Dialog: genera testi con AI ──────────────────────────────── */}
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

      {/* ── Dialog: anteprima testi AI (rivedi/copia prima di applicare) ── */}
      <AiTemplateReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        draft={aiDraft}
        onApply={(d) => {
          applyGenerated(d);
          setReviewOpen(false);
          toast.success("Testi applicati al template", {
            description: "Rivedi le singole sezioni e salva.",
          });
        }}
      />

      {/* ── Dialog: galleria immagini stock (Unsplash free) per la cover ── */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="border-b p-4 pb-3">
            <DialogTitle className="text-base">📷 Galleria immagini stock</DialogTitle>
            <DialogDescription className="text-xs">
              Click su un'immagine per usarla come sfondo cover. Tutte le immagini sono
              libere da licenza (Unsplash) — uso commerciale incluso.
            </DialogDescription>
            <div className="flex flex-wrap gap-1 pt-2">
              {COVER_STOCK_CATEGORIE.map((cat) => {
                const isActive = stockCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setStockCategory(cat.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-all",
                      isActive ? "border-orange-500 bg-orange-500 font-semibold text-white" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {stockFiltered.map((img) => {
                const isActive = form?.cover_image_url === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => { set("cover_image_url", img.url); setStockDialogOpen(false); }}
                    className={cn(
                      "group relative aspect-[4/3] overflow-hidden rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-400",
                      isActive ? "border-orange-500 shadow-md ring-2 ring-orange-300" : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                    )}
                    title={img.label}
                  >
                    <img src={img.thumb} alt={img.label} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-[10px] font-semibold text-white">{img.label}</span>
                    </div>
                    {isActive && (
                      <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow">
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
              <p className="py-8 text-center text-sm text-muted-foreground">Nessuna immagine in questa categoria.</p>
            )}
          </div>
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
      const path = `${companyId}/tetti/template/${crypto.randomUUID()}.${ext}`;
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
  items: TetListItem[];
  onChange: (items: TetListItem[]) => void;
  addLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
}

function ListItemsEditor({ items, onChange, addLabel, titlePlaceholder, descPlaceholder }: ListItemsEditorProps) {
  const update = (idx: number, patch: Partial<TetListItem>) => {
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
function TestimonianzeEditor({ items, onChange }: { items: TetTestimonianza[]; onChange: (items: TetTestimonianza[]) => void }) {
  const update = (idx: number, patch: Partial<TetTestimonianza>) => {
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
function FaqEditor({ items, onChange }: { items: TetFaqItem[]; onChange: (items: TetFaqItem[]) => void }) {
  const update = (idx: number, patch: Partial<TetFaqItem>) => {
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
function CronoEditor({ items, onChange }: { items: TetCronoFase[]; onChange: (items: TetCronoFase[]) => void }) {
  const update = (idx: number, patch: Partial<TetCronoFase>) => {
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

export default TettiTemplateEditor;
