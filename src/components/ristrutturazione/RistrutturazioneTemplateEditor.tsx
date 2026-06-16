/**
 * RistrutturazioneTemplateEditor — editor del template PDF del verticale
 * Ristrutturazione (Task 20).
 *
 * Modellato su `SerramentiTemplateEditor` ma alla scala di `rst_template_pdf`
 * (un record/azienda, upsert via `useUpsertRstTemplatePdf`). Configura:
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
 * path `{company_id}/ristrutturazione/template/{uuid}.{ext}` → URL pubblico
 * stabile salvato nel template (ideale per il PDF, niente signed URL scaduti).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Save, Loader2, Upload, Image as ImageIcon, Plus, Trash2, GripVertical,
  Palette, FileText, Sparkles, ListChecks, Quote, Clock, Building2,
  Eye, EyeOff, BadgeEuro, AlertTriangle, FileSearch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { useRistrutturazionePDF } from "@/hooks/useRistrutturazionePDF";
import {
  useRstTemplatePdf,
  useUpsertRstTemplatePdf,
  useRstBackendReady,
  useEffectiveCompanyId,
  type RstTemplatePatch,
} from "@/hooks/useRistrutturazioneProgetto";
import type {
  RstTemplatePdf, RstListItem, RstTestimonianza, RstCronoFase,
  RstProgetto, RstComputoVoce,
} from "@/types/ristrutturazione";

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

// Stili copertina: combinano colore testo + opacità velo + posizione logo
// (campi già esistenti della copertina). Pura UI, nessun nuovo campo.
const COVER_PRESETS: Array<{ nome: string; cover_text_color: string; cover_overlay_opacity: number; cover_logo_position: "top_left" | "top_center" | "top_right" | "hidden" }> = [
  { nome: "Scuro elegante",  cover_text_color: "#FFFFFF", cover_overlay_opacity: 0.55, cover_logo_position: "top_left" },
  { nome: "Minimale chiaro", cover_text_color: "#FFFFFF", cover_overlay_opacity: 0.30, cover_logo_position: "top_center" },
  { nome: "Brand forte",     cover_text_color: "#FFFFFF", cover_overlay_opacity: 0.70, cover_logo_position: "top_left" },
  { nome: "Senza velo",      cover_text_color: "#0F172A", cover_overlay_opacity: 0.00, cover_logo_position: "top_right" },
];

// Forma del form locale: stesso shape del patch persistito.
type FormState = Required<Pick<RstTemplatePdf,
  | "logo_url" | "color_primary" | "color_secondary" | "color_accent" | "color_text"
  | "chi_siamo" | "chi_siamo_foto_url" | "esigenze" | "soluzione" | "usp"
  | "testimonianze" | "cronoprogramma" | "cover_title" | "cover_subtitle"
  | "cover_image_url" | "payment_terms_text" | "validity_text" | "footer_text"
  | "show_chi_siamo" | "show_cronoprogramma" | "show_margine"
  | "ragione_sociale" | "indirizzo_completo" | "telefono" | "email" | "partita_iva"
  | "font_family" | "show_footer_version" | "show_footer_legal"
  | "cover_logo_position" | "cover_text_color" | "cover_overlay_opacity"
>>;

function templateToForm(t: RstTemplatePdf): FormState {
  return {
    logo_url: t.logo_url ?? null,
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
  };
}

interface Props {
  /** Render dentro la tab Impostazioni (no padding/header extra di pagina). */
  embedded?: boolean;
}

export function RistrutturazioneTemplateEditor({ embedded = false }: Props) {
  const companyId = useEffectiveCompanyId();
  const { data: template, isLoading } = useRstTemplatePdf();
  const upsert = useUpsertRstTemplatePdf();
  // Probe: il modulo è pubblicato sul DB? Se no, l'editor mostra comunque i default
  // (vedi getRstTemplatePdf) + un banner, e il salvataggio segnala che serve pubblicare.
  const { data: backendReady } = useRstBackendReady();
  const { previewPDF, isGenerating: isPreviewing } = useRistrutturazionePDF();

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
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

  const handleSave = async () => {
    if (!form) return;
    const patch: RstTemplatePatch = { ...form };
    try {
      await upsert.mutateAsync(patch);
      setDirty(false);
      toast.success("Template salvato", {
        description: "Verrà applicato ai nuovi preventivi ristrutturazione.",
      });
    } catch (e) {
      toast.error("Salvataggio non riuscito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  // Anteprima dal vivo del PDF cliente: usa il template in editing + dati di
  // esempio. `previewPDF` non rilegge le tabelle rst_* (passiamo il template) →
  // funziona anche con il modulo non ancora pubblicato sul DB.
  const handlePreview = async () => {
    if (!form || !companyId) return;
    const template: RstTemplatePdf = { id: "preview", company_id: companyId, ...form };
    const row = (
      i: number, cap: string, descrizione: string,
      um: RstComputoVoce["unita_misura"], q: number, p: number, cm: number, cl: number,
    ): RstComputoVoce => ({
      id: String(i), progetto_id: "preview", company_id: companyId, capitolo_nome: cap, descrizione,
      unita_misura: um, quantita: q, prezzo_unitario: p, costo_materiali: cm, costo_manodopera: cl,
      sconto_pct: 0, importo: q * p, margine_eur: q * (p - cm - cl),
      margine_pct: p > 0 ? ((p - cm - cl) / p) * 100 : 0, listino_voce_id: null, ordine: i,
    });
    const progetto: RstProgetto = {
      id: "preview", company_id: companyId, code: "ANTEPRIMA", stato: "bozza",
      tipo_intervento: "Ristrutturazione completa",
      cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null, cliente_telefono: null,
      cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
      immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
      opportunita_id: null, cliente_id: null, template_id: null,
      sconto_pct: 0, iva_pct: 10, detrazione_pct: 50,
      totale_imponibile: 0, totale: 0, note: null,
    };
    const computo: RstComputoVoce[] = [
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
  type RstSection =
    | "brand"
    | "page_cover" | "page_chi_siamo" | "page_testimonianze" | "page_crono" | "page_condizioni"
    | "contenuti" | "opzioni";
  const RST_SECTION_GROUPS: Array<{
    label: string;
    items: Array<{ id: RstSection; label: string; emoji: string; descr?: string }>;
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
        { id: "page_testimonianze", label: "Testimonianze", emoji: "⭐", descr: "Recensioni clienti" },
        { id: "page_crono",         label: "Cronoprogramma", emoji: "📅", descr: "Fasi del cantiere" },
        { id: "page_condizioni",    label: "Condizioni",    emoji: "📄", descr: "Pagamenti e validità" },
      ],
    },
    {
      label: "DATI & CONTENUTI",
      items: [
        { id: "contenuti", label: "Contenuti",   emoji: "📝", descr: "Esigenze, soluzione, USP" },
        { id: "opzioni",   label: "Opzioni PDF", emoji: "⚙️", descr: "Visibilità documento" },
      ],
    },
  ];
  const RST_SECTIONS = RST_SECTION_GROUPS.flatMap((g) => g.items);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = (searchParams.get("section") ?? "brand") as RstSection;
  const activeSection: RstSection = RST_SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : ("brand" as RstSection);
  const setActiveSection = (id: RstSection) => {
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
            <p className="font-medium">Modulo Ristrutturazione non ancora pubblicato sul database</p>
            <p className="text-amber-800 dark:text-amber-300/90">
              Stai vedendo e modificando i valori predefiniti: l'editor è pienamente
              funzionante, ma il salvataggio sarà attivo solo dopo la pubblicazione del
              modulo (applicazione della migrazione sul database).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="col-span-12 md:col-span-3">
          <nav className="sticky top-[68px] rounded-lg border bg-card p-2 max-h-[calc(100vh-90px)] overflow-y-auto">
            {RST_SECTION_GROUPS.map((group, gi) => (
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
            {/* Footer sidebar: scorciatoia Anteprima PDF */}
            <div className="mt-3 pt-2 border-t">
              <Button
                type="button"
                onClick={() => void handlePreview()}
                disabled={isPreviewing}
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50 h-8"
              >
                {isPreviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
                Anteprima PDF
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Ragione sociale</Label>
                  <Input
                    value={form.ragione_sociale ?? ""}
                    onChange={(e) => set("ragione_sociale", e.target.value)}
                    placeholder="Es. Edil Rossi S.r.l."
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Indirizzo completo</Label>
                  <Input
                    value={form.indirizzo_completo ?? ""}
                    onChange={(e) => set("indirizzo_completo", e.target.value)}
                    placeholder="Es. Via Roma 42 · 20121 Milano (MI)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefono</Label>
                  <Input
                    value={form.telefono ?? ""}
                    onChange={(e) => set("telefono", e.target.value)}
                    placeholder="+39 02 1234 5678"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="info@azienda.it"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">P.IVA</Label>
                  <Input
                    value={form.partita_iva ?? ""}
                    onChange={(e) => set("partita_iva", e.target.value)}
                    placeholder="IT12345670156"
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
            <SectionCard icon={FileText} title="Copertina" description="Titolo, sottotitolo e immagine della prima pagina.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Titolo</Label>
                    <Input
                      value={form.cover_title ?? ""}
                      onChange={(e) => set("cover_title", e.target.value)}
                      placeholder="Preventivo di ristrutturazione"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sottotitolo</Label>
                    <Input
                      value={form.cover_subtitle ?? ""}
                      onChange={(e) => set("cover_subtitle", e.target.value)}
                      placeholder="La tua casa, rinnovata chiavi in mano"
                    />
                  </div>
                </div>
                <ImageUploadField
                  label="Immagine copertina"
                  hint="Foto orizzontale di un cantiere/render."
                  value={form.cover_image_url}
                  companyId={companyId}
                  onChange={(url) => set("cover_image_url", url)}
                  aspect="aspect-[16/9]"
                />
              </div>

              {/* Stili copertina: preset che impostano testo + velo + logo in un click */}
              <div className="mt-4 border-t pt-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  <Label className="text-xs font-medium">Stili copertina</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COVER_PRESETS.map((c) => {
                    const isActive =
                      form.cover_text_color === c.cover_text_color &&
                      form.cover_overlay_opacity === c.cover_overlay_opacity &&
                      form.cover_logo_position === c.cover_logo_position;
                    return (
                      <button
                        key={c.nome}
                        type="button"
                        onClick={() => {
                          set("cover_text_color", c.cover_text_color);
                          set("cover_overlay_opacity", c.cover_overlay_opacity);
                          set("cover_logo_position", c.cover_logo_position);
                        }}
                        aria-pressed={isActive}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:border-orange-300 hover:bg-orange-50",
                          isActive
                            ? "border-orange-400 bg-orange-50 ring-2 ring-orange-300"
                            : "border-input bg-background",
                        )}
                      >
                        {/* Mini-anteprima: rettangolo con velo + pallino colore testo */}
                        <span className="relative flex h-6 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-black/10 bg-gradient-to-br from-slate-300 to-slate-500">
                          <span className="absolute inset-0 bg-black" style={{ opacity: c.cover_overlay_opacity }} />
                          <span
                            className="relative h-2.5 w-2.5 rounded-full border border-black/20"
                            style={{ backgroundColor: c.cover_text_color }}
                          />
                        </span>
                        <span className="text-[11px] font-medium text-foreground">{c.nome}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Imposta colore testo, velo e posizione logo in modo coordinato.
                </p>
              </div>

              {/* Controlli avanzati copertina: posizione logo, colore testo, velo */}
              <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
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
                <ColorField
                  label="Colore testo copertina"
                  value={form.cover_text_color}
                  onChange={(v) => set("cover_text_color", v)}
                />
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Opacità velo scuro sull'immagine</Label>
                    <span className="text-xs font-mono text-muted-foreground">
                      {Math.round((form.cover_overlay_opacity ?? 0.4) * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[form.cover_overlay_opacity ?? 0.4]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => set("cover_overlay_opacity", v[0])}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Aumenta il velo per rendere il testo più leggibile su immagini chiare.
                  </p>
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

          {/* Testimonianze */}
          {activeSection === "page_testimonianze" && (
            <SectionCard icon={Quote} title="Testimonianze" description="Recensioni dei clienti mostrate nel PDF.">
              <TestimonianzeEditor
                items={form.testimonianze}
                onChange={(items) => set("testimonianze", items)}
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
      const path = `${companyId}/ristrutturazione/template/${crypto.randomUUID()}.${ext}`;
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
  items: RstListItem[];
  onChange: (items: RstListItem[]) => void;
  addLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
}

function ListItemsEditor({ items, onChange, addLabel, titlePlaceholder, descPlaceholder }: ListItemsEditorProps) {
  const update = (idx: number, patch: Partial<RstListItem>) => {
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
function TestimonianzeEditor({ items, onChange }: { items: RstTestimonianza[]; onChange: (items: RstTestimonianza[]) => void }) {
  const update = (idx: number, patch: Partial<RstTestimonianza>) => {
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

// ─── Cronoprogramma editor ────────────────────────────────────────────────────
function CronoEditor({ items, onChange }: { items: RstCronoFase[]; onChange: (items: RstCronoFase[]) => void }) {
  const update = (idx: number, patch: Partial<RstCronoFase>) => {
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

export default RistrutturazioneTemplateEditor;
