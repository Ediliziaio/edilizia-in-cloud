import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import {
  COLOR_PALETTES, DEFAULT_TEMPLATE, FONT_SIZE_PRESETS, LINE_HEIGHT_PRESETS,
  ROW_DENSITY_LABELS, TABLE_BORDERS_LABELS, HEADER_ALIGNMENT_LABELS,
  KIND_META, KIND_ORDER, blankTemplateForKind,
} from "@/types/quoteTemplate";
import type {
  QuoteTemplate, QuoteTemplateKind, LogoPosition, LogoSize,
  RowDensity, TableBorders, TextAlignment, ProductSpec,
} from "@/types/quoteTemplate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditorSafe as RichTextEditor } from "@/components/ui/rich-text-editor-safe";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Pencil, Star, Loader2, Upload, ImageIcon, Download, Copy, FileText, Eye,
  CheckCircle2, Palette, Wand2, FileImage, ScrollText, ArrowLeft, Save,
} from "lucide-react";
import { MergeTagInserter } from "@/components/quotes/MergeTagInserter";
import { CanvaColorPicker } from "@/components/quotes/CanvaColorPicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingBag } from "lucide-react";
// MP-IMP-001 Fase 3 — sezioni estratte in cartella dedicata
import {
  LAYOUTS, FONTS, DESIGN_PRESETS, ALLOWED_LOGO_TYPES,
} from "./SettingsQuoteTemplates/constants";
import {
  getLogoPublicUrl, kindColorHint, kindColorLabels, cnTab, getReferencingOffers,
} from "./SettingsQuoteTemplates/helpers";
import type {
  TemplateFormPayload, TemplateVisibilityKey,
} from "./SettingsQuoteTemplates/helpers";
import { ModuliVenditaPanel } from "./SettingsQuoteTemplates/ModuliVenditaPanel";
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
import { CONDIZIONI_STANDARD_MD } from "@/lib/condizioniStandard";
import { markdownSempliceToHtml, sembraMarkdown } from "@/lib/markdownSemplice";
import DOMPurify from "dompurify";

/** Corrispondenza tra i tre caratteri del PDF (pdf-lib standard) e i font del browser per l'anteprima. */
const FONT_CSS: Record<FontFamily, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: "'Times New Roman', Times, serif",
  courier: "'Courier New', Courier, monospace",
};
import {
  buildQuoteTemplatesTabParams,
  normalizeQuoteTemplatesParams,
  resolveQuoteTemplatesTopTab,
  type QuoteTemplatesTopTab,
} from "@/lib/settingsQuoteTemplatesRoute";

// MP-IMP-001 Fase 3: LAYOUTS / FONTS / DESIGN_PRESETS / TEMPLATE_ASSET_BUCKET /
// ALLOWED_LOGO_TYPES → ./SettingsQuoteTemplates/constants.ts
// getLogoPublicUrl / kindColor* / cnTab / quoteTemplateKind / getReferencingOffers
// + types → ./SettingsQuoteTemplates/helpers.ts

// ─── Sub-componente KindPreview (anteprima per blocchi non-offerta) ────────
function KindPreview({ form, kind }: { form: Partial<QuoteTemplate>; kind: QuoteTemplateKind }) {
  const meta = KIND_META[kind];
  const A4 = "w-[420px] aspect-[1/1.414] bg-white shadow-xl border border-slate-300 overflow-hidden flex flex-col";

  if (kind === 'copertina') {
    return (
      <div className={A4}>
        {form.cover_image_url ? (
          <div className="flex-1 bg-slate-100 overflow-hidden">
            <img loading="lazy" src={getLogoPublicUrl(form.cover_image_url)} alt="cover" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className={`flex-1 ${meta.bgColor} flex items-center justify-center`}>
            <ImageIcon className="h-16 w-16 text-pink-300" />
          </div>
        )}
        <div className="p-8 bg-white space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">{form.cover_title || "Titolo offerta"}</h2>
          <p className="text-sm text-slate-600">{form.cover_subtitle || "Sottotitolo / claim"}</p>
        </div>
      </div>
    );
  }

  if (kind === 'prodotto') {
    const specs: ProductSpec[] = (form.product_specs as ProductSpec[] | undefined) ?? [];
    return (
      <div className={A4 + " p-6"}>
        <div className="flex gap-4 mb-4">
          {form.product_image_url ? (
            <img loading="lazy" src={getLogoPublicUrl(form.product_image_url)} alt="" className="h-32 w-32 object-cover rounded-lg border" />
          ) : (
            <div className="h-32 w-32 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-emerald-300" />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-400">{form.product_category || "Prodotto"}</p>
            <h3 className="text-lg font-bold text-slate-900">{form.name || "Nome prodotto"}</h3>
            <p className="text-sm text-slate-600">{form.product_short_description || "Descrizione breve…"}</p>
            {form.product_indicative_price !== null && form.product_indicative_price !== undefined && (
              <p className="text-base font-semibold text-emerald-700 pt-1">
                €{Number(form.product_indicative_price).toFixed(2)}
                {form.product_unit ? ` / ${form.product_unit}` : ""}
              </p>
            )}
          </div>
        </div>
        {form.product_long_description && (
          <p className="text-xs text-slate-700 leading-relaxed mb-3">{form.product_long_description}</p>
        )}
        {specs.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Specifiche</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {specs.map((s, i) => (
                <div key={i} className="text-[11px] flex justify-between border-b border-slate-100 py-0.5">
                  <span className="text-slate-500">{s.label}</span>
                  <span className="text-slate-900 font-medium">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // condizioni / legali / sezione → anteprima formattata, col carattere del blocco
  const bodyRaw = form.body_html ?? "";
  const bodyHtml = sembraMarkdown(bodyRaw) ? markdownSempliceToHtml(bodyRaw) : bodyRaw;
  const fontCss = FONT_CSS[(form.font_family as FontFamily | undefined) ?? 'helvetica'] ?? FONT_CSS.helvetica;
  return (
    <div className={A4 + " p-8"}>
      <div className="border-b border-slate-200 pb-2 mb-4">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</p>
        <h2 className="text-lg font-bold text-slate-900 truncate">{form.name || `Nuovo ${meta.label}`}</h2>
      </div>
      {bodyHtml.trim() ? (
        <div
          className="anteprima-blocco text-[11px] leading-relaxed text-slate-800 overflow-hidden [&_h1]:text-[15px] [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h4]:text-[11px] [&_h4]:font-semibold [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold"
          style={{ fontFamily: fontCss }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml, { USE_PROFILES: { html: true } }) }}
        />
      ) : (
        <p className="text-[11px] italic text-slate-400">Il testo del blocco apparirà qui, formattato come nel PDF.</p>
      )}
    </div>
  );
}


// ─── Sub-componente ProductTemplateEditor (kind=prodotto) ───────────────────
interface ProductTemplateEditorProps {
  form: Partial<QuoteTemplate>;
  updateForm: (patch: Partial<QuoteTemplate>) => void;
  productImageInputRef: React.RefObject<HTMLInputElement>;
  productImageUploading: boolean;
  onProductImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function ProductTemplateEditor({ form, updateForm, productImageInputRef, productImageUploading, onProductImageUpload }: ProductTemplateEditorProps) {
  const specs: ProductSpec[] = (form.product_specs as ProductSpec[] | undefined) ?? [];
  const updateSpec = (idx: number, patch: Partial<ProductSpec>) => {
    const next = specs.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateForm({ product_specs: next });
  };
  const addSpec = () => updateForm({ product_specs: [...specs, { label: "", value: "" }] });
  const removeSpec = (idx: number) => updateForm({ product_specs: specs.filter((_, i) => i !== idx) });

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>🛒</span>
          Scheda prodotto
        </CardTitle>
        <p className="text-xs text-muted-foreground">Riusabile in più offerte. Le specifiche saranno mostrate in tabella.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Foto prodotto</Label>
          <div className="mt-1 flex items-start gap-3">
            <div className="h-24 w-24 shrink-0 rounded-lg border-2 border-dashed border-emerald-300 bg-white overflow-hidden flex items-center justify-center">
              {form.product_image_url ? (
                <img loading="lazy" src={getLogoPublicUrl(form.product_image_url)} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-emerald-300" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Button type="button" variant="outline" size="sm" onClick={() => productImageInputRef.current?.click()} disabled={productImageUploading} className="w-full gap-2">
                {productImageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {form.product_image_url ? "Sostituisci" : "Carica foto"}
              </Button>
              {form.product_image_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => updateForm({ product_image_url: null })} className="w-full text-red-600 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">PNG/JPG · max 5 MB</p>
            </div>
          </div>
          <input ref={productImageInputRef} type="file" accept="image/png,image/jpeg" onChange={onProductImageUpload} className="hidden" />
        </div>

        <div>
          <Label>Descrizione breve</Label>
          <Input value={form.product_short_description ?? ''} onChange={e => updateForm({ product_short_description: e.target.value })} placeholder="1 riga sintetica per la tabella" />
        </div>

        <div>
          <Label>Descrizione estesa</Label>
          <RichTextEditor
            value={form.product_long_description ?? ''}
            onChange={(html) => updateForm({ product_long_description: html })}
            placeholder="Dettagli, materiali, finitura, vantaggi…"
            minHeight={120}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Prezzo indicativo (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.product_indicative_price ?? ''}
              onChange={e => updateForm({ product_indicative_price: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0.00"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Solo orientativo, NON usato come prezzo del preventivo</p>
          </div>
          <div className="self-end text-[11px] text-muted-foreground pb-2.5">
            {form.product_indicative_price !== null && form.product_indicative_price !== undefined && form.product_unit
              ? `→ €${Number(form.product_indicative_price).toFixed(2)} / ${form.product_unit}`
              : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Specifiche tecniche</Label>
            <Button type="button" variant="outline" size="sm" onClick={addSpec} className="gap-1 h-7 text-[11px]">
              <Plus className="h-3 w-3" />Aggiungi spec
            </Button>
          </div>
          {specs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-3 py-2 border border-dashed rounded">Nessuna specifica. Aggiungi (es. Spessore: 3 cm)</p>
          ) : (
            <div className="space-y-1.5">
              {specs.map((spec, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input value={spec.label} onChange={e => updateSpec(idx, { label: e.target.value })} placeholder="Etichetta (es. Spessore)" className="flex-1" />
                  <Input value={spec.value} onChange={e => updateSpec(idx, { value: e.target.value })} placeholder="Valore (es. 3 cm)" className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(idx)} className="h-9 w-9 text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-componente TemplateCard (cards per kind) ──────────────────────────
interface TemplateCardProps {
  tmpl: QuoteTemplate;
  kindMeta: typeof KIND_META[QuoteTemplateKind];
  logoSrcFor: (t: Partial<QuoteTemplate>) => string | undefined;
  effectiveCompanyName?: string;
  templates: QuoteTemplate[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({ tmpl, kindMeta, logoSrcFor, effectiveCompanyName, templates, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const kind = (tmpl.kind as QuoteTemplateKind | undefined) ?? 'offerta';

  // Anteprima specifica per kind
  const renderPreview = () => {
    if (kind === 'offerta') {
      return <QuoteTemplatePreview template={tmpl} companyName={effectiveCompanyName} logoSrc={logoSrcFor(tmpl)} scale={0.2} />;
    }
    if (kind === 'copertina' && tmpl.cover_image_url) {
      return (
        <div className="aspect-[4/5] w-full max-w-[160px] rounded border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
          <img loading="lazy" src={getLogoPublicUrl(tmpl.cover_image_url)} alt="cover" className="w-full h-full object-cover" />
        </div>
      );
    }
    if (kind === 'prodotto' && tmpl.product_image_url) {
      return (
        <div className="aspect-square w-full max-w-[160px] rounded border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
          <img loading="lazy" src={getLogoPublicUrl(tmpl.product_image_url)} alt={tmpl.name} className="w-full h-full object-cover" />
        </div>
      );
    }
    // condizioni / legali / sezione → preview testo
    return (
      <div className={`aspect-[3/4] w-full max-w-[160px] rounded border ${kindMeta.borderColor} ${kindMeta.bgColor} p-3 overflow-hidden`}>
        <div className="text-[8px] leading-tight text-slate-700 line-clamp-[12]">
          {String(tmpl.body_html ?? tmpl.contractual_terms_text ?? tmpl.legal_terms_text ?? "(vuoto)").replace(/<[^>]+>/g, " ").replace(/^#{1,3}\s+/gm, "").replace(/\s+/g, " ").trim() || "(vuoto)"}
        </div>
      </div>
    );
  };

  // Preview info per kind
  const renderMeta = () => {
    if (kind === 'offerta') {
      const parts: string[] = [tmpl.layout];
      if (tmpl.linked_cover_id) parts.push("+ copertina");
      if (tmpl.linked_terms_id || tmpl.linked_legal_id) parts.push("+ condizioni e termini legali");
      const productCount = (tmpl.linked_product_ids ?? []).length;
      if (productCount > 0) parts.push(`+ ${productCount} ${productCount === 1 ? "prodotto" : "prodotti"}`);
      const sectionCount = (tmpl.linked_section_ids ?? []).length;
      if (sectionCount > 0) parts.push(`+ ${sectionCount} ${sectionCount === 1 ? "sezione" : "sezioni"}`);
      return parts.join(" · ");
    }
    if (kind === 'prodotto') {
      const price = tmpl.product_indicative_price;
      const cat = tmpl.product_category;
      const parts: string[] = [];
      if (cat) parts.push(cat);
      if (price !== null && price !== undefined) parts.push(`${Number(price).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${tmpl.product_unit ? `/${tmpl.product_unit}` : ""}`);
      return parts.join(" · ") || "Scheda prodotto";
    }
    if (kind === 'copertina') return "Pagina cover";
    if (kind === 'condizioni') return `Clausole + termini legali · ${tmpl.body_format ?? 'markdown'}`;
    if (kind === 'legali') return "Termini legali (vecchio tipo)";
    if (kind === 'sezione') return "Sezione libera";
    return kindMeta.label;
  };

  // Conteggio reverse: per blocchi (non-offerta), quante offerte le linkano?
  const usedByCount = useMemo(() => {
    if (kind === 'offerta') return 0;
    return templates.filter((t) =>
      ((t.kind as QuoteTemplateKind | undefined) ?? 'offerta') === 'offerta' && (
        t.linked_cover_id === tmpl.id ||
        t.linked_terms_id === tmpl.id ||
        t.linked_legal_id === tmpl.id ||
        (t.linked_product_ids ?? []).includes(tmpl.id) ||
        (t.linked_section_ids ?? []).includes(tmpl.id)
      ),
    ).length;
  }, [templates, tmpl.id, kind]);

  return (
    <Card className={`relative overflow-hidden border ${kindMeta.borderColor} hover:shadow-md transition-shadow`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-8 w-8 rounded ${kindMeta.bgColor} flex items-center justify-center text-base shrink-0`}>
              {kindMeta.emoji}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{tmpl.name}</p>
              <p className="text-xs text-muted-foreground truncate">{renderMeta()}</p>
            </div>
          </div>
          {tmpl.is_default && kind === 'offerta' && (
            <Badge variant="secondary" className="shrink-0"><Star className="h-3 w-3 mr-1" />Default</Badge>
          )}
          {usedByCount > 0 && (
            <Badge variant="outline" className="shrink-0 text-[10px]">{usedByCount} offerte</Badge>
          )}
        </div>
        <div className="flex justify-center">{renderPreview()}</div>
        {tmpl.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />Modifica
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplica">
            <Copy className="h-3 w-3" />
          </Button>
          {!(tmpl.is_default && kind === 'offerta') && (
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Elimina template" className="text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsQuoteTemplates() {
  const { role, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;
  const { templates, isLoading, fetchError, upsertTemplate, deleteTemplate } = useQuoteTemplates();

  // Deeplink: ?tab=moduli-vendita | documenti, ?modulo=serramenti
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  // Se ?modulo non è specificato → undefined → landing con grid card.
  // Solo se l'URL contiene un modulo esplicito apre l'editor di quel modulo.
  const moduloFromUrl = searchParams.get("modulo") ?? undefined;
  const topTab = resolveQuoteTemplatesTopTab(tabFromUrl, moduloFromUrl);

  useEffect(() => {
    const normalized = normalizeQuoteTemplatesParams(searchParams);
    if (normalized) {
      setSearchParams(normalized, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<QuoteTemplate>>(DEFAULT_TEMPLATE);
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<'cover' | 'detail'>('cover');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // Tab attiva nella libreria template (offerta | copertina | condizioni | ...)
  const [activeKind, setActiveKind] = useState<QuoteTemplateKind>('offerta');
  // Dialog "Scegli che tipo di template creare"
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // Kind correntemente in editing (deriva da form.kind, default offerta)
  const formKind: QuoteTemplateKind = (form.kind as QuoteTemplateKind | undefined) ?? 'offerta';

  // Conteggio template per ogni kind (per badge nelle tab)
  const countsByKind = useMemo(() => {
    const c: Record<QuoteTemplateKind, number> = {
      offerta: 0, copertina: 0, condizioni: 0, legali: 0, prodotto: 0, sezione: 0,
    };
    for (const t of templates) {
      const k = (t.kind as QuoteTemplateKind | undefined) ?? 'offerta';
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [templates]);

  const deleteTarget = useMemo(
    () => templates.find((t) => t.id === deleteConfirmId) ?? null,
    [templates, deleteConfirmId],
  );

  const deleteImpactOffers = useMemo(
    () => deleteTarget ? getReferencingOffers(deleteTarget, templates) : [],
    [deleteTarget, templates],
  );

  // Template filtrati per kind attivo nella libreria
  const filteredTemplates = useMemo(
    () => templates.filter((t) => ((t.kind as QuoteTemplateKind | undefined) ?? 'offerta') === activeKind),
    [templates, activeKind],
  );

  // Helper: lista template di un kind specifico (per i selettori del master Offerta)
  // Bug-fix: esclude il template attualmente in editing (no self-reference)
  // e i template inattivi (is_active=false) per evitare link a blocchi cestinati.
  const templatesByKind = useCallback(
    (k: QuoteTemplateKind) =>
      templates.filter(
        (t) =>
          ((t.kind as QuoteTemplateKind | undefined) ?? 'offerta') === k &&
          t.is_active !== false &&
          t.id !== editId,
      ),
    [templates, editId],
  );

  const updateForm = useCallback((patch: Partial<QuoteTemplate>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  }, []);

  useBeforeUnload(editing && (isDirty || upsertTemplate.isPending));

  const confirmDiscardChanges = useCallback(() => {
    if (!editing || !isDirty) return true;
    return window.confirm("Hai modifiche non salvate. Vuoi uscire senza salvarle?");
  }, [editing, isDirty]);

  const logoSrcFor = useCallback((tmpl: Partial<QuoteTemplate>) => (
    tmpl.logo_url ? getLogoPublicUrl(tmpl.logo_url) : undefined
  ), []);

  const designChecks = useMemo(() => [
    {
      label: "Nome riconoscibile",
      ok: (form.name?.trim().length ?? 0) >= 3,
    },
    {
      label: "Logo o scelta esplicita",
      ok: form.show_logo === false || !!form.logo_url,
    },
    {
      label: "Condizioni complete",
      ok: !!form.payment_terms_text?.trim() && !!form.delivery_terms_text?.trim(),
    },
    {
      label: "Tabella leggibile",
      ok: (form.font_size_base ?? 10) >= 9 && (form.line_height ?? 1.4) >= 1.3,
    },
    {
      label: "Footer cliente",
      ok: !!form.footer_text?.trim() || !!form.bank_details?.trim(),
    },
  ], [form]);

  const designScore = Math.round((designChecks.filter((c) => c.ok).length / designChecks.length) * 100);

  const applyDesignPreset = (patch: Partial<QuoteTemplate>) => {
    updateForm(patch);
    toast.success("Preset applicato", {
      description: "Controlla l'anteprima e salva quando il layout ti convince.",
    });
  };

  const openNewTemplate = useCallback((kind: QuoteTemplateKind) => {
    setEditId(null);
    setForm(blankTemplateForKind(kind));
    setIsDirty(false);
    setEditing(true);
  }, []);

  const handleNew = (kind: QuoteTemplateKind = activeKind) => {
    if (!confirmDiscardChanges()) return;
    openNewTemplate(kind);
  };

  const handleEdit = (tmpl: QuoteTemplate) => {
    if (!confirmDiscardChanges()) return;
    setEditId(tmpl.id);
    setForm({ ...tmpl });
    setIsDirty(false);
    setEditing(true);
  };

  const handleDuplicate = (tmpl: QuoteTemplate) => {
    if (!confirmDiscardChanges()) return;
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = tmpl;
    setEditId(null);
    setForm({ ...rest, name: `${tmpl.name} (copia)`, is_default: false });
    setIsDirty(true);
    setEditing(true);
  };

  const handleCancel = () => {
    if (!confirmDiscardChanges()) return false;
    setEditing(false);
    setEditId(null);
    setIsDirty(false);
    return true;
  };

  /**
   * Salva il template.
   * - asDefault=true: imposta come default e chiude (azione "Salva e usa default")
   * - asDefault=false (Salva bozza): salva senza chiudere, l'utente può continuare a modificare.
   *   Dopo il primo insert, editId viene aggiornato così i salvataggi successivi sono UPDATE.
   */
  const handleSave = async (asDefault = false): Promise<boolean> => {
    const templateName = form.name?.trim();
    if (!templateName) {
      toast.error("Inserisci un nome template");
      return false;
    }
    const payload: TemplateFormPayload = { ...form };
    payload.name = templateName;
    if (asDefault) payload.is_default = true;
    if (editId) payload.id = editId;
    if (!editId) delete payload.id;

    try {
      const result = await upsertTemplate.mutateAsync(payload);
      if (asDefault) {
        toast.success(editId ? "Template salvato come default" : "Template creato e impostato come default");
        setEditing(false);
        setEditId(null);
        setIsDirty(false);
      } else {
        // Salva bozza: resta in editor. Se era un nuovo template, ora abbiamo un id.
        toast.success(editId ? "Bozza salvata" : "Bozza creata");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newId = (result as any)?.id ?? (result as any)?.[0]?.id ?? null;
        if (!editId && newId) {
          setEditId(newId);
          setForm((prev) => ({ ...prev, id: newId }));
        }
        setIsDirty(false);
      }
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
      return false;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Template eliminato");
      if (editId === id) handleCancel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveCompany?.id) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error("Carica un logo PNG o JPG");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${effectiveCompany.id}/template-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quote-template-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      updateForm({ logo_url: path });
      toast.success("Logo caricato");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento logo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const [coverUploading, setCoverUploading] = useState(false);
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveCompany?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error("Carica un'immagine PNG o JPG");
      e.target.value = "";
      return;
    }
    setCoverUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${effectiveCompany.id}/template-cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quote-template-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      updateForm({ cover_image_url: path, show_cover_image: true });
      toast.success("Copertina caricata");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento copertina");
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  };

  // Refs per merge tag (inserimento alla posizione cursore)
  const coverTitleRef = useRef<HTMLInputElement>(null);
  const coverSubtitleRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLTextAreaElement>(null);
  const deliveryRef = useRef<HTMLTextAreaElement>(null);
  const contractualRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const bodyHtmlRef = useRef<HTMLTextAreaElement>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);

  // Upload immagine prodotto (riusa bucket quote-template-assets)
  const [productImageUploading, setProductImageUploading] = useState(false);
  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveCompany?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error("Carica un'immagine PNG o JPG");
      e.target.value = "";
      return;
    }
    setProductImageUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${effectiveCompany.id}/template-product-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quote-template-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      updateForm({ product_image_url: path });
      toast.success("Immagine prodotto caricata");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore caricamento immagine");
    } finally {
      setProductImageUploading(false);
      e.target.value = "";
    }
  };

  const applyPalette = (p: typeof COLOR_PALETTES[number]) => {
    updateForm({
      primary_color: p.primary,
      secondary_color: p.secondary,
      accent_color: p.accent,
      header_text_color: p.headerText,
    });
  };

  if (isLoading && topTab !== "moduli-vendita") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs
      value={topTab}
      onValueChange={(v) =>
        setSearchParams((prev) => buildQuoteTemplatesTabParams(prev, v as QuoteTemplatesTopTab), { replace: true })
      }
      className="space-y-4"
    >
      <TabsList className="bg-slate-100">
        <TabsTrigger value="documenti" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Template documenti
        </TabsTrigger>
        <TabsTrigger value="moduli-vendita" className="gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5" />
          Template Moduli Vendita
        </TabsTrigger>
      </TabsList>

      <TabsContent value="moduli-vendita" className="space-y-4">
        <ModuliVenditaPanel initialModulo={moduloFromUrl} />
      </TabsContent>

      <TabsContent value="documenti" className="space-y-6 mt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Libreria Template Preventivi</h1>
            <p className="text-sm text-muted-foreground">
              Crea e gestisci blocchi riusabili: copertine, condizioni, schede prodotto, sezioni libere.
              I template "Offerta" li compongono in un PDF unico.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && templates.length > 0 && (
            <Badge variant="outline" className="gap-1 text-[11px] h-6">
              <Eye className="h-3 w-3" />
              {templates.length} totali
            </Badge>
          )}
          {editing && formKind === 'offerta' && (
            <Badge variant={designScore >= 80 ? "secondary" : "outline"} className="gap-1 text-[11px] h-6">
              <CheckCircle2 className="h-3 w-3" />
              Qualità layout {designScore}%
            </Badge>
          )}
          {isAdmin && !editing && (
            <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500">
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo template
            </Button>
          )}
        </div>
      </div>

      {/* Tabs per kind (solo in modalità lista) */}
      {!editing && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-0">
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const count = countsByKind[k] ?? 0;
            const isActive = activeKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActiveKind(k)}
                className={cnTab(isActive, meta.color, meta.borderColor, meta.bgColor)}
              >
                <span className="text-base">{meta.emoji}</span>
                <span>{meta.label}</span>
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/80 text-slate-700" : "bg-slate-200 text-slate-600"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!editing ? (
        /* Template list filtrata per kind attivo */
        fetchError ? (
          <Card className="p-8 text-center">
            <p className="text-destructive font-medium">Errore nel caricamento dei template</p>
            <p className="text-sm text-muted-foreground mt-1">{(fetchError as Error).message}</p>
          </Card>
        ) : !isLoading && filteredTemplates.length === 0 ? (
          <Card className={`p-8 text-center space-y-3 ${KIND_META[activeKind].borderColor} ${KIND_META[activeKind].bgColor}/30`}>
            <div className="text-4xl">{KIND_META[activeKind].emoji}</div>
            <div>
              <p className={`font-semibold ${KIND_META[activeKind].color}`}>
                Nessun {KIND_META[activeKind].label.toLowerCase()} ancora
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                {KIND_META[activeKind].description}
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => handleNew(activeKind)} className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500">
                <Plus className="h-4 w-4 mr-2" />Crea il primo
              </Button>
            )}
            {isAdmin && activeKind === 'condizioni' && (
              <div className="pt-1 text-xs text-muted-foreground">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    if (!confirmDiscardChanges()) return;
                    openNewTemplate('condizioni');
                    // il form nuovo è vuoto: il modello standard va messo subito dopo
                    setTimeout(() => updateForm({ body_html: markdownSempliceToHtml(CONDIZIONI_STANDARD_MD), body_format: 'html' }), 60);
                  }}
                >
                  Parti dal modello standard
                </Button>
                <span> · oppure, nell'editor, importa le tue condizioni da PDF o Word: l'AI le riordina.</span>
              </div>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setCreateDialogOpen(true)} size="sm" className="ml-2">
                Vedi tutti i tipi
              </Button>
            )}
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(tmpl => (
            <TemplateCard
              key={tmpl.id}
              tmpl={tmpl}
              kindMeta={KIND_META[((tmpl.kind as QuoteTemplateKind | undefined) ?? 'offerta')]}
              logoSrcFor={logoSrcFor}
              effectiveCompanyName={effectiveCompany?.name}
              templates={templates}
              onEdit={() => handleEdit(tmpl)}
              onDuplicate={() => handleDuplicate(tmpl)}
              onDelete={() => setDeleteConfirmId(tmpl.id)}
            />
          ))}
        </div>
        )
      ) : (
        /* Editor with preview */
        <div className="space-y-3">
          {/* Sticky toolbar: ← Indietro · breadcrumb · Salva bozza · Salva e usa */}
          <div className="sticky top-0 z-30 -mx-2 px-2 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="gap-1.5 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <span className="text-slate-300 text-sm shrink-0">/</span>
              <span className={`text-sm font-medium ${KIND_META[formKind].color} flex items-center gap-1 shrink-0`}>
                <span>{KIND_META[formKind].emoji}</span>
                {KIND_META[formKind].label}
              </span>
              <span className="text-slate-300 text-sm shrink-0">·</span>
              <span className="text-sm font-semibold text-slate-900 truncate">{form.name || "Senza nome"}</span>
              {editId && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">Modifica</Badge>
              )}
              {!editId && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0 bg-orange-50 text-orange-700 border-orange-200">Bozza</Badge>
              )}
              {isDirty && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                  Modifiche non salvate
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={upsertTemplate.isPending}
                title="Salva senza chiudere"
              >
                {upsertTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salva bozza
              </Button>
              {formKind === 'offerta' && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={upsertTemplate.isPending}
                  className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 gap-1.5"
                >
                  <Star className="h-3.5 w-3.5" />
                  Salva e usa default
                </Button>
              )}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: form */}
          <div className="lg:col-span-3 space-y-6 overflow-auto max-h-[calc(100vh-200px)] pr-2">
            {formKind === 'offerta' && (
            <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-background to-orange-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Design assistant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {DESIGN_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyDesignPreset(preset.patch)}
                      className="rounded-lg border border-border bg-background/80 p-3 text-left transition-all hover:border-primary hover:bg-primary/5"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Palette className="h-3.5 w-3.5 text-primary" />
                        {preset.name}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{preset.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Checklist impaginazione</p>
                    <span className="text-xs font-semibold text-primary">{designScore}%</span>
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {designChecks.map((check) => (
                      <div key={check.label} className="flex items-center gap-2 text-xs">
                        <span className={`h-2 w-2 rounded-full ${check.ok ? "bg-emerald-500" : "bg-amber-400"}`} />
                        <span className={check.ok ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {/* A: Info base — comune a tutti i kind */}
            <Card className={`border ${KIND_META[formKind].borderColor}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-base">{KIND_META[formKind].emoji}</span>
                  Informazioni Base — {KIND_META[formKind].label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{KIND_META[formKind].description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.name || ''} onChange={e => updateForm({ name: e.target.value })} placeholder={`Es. ${KIND_META[formKind].label} aziendale`} />
                </div>
                <div>
                  <Label>Descrizione (interna)</Label>
                  <Input value={form.description ?? ''} onChange={e => updateForm({ description: e.target.value })} placeholder="A cosa serve questo template (es. ritrutturazioni, serramenti…)" />
                </div>
                {formKind === 'offerta' && (
                  <div className="flex items-center gap-3">
                    <Switch checked={form.is_default ?? false} onCheckedChange={v => updateForm({ is_default: v })} />
                    <Label>Imposta come template di default per nuovi preventivi</Label>
                  </div>
                )}
                {formKind === 'prodotto' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Categoria</Label>
                      <Input value={form.product_category ?? ''} onChange={e => updateForm({ product_category: e.target.value })} placeholder="Es. Serramenti, Pavimenti…" />
                    </div>
                    <div>
                      <Label>Unità di misura</Label>
                      <Input value={form.product_unit ?? ''} onChange={e => updateForm({ product_unit: e.target.value })} placeholder="mq, pz, ml, h…" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* COMPOSITORE OFFERTA: solo per kind=offerta — selettori dei blocchi linkati */}
            {formKind === 'offerta' && (
              <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 to-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-orange-600" />
                    Componi l'offerta
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Scegli quali blocchi della libreria includere nel PDF. Vai nelle altre tab per crearli.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <BlockLinkSelector
                    label="🎨 Copertina"
                    value={form.linked_cover_id ?? null}
                    options={templatesByKind('copertina')}
                    onChange={(id) => updateForm({ linked_cover_id: id })}
                    onCreate={() => {
                      if (!handleCancel()) return;
                      setActiveKind('copertina');
                      setTimeout(() => openNewTemplate('copertina'), 50);
                    }}
                  />
                  <BlockLinkSelector
                    label="📜 Condizioni e termini legali"
                    value={form.linked_terms_id ?? form.linked_legal_id ?? null}
                    // I vecchi blocchi "legali" restano selezionabili qui: è lo stesso posto nel PDF.
                    options={[...templatesByKind('condizioni'), ...templatesByKind('legali')]}
                    onChange={(id) => {
                      // Il DB valida il tipo per colonna: un vecchio blocco "legali" va in linked_legal_id.
                      const eLegacyLegali = !!id && templatesByKind('legali').some((t) => t.id === id);
                      updateForm(eLegacyLegali ? { linked_legal_id: id, linked_terms_id: null } : { linked_terms_id: id, linked_legal_id: null });
                    }}
                    onCreate={() => {
                      if (!handleCancel()) return;
                      setActiveKind('condizioni');
                      setTimeout(() => openNewTemplate('condizioni'), 50);
                    }}
                  />
                  <MultiBlockSelector
                    label="🛒 Schede prodotto da includere"
                    values={form.linked_product_ids ?? []}
                    options={templatesByKind('prodotto')}
                    onChange={(ids) => updateForm({ linked_product_ids: ids })}
                  />
                  <MultiBlockSelector
                    label="✨ Sezioni libere"
                    values={form.linked_section_ids ?? []}
                    options={templatesByKind('sezione')}
                    onChange={(ids) => updateForm({ linked_section_ids: ids })}
                  />
                </CardContent>
              </Card>
            )}

            {/* COPERTINA: campi specifici quando kind=copertina */}
            {formKind === 'copertina' && (
              <Card className="border-pink-200 bg-pink-50/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-pink-600" />
                    Contenuto copertina
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Apparirà come prima pagina del PDF dell'offerta. Supporta merge tag.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Immagine copertina</Label>
                    <div className="mt-1 flex items-start gap-3">
                      <div className="h-24 w-24 shrink-0 rounded-lg border-2 border-dashed border-pink-300 bg-white overflow-hidden flex items-center justify-center">
                        {form.cover_image_url ? (
                          <img loading="lazy" src={getLogoPublicUrl(form.cover_image_url)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-pink-300" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => coverFileInputRef.current?.click()} disabled={coverUploading} className="w-full gap-2">
                          {coverUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {form.cover_image_url ? "Sostituisci immagine" : "Carica immagine"}
                        </Button>
                        {form.cover_image_url && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => updateForm({ cover_image_url: null })} className="w-full text-red-600 hover:text-red-700">
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                          </Button>
                        )}
                        <p className="text-[10px] text-muted-foreground">PNG/JPG · max 5 MB · ottimale 1200×800</p>
                      </div>
                    </div>
                    <input ref={coverFileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleCoverUpload} className="hidden" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Titolo copertina</Label>
                      <MergeTagInserter targetRef={coverTitleRef} currentValue={form.cover_title ?? ""} onInsert={(v) => updateForm({ cover_title: v })} />
                    </div>
                    <Input ref={coverTitleRef} value={form.cover_title ?? ''} onChange={e => updateForm({ cover_title: e.target.value })} placeholder="Es. Offerta personalizzata per {{cliente.nome_completo}}" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Sottotitolo / claim</Label>
                      <MergeTagInserter targetRef={coverSubtitleRef} currentValue={form.cover_subtitle ?? ""} onInsert={(v) => updateForm({ cover_subtitle: v })} />
                    </div>
                    <Input ref={coverSubtitleRef} value={form.cover_subtitle ?? ''} onChange={e => updateForm({ cover_subtitle: e.target.value })} placeholder="Es. Cantiere {{cantiere.indirizzo}} — {{data.oggi}}" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CONDIZIONI / LEGALI / SEZIONE: rich text body multi-pagina */}
            {(formKind === 'condizioni' || formKind === 'legali' || formKind === 'sezione') && (
              <Card className={`border ${KIND_META[formKind].borderColor}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>{KIND_META[formKind].emoji}</span>
                    Contenuto {KIND_META[formKind].label.toLowerCase()}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Testo multi-pagina (markdown). Supporta merge tag come <code className="text-[10px] bg-white border px-1 rounded">{`{{cliente.nome}}`}</code>.
                    Il PDF inserirà page break automatici.
                  </p>
                  {(formKind === 'condizioni' || formKind === 'legali') && (
                    <div className="mt-3 rounded-md border border-orange-200 bg-orange-50/50 px-3 py-2 text-xs text-orange-950">
                      Questo blocco è condiviso: dopo il salvataggio potrai inserirlo anche nei template serramenti dalla sezione
                      <span className="font-semibold"> Condizioni e disclaimer</span>. Lo stesso testo creato nei serramenti può essere salvato qui e riusato nei preventivi standard.
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {formKind === 'condizioni' && (
                    <ImportaCondizioniBar
                      companyId={effectiveCompany?.id}
                      testoAttuale={form.body_html ?? ""}
                      onTesto={(md) => updateForm({ body_html: markdownSempliceToHtml(md), body_format: 'html' })}
                    />
                  )}
                  {/* Carattere del blocco: nel PDF vale per questa sezione (default: quello del master) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Carattere</Label>
                    {FONTS.map(f => (
                      <Button
                        key={f.key}
                        type="button"
                        variant={(form.font_family ?? 'helvetica') === f.key ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateForm({ font_family: f.key })}
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Testo (titoli, grassetto, elenchi come negli altri template)</Label>
                      <MergeTagInserter targetRef={bodyHtmlRef} currentValue={form.body_html ?? ""} onInsert={(v) => updateForm({ body_html: v, body_format: 'html' })} />
                    </div>
                    <RichTextEditor
                      value={sembraMarkdown(form.body_html ?? "") ? markdownSempliceToHtml(form.body_html ?? "") : (form.body_html ?? "")}
                      onChange={(html) => updateForm({ body_html: html, body_format: 'html' })}
                      placeholder={
                        formKind === 'condizioni'
                          ? "Condizioni contrattuali: oggetto, prezzi e pagamenti, tempi, varianti, garanzia… poi termini legali: privacy, recesso, foro. Usa i titoli per le sezioni e {{cliente.nome_completo}}, {{azienda.ragione_sociale}} per i dati che cambiano."
                          : "Contenuto della sezione (es. Chi siamo, Garanzie, Come lavoriamo)…"
                      }
                      minHeight={360}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PRODOTTO: scheda prodotto */}
            {formKind === 'prodotto' && (
              <ProductTemplateEditor
                form={form}
                updateForm={updateForm}
                productImageInputRef={productImageInputRef}
                productImageUploading={productImageUploading}
                onProductImageUpload={handleProductImageUpload}
              />
            )}

            {/* Le sezioni Layout/Logo/Palette/Tipografia/Tabella/Margini/Elementi/Testi
                e Termini contrattuali/legali sono SOLO per kind=offerta (estetica
                generale dell'offerta master). I blocchi standalone hanno editor focalizzati. */}
            {/* SOLO offerta: Layout master */}
            {formKind === 'offerta' && (
            <>
            {/* B: Layout */}
            <Card>
              <CardHeader><CardTitle className="text-base">Layout</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {LAYOUTS.map(l => (
                    <button
                      key={l.key}
                      onClick={() => updateForm({ layout: l.key })}
                      className={`border rounded-lg p-3 text-center text-sm transition-all hover:border-primary ${
                        form.layout === l.key ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="mb-2 flex justify-center">
                        <QuoteTemplatePreview template={{ ...form, layout: l.key }} companyName={effectiveCompany?.name} logoSrc={logoSrcFor(form)} scale={0.08} />
                      </div>
                      <p className="font-medium">{l.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{l.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            </>
            )}

            {/* PERSONALIZZAZIONE UNIVERSALE — Logo + Palette + Tipografia
                disponibili per ogni kind (Canva-style). Per kind=prodotto/sezione
                il "logo" viene usato come watermark/header se attivato. */}

            {/* C: Logo */}
            <Card>
              <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch checked={form.show_logo ?? true} onCheckedChange={v => updateForm({ show_logo: v })} />
                  <Label>Mostra logo nel PDF</Label>
                </div>
                {form.show_logo && (
                  <>
                    <div>
                      <Label className="text-sm text-muted-foreground mb-2 block">Carica logo specifico (PNG/JPG, max 2MB)</Label>
                      <div className="flex items-center gap-3">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                          <Upload className="h-4 w-4" />
                          {uploading ? "Caricamento..." : "Scegli file"}
                          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                        </label>
                        {form.logo_url && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => updateForm({ logo_url: null })}>
                            <Trash2 className="h-4 w-4 mr-1" />Rimuovi
                          </Button>
                        )}
                      </div>
                      {form.logo_url && (
                        <div className="mt-3 flex items-center gap-3">
                          <img width={80} height={80} loading="lazy"
                            src={getLogoPublicUrl(form.logo_url)}
                            alt="Logo template"
                            className="h-20 w-20 rounded-lg border border-border object-contain bg-muted/50 p-1"
                          />
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{form.logo_url.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm">Posizione</Label>
                        <div className="flex gap-2 mt-1">
                          {(['left', 'center', 'right'] as LogoPosition[]).map(pos => (
                            <Button key={pos} variant={form.logo_position === pos ? 'default' : 'outline'} size="sm" onClick={() => updateForm({ logo_position: pos })}>
                              {pos === 'left' ? 'Sinistra' : pos === 'center' ? 'Centro' : 'Destra'}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">Dimensione</Label>
                        <div className="flex gap-2 mt-1">
                          {(['small', 'medium', 'large'] as LogoSize[]).map(sz => (
                            <Button key={sz} variant={form.logo_size === sz ? 'default' : 'outline'} size="sm" onClick={() => updateForm({ logo_size: sz })}>
                              {sz === 'small' ? 'Piccola' : sz === 'medium' ? 'Media' : 'Grande'}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* D: Palette colori — Canva style con preset + custom HEX + recenti */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4 text-orange-500" />
                  Palette colori
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {kindColorHint(formKind)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick palette: applica tutti i 4 colori in un click */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Palette pronte</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {COLOR_PALETTES.map(p => {
                      const isActive = form.primary_color === p.primary && form.accent_color === p.accent;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => applyPalette(p)}
                          className={`group relative rounded-lg p-2 transition-all hover:scale-[1.03] hover:shadow-md ${
                            isActive ? 'ring-2 ring-orange-500 shadow-md' : 'border border-slate-200 hover:border-slate-300'
                          }`}
                          title={p.name}
                        >
                          <div className="flex gap-0.5 mb-1.5 justify-center">
                            <div className="h-5 w-5 rounded-l" style={{ backgroundColor: p.primary }} />
                            <div className="h-5 w-5" style={{ backgroundColor: p.secondary }} />
                            <div className="h-5 w-5 rounded-r" style={{ backgroundColor: p.accent }} />
                          </div>
                          <p className="text-[10px] text-slate-600 truncate text-center">{p.name}</p>
                          {isActive && (
                            <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-orange-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom colors: 5 picker Canva-style con label kind-aware */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Personalizza ogni colore</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {kindColorLabels(formKind).map((c) => (
                      <CanvaColorPicker
                        key={c.key}
                        label={c.label}
                        hint={c.hint}
                        value={(form[c.key] as string) || '#000000'}
                        onChange={(hex) => updateForm({ [c.key]: hex })}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* La tipografia completa (dimensioni, interlinea) vale per il master: i blocchi scelgono solo il carattere accanto al testo */}
            {formKind === 'offerta' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tipografia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Font family */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Famiglia font</Label>
                  <div className="flex gap-2 flex-wrap">
                    {FONTS.map(f => (
                      <Button
                        key={f.key}
                        variant={form.font_family === f.key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateForm({ font_family: f.key })}
                      >
                        {f.label}
                        <span className="ml-1.5 text-[10px] opacity-70">{f.desc}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Font size base */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Dimensione testo corpo</Label>
                    <span className="text-xs font-mono font-semibold">{form.font_size_base ?? 10} pt</span>
                  </div>
                  <input
                    type="range"
                    min={7}
                    max={16}
                    step={1}
                    value={form.font_size_base ?? 10}
                    onChange={(e) => updateForm({ font_size_base: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {FONT_SIZE_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        variant={(form.font_size_base ?? 10) === p.value ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => updateForm({ font_size_base: p.value })}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Heading scale */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Scala titoli</Label>
                    <span className="text-xs font-mono font-semibold">
                      ×{(form.heading_size_scale ?? 1.6).toFixed(2)}
                      <span className="opacity-60 ml-1">
                        ≈ {Math.round((form.font_size_base ?? 10) * (form.heading_size_scale ?? 1.6))} pt
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={3.0}
                    step={0.1}
                    value={form.heading_size_scale ?? 1.6}
                    onChange={(e) => updateForm({ heading_size_scale: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Line height */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Altezza riga</Label>
                    <span className="text-xs font-mono font-semibold">{(form.line_height ?? 1.4).toFixed(2)}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {LINE_HEIGHT_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        variant={(form.line_height ?? 1.4) === p.value ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => updateForm({ line_height: p.value })}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Header alignment */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Allineamento testo header/titoli</Label>
                  <div className="flex gap-2">
                    {(['left', 'center', 'right'] as TextAlignment[]).map((a) => (
                      <Button
                        key={a}
                        variant={(form.header_alignment ?? 'left') === a ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateForm({ header_alignment: a })}
                      >
                        {HEADER_ALIGNMENT_LABELS[a]}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {/* SOLO offerta: Tabella voci + Margini + Elementi + Testi inline */}
            {formKind === 'offerta' && (
            <>
            {/* E-bis: Layout tabella */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tabella voci</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Row density */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Densità righe</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(ROW_DENSITY_LABELS) as RowDensity[]).map((d) => {
                      const cfg = ROW_DENSITY_LABELS[d];
                      const active = (form.row_density ?? 'normal') === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => updateForm({ row_density: d })}
                          className={`border rounded-lg p-3 text-center transition-all hover:border-primary ${
                            active ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border'
                          }`}
                        >
                          <p className="text-sm font-medium">{cfg.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Table borders */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Bordi tabella</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['none', 'horizontal', 'all'] as TableBorders[]).map((b) => (
                      <Button
                        key={b}
                        variant={(form.table_borders ?? 'horizontal') === b ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateForm({ table_borders: b })}
                      >
                        {TABLE_BORDERS_LABELS[b]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Zebra */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Righe alternate (zebra)</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Righe pari con sfondo grigio chiaro, più facile da leggere su tabelle lunghe.
                    </p>
                  </div>
                  <Switch
                    checked={form.table_zebra ?? true}
                    onCheckedChange={(v) => updateForm({ table_zebra: v })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* E-ter: Pagina */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margini pagina</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Margine laterale</Label>
                    <span className="text-xs font-mono font-semibold">{form.page_margin_mm ?? 18} mm</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={30}
                    step={1}
                    value={form.page_margin_mm ?? 18}
                    onChange={(e) => updateForm({ page_margin_mm: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Margini minori → più contenuto per pagina. Margini maggiori → PDF più elegante e arieggiato.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* F: Elements */}
            <Card>
              <CardHeader><CardTitle className="text-base">Elementi da Mostrare</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'show_quote_number' as const, label: 'Numero offerta' },
                  { key: 'show_validity_date' as const, label: 'Data di validità' },
                  { key: 'show_company_details' as const, label: 'Dati azienda emittente' },
                  { key: 'show_client_details' as const, label: 'Dati cliente' },
                  { key: 'show_payment_terms' as const, label: 'Termini di pagamento' },
                  { key: 'show_delivery_terms' as const, label: 'Condizioni di consegna' },
                  { key: 'show_notes' as const, label: 'Note per il cliente' },
                  { key: 'show_page_numbers' as const, label: 'Numerazione pagine' },
                ].map((el: { key: TemplateVisibilityKey; label: string }) => (
                  <div key={el.key} className="flex items-center gap-3">
                    <Switch checked={form[el.key] ?? true} onCheckedChange={v => updateForm({ [el.key]: v })} />
                    <Label>{el.label}</Label>
                  </div>
                ))}
                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.show_watermark ?? false} onCheckedChange={v => updateForm({ show_watermark: v })} />
                    <Label>Watermark</Label>
                  </div>
                  {form.show_watermark && (
                    <Input value={form.watermark_text || ''} onChange={e => updateForm({ watermark_text: e.target.value })} placeholder="OFFERTA RISERVATA" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* COVER: Copertina personalizzata */}
            <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 via-background to-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-orange-600" />
                  Copertina personalizzata
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Immagine + titolo che appaiono come prima pagina del PDF. Supporta merge tag come <code className="text-[10px] bg-white px-1 rounded border">{`{{cliente.nome}}`}</code>.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-white px-3 py-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Mostra copertina</Label>
                    <p className="text-[11px] text-muted-foreground">Aggiunge una pagina cover prima del preventivo</p>
                  </div>
                  <Switch checked={!!form.show_cover_image} onCheckedChange={(v) => updateForm({ show_cover_image: v })} />
                </div>

                {form.show_cover_image && (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Immagine di copertina</Label>
                      <div className="mt-1 flex items-start gap-3">
                        <div className="h-24 w-24 shrink-0 rounded-lg border-2 border-dashed border-orange-300 bg-white overflow-hidden flex items-center justify-center">
                          {form.cover_image_url ? (
                            <img loading="lazy" src={getLogoPublicUrl(form.cover_image_url)} alt="Cover" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-orange-300" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => coverFileInputRef.current?.click()}
                            disabled={coverUploading}
                            className="w-full gap-2"
                          >
                            {coverUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {form.cover_image_url ? "Sostituisci immagine" : "Carica immagine"}
                          </Button>
                          {form.cover_image_url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => updateForm({ cover_image_url: null })}
                              className="w-full text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                            </Button>
                          )}
                          <p className="text-[10px] text-muted-foreground">PNG/JPG · max 5 MB · ottimale 1200×800</p>
                        </div>
                      </div>
                      <input
                        ref={coverFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleCoverUpload}
                        className="hidden"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Titolo copertina</Label>
                        <MergeTagInserter
                          targetRef={coverTitleRef}
                          currentValue={form.cover_title ?? ""}
                          onInsert={(v) => updateForm({ cover_title: v })}
                        />
                      </div>
                      <Input
                        ref={coverTitleRef}
                        value={form.cover_title ?? ''}
                        onChange={e => updateForm({ cover_title: e.target.value })}
                        placeholder="Es. Offerta personalizzata per {{cliente.nome_completo}}"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Sottotitolo / claim</Label>
                        <MergeTagInserter
                          targetRef={coverSubtitleRef}
                          currentValue={form.cover_subtitle ?? ""}
                          onInsert={(v) => updateForm({ cover_subtitle: v })}
                        />
                      </div>
                      <Input
                        ref={coverSubtitleRef}
                        value={form.cover_subtitle ?? ''}
                        onChange={e => updateForm({ cover_subtitle: e.target.value })}
                        placeholder="Es. Cantiere {{cantiere.indirizzo}} — Offerta n. {{preventivo.numero}}"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* G: Texts (cover tagline + footer) */}
            <Card>
              <CardHeader><CardTitle className="text-base">Testi Personalizzabili</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tagline (sotto titolo offerta)</Label>
                  <Input value={form.cover_tagline || ''} onChange={e => updateForm({ cover_tagline: e.target.value })} placeholder="Es: La qualità che fa la differenza." />
                  <p className="text-xs text-muted-foreground mt-1">Apparirà sotto il titolo dell'offerta nelle pagine interne</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Testo footer pagine</Label>
                    <MergeTagInserter
                      targetRef={footerRef}
                      currentValue={form.footer_text ?? ""}
                      onInsert={(v) => updateForm({ footer_text: v })}
                    />
                  </div>
                  <Textarea ref={footerRef} value={form.footer_text || ''} onChange={e => updateForm({ footer_text: e.target.value })} placeholder="Es: Per informazioni: info@azienda.it | 02 123456" rows={2} />
                  <p className="text-xs text-muted-foreground mt-1">Apparirà in fondo a ogni pagina</p>
                </div>
              </CardContent>
            </Card>

            {/* T3: Condizioni pagamento + consegna + bancarie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-slate-600" />
                  Condizioni standard
                </CardTitle>
                <p className="text-xs text-muted-foreground">Pagamento, consegna, IBAN. Supportano merge tag.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground">Condizioni di pagamento</Label>
                    <MergeTagInserter
                      targetRef={paymentRef}
                      currentValue={form.payment_terms_text ?? ""}
                      onInsert={(v) => updateForm({ payment_terms_text: v })}
                    />
                  </div>
                  <RichTextEditor
                    value={form.payment_terms_text || ''}
                    onChange={(html) => updateForm({ payment_terms_text: html })}
                    placeholder="Es. Acconto 30% alla firma, 40% a inizio lavori, saldo {{cliente.nome}} a consegna chiavi in mano."
                    minHeight={90}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground">Condizioni di consegna</Label>
                    <MergeTagInserter
                      targetRef={deliveryRef}
                      currentValue={form.delivery_terms_text ?? ""}
                      onInsert={(v) => updateForm({ delivery_terms_text: v })}
                    />
                  </div>
                  <RichTextEditor
                    value={form.delivery_terms_text || ''}
                    onChange={(html) => updateForm({ delivery_terms_text: html })}
                    placeholder="3-4 settimane dalla conferma. Cantiere: {{cantiere.indirizzo}}"
                    minHeight={70}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Coordinate bancarie (footer)</Label>
                  <Textarea
                    value={form.bank_details || ''}
                    onChange={e => updateForm({ bank_details: e.target.value })}
                    rows={2}
                    placeholder="IBAN: IT00 X000 0000 0000 0000 0000 000 · BIC: XXXXITXX"
                  />
                </div>
              </CardContent>
            </Card>

            {/* T4: Condizioni contrattuali e termini legali — un solo blocco,
                perché per chi firma sono la stessa cosa: le clausole in coda al PDF.
                Se il template ha ancora il vecchio campo "termini legali" separato,
                lo si vede qui e lo si unisce con un click. */}
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-blue-600" />
                  Condizioni contrattuali e termini legali
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Garanzia, varianti, penali, e poi privacy GDPR, diritto di recesso, foro competente: tutto in un'unica sezione in coda al PDF.
                  Se hai già un blocco "Condizioni e termini legali" nella libreria, collegalo sopra in "Componi l'offerta": vince su questo testo.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2">
                  <Label className="text-sm font-medium">Mostra in PDF</Label>
                  <Switch
                    checked={!!form.show_contractual_terms}
                    onCheckedChange={(v) => updateForm({ show_contractual_terms: v, show_legal_terms: v && !!form.legal_terms_text })}
                  />
                </div>
                {form.show_contractual_terms && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Testo (clausole + termini legali)</Label>
                      <MergeTagInserter
                        targetRef={contractualRef}
                        currentValue={form.contractual_terms_text ?? ""}
                        onInsert={(v) => updateForm({ contractual_terms_text: v })}
                      />
                    </div>
                    <RichTextEditor
                      value={form.contractual_terms_text ?? ''}
                      onChange={(html) => updateForm({ contractual_terms_text: html })}
                      placeholder="1. OGGETTO — {{azienda.ragione_sociale}} si impegna a eseguire i lavori presso {{cantiere.indirizzo}}…&#10;2. GARANZIA — 24 mesi dalla consegna…&#10;3. VARIANTI — concordate per iscritto…&#10;PRIVACY (GDPR Reg. UE 2016/679) — i dati di {{cliente.nome_completo}} sono trattati per…&#10;DIRITTO DI RECESSO — entro 14 giorni (art. 52 D.lgs 206/2005)…&#10;FORO COMPETENTE — Foro di [città azienda]."
                      minHeight={220}
                    />
                  </div>
                )}
                {!!form.legal_terms_text && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs space-y-2">
                    <p className="text-amber-900">
                      Questo template ha ancora un testo "Termini legali" separato (vecchia impostazione). Nel PDF viene già stampato di seguito alle condizioni.
                      Unendolo qui potrai modificarlo in un unico posto.
                    </p>
                    <div className="max-h-24 overflow-y-auto rounded border bg-white/70 p-2 text-[11px] text-slate-700 whitespace-pre-wrap">
                      {String(form.legal_terms_text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => updateForm({
                        contractual_terms_text: [form.contractual_terms_text ?? "", form.legal_terms_text ?? ""].filter(Boolean).join("\n\n"),
                        legal_terms_text: null,
                        show_legal_terms: false,
                        show_contractual_terms: true,
                      })}
                    >
                      Unisci qui i termini legali
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}

            {/* Footer actions: solo "Salva e chiudi" come backup, le azioni
                principali sono nella sticky toolbar in alto. */}
            <div className="flex gap-3 pb-8 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={handleCancel}>Annulla e torna alla libreria</Button>
              <Button
                onClick={async () => {
                  const saved = await handleSave(false);
                  if (!saved) return;
                  setEditing(false);
                  setEditId(null);
                }}
                disabled={upsertTemplate.isPending}
                className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500"
              >
                {upsertTemplate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salva e torna alla libreria
              </Button>
            </div>
          </div>

          {/* Right: preview kind-aware */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="pb-3 bg-slate-950 text-white">
                <CardTitle className="text-base flex items-center justify-between gap-3">
                  <span>Anteprima {KIND_META[formKind].label}</span>
                  <Badge variant="secondary" className="bg-white/10 text-white border-white/20">
                    {KIND_META[formKind].emoji}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-white/65">
                  {formKind === 'offerta'
                    ? "Anteprima fedele a logo, margini, tabella, footer e condizioni."
                    : `Blocco riusabile linkabile dalle offerte. Apparirà nel PDF finale come ${KIND_META[formKind].label.toLowerCase()}.`}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 bg-slate-100 p-4">
                <div className="w-full overflow-auto rounded-lg bg-slate-200/80 p-4 shadow-inner">
                  <div className="flex min-w-max justify-center">
                    {formKind === 'offerta' ? (
                      <QuoteTemplatePreview
                        template={form}
                        companyName={effectiveCompany?.name}
                        logoSrc={logoSrcFor(form)}
                        page={previewPage}
                        scale={0.45}
                      />
                    ) : (
                      <KindPreview form={form} kind={formKind} />
                    )}
                  </div>
                </div>
                {formKind === 'offerta' && (
                  <div className="flex gap-2">
                    <Button variant={previewPage === 'cover' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewPage('cover')}>
                      Pagina 1
                    </Button>
                    <Button variant={previewPage === 'detail' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewPage('detail')}>
                      Pagina 2
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={downloadingPdf}
                  onClick={async () => {
                    setDownloadingPdf(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
                        body: {
                          preview_mode: true,
                          template_data: form,
                          company_name: effectiveCompany?.name,
                          preview_signature: true,
                        },
                      });
                      if (error) {
                        let errBody: { error?: string; message?: string } | null = null;
                        try {
                          const ctx = (error as { context?: unknown }).context;
                          if (ctx instanceof Response) errBody = await ctx.json() as { error?: string; message?: string };
                        } catch {
                          errBody = null;
                        }
                        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
                      }
                      if (!data?.pdf_base64) throw new Error("Nessun PDF ricevuto");
                      const binary = atob(data.pdf_base64);
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                      const blob = new Blob([bytes], { type: "application/pdf" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `anteprima-${(form.name || "template").replace(/\s+/g, "-").toLowerCase()}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success("PDF scaricato");
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Errore generazione PDF");
                    } finally {
                      setDownloadingPdf(false);
                    }
                  }}
                >
                  {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Scarica PDF Anteprima
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      )}

      {/* Dialog "Scegli che tipo di template creare" — 6 cards selezionabili */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crea un nuovo template</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Scegli quale tipo di blocco vuoi aggiungere alla tua libreria. I blocchi sono riusabili tra più offerte.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
            {KIND_ORDER.map((k) => {
              const meta = KIND_META[k];
              const count = countsByKind[k] ?? 0;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setActiveKind(k);
                    handleNew(k);
                  }}
                  className={`text-left rounded-xl border-2 ${meta.borderColor} ${meta.bgColor} hover:scale-[1.02] hover:shadow-md transition-all p-4 group focus:outline-none focus:ring-2 focus:ring-orange-400`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{meta.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className={`font-semibold ${meta.color}`}>{meta.label}</h3>
                        {count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 text-slate-700 font-medium">
                            {count} esistenti
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-snug">{meta.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annulla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <span className="space-y-2 block">
                  <span className="block">
                    Stai eliminando <strong>{deleteTarget.name}</strong>. Il template verrà disattivato e non sarà più disponibile per nuove offerte.
                  </span>
                  {deleteImpactOffers.length > 0 ? (
                    <span className="block rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      Questo blocco è usato da {deleteImpactOffers.length} offerte template:{" "}
                      {deleteImpactOffers.slice(0, 3).map((offer) => offer.name).join(", ")}
                      {deleteImpactOffers.length > 3 ? ` e altre ${deleteImpactOffers.length - 3}` : ""}. Dopo l'eliminazione verrà scollegato automaticamente.
                    </span>
                  ) : (
                    <span className="block text-muted-foreground">Non risulta collegato ad altri template attivi.</span>
                  )}
                </span>
              ) : (
                "Sei sicuro di voler eliminare questo template? L'azione non è reversibile."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </TabsContent>
    </Tabs>
  );
}
