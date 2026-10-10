import React, { useId, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import { resolveQuoteTemplatePreview } from "@/lib/quoteTemplatePreview";
import {
  COLOR_PALETTES, DEFAULT_TEMPLATE, FONT_SIZE_PRESETS, LINE_HEIGHT_PRESETS,
  ROW_DENSITY_LABELS, TABLE_BORDERS_LABELS, HEADER_ALIGNMENT_LABELS,
  KIND_META, KIND_ORDER, blankTemplateForKind,
} from "@/types/quoteTemplate";
import type {
  QuoteTemplate, QuoteTemplateKind, LogoPosition, LogoSize,
  RowDensity, TableBorders, TextAlignment, ProductSpec, FontFamily,
} from "@/types/quoteTemplate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditorSafe as RichTextEditor } from "@/components/ui/rich-text-editor-safe";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { IndiceSezioni } from "@/components/impostazioni/SezioneImpostazione";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Pencil, Star, Loader2, Upload, ImageIcon, Download, Copy, FileText,
  CheckCircle2, Palette, Wand2, FileImage, ScrollText, ArrowLeft, Save, ArrowRight,
  Blocks, CircleCheck,
} from "lucide-react";
import { MergeTagInserter } from "@/components/quotes/MergeTagInserter";
import { CanvaColorPicker } from "@/components/quotes/CanvaColorPicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingBag } from "lucide-react";
// MP-IMP-001 Fase 3 — sezioni estratte in cartella dedicata
import {
  LAYOUTS, FONTS, DESIGN_PRESETS, COMPLETE_OFFER_BLUEPRINTS, ALLOWED_LOGO_TYPES, SEZIONI_EDITOR_OFFERTA,
  TESTO_SOLA_LETTURA, ID_AVVISO_SOLA_LETTURA,
} from "./SettingsQuoteTemplates/constants";
import {
  getLogoPublicUrl, kindColorHint, kindColorLabels, cnTab, getReferencingOffers,
  erroreInItaliano, descrizioneTipo, titoloVuoto, pulsanteVuoto, nomeNuovoBlocco,
} from "./SettingsQuoteTemplates/helpers";
import { useVaiAlRiquadro } from "./SettingsQuoteTemplates/useVaiAlRiquadro";
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

import { useIsMobile } from "@/hooks/use-mobile";
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
  /** Chi può solo consultare: il testo ricco non si scrive (il resto lo spegne il fieldset). */
  readOnly?: boolean;
}

function ProductTemplateEditor({ form, updateForm, productImageInputRef, productImageUploading, onProductImageUpload, readOnly = false }: ProductTemplateEditorProps) {
  const idBase = useId();
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
          <Label htmlFor={`${idBase}-breve`}>Descrizione breve</Label>
          <Input id={`${idBase}-breve`} value={form.product_short_description ?? ''} onChange={e => updateForm({ product_short_description: e.target.value })} placeholder="1 riga sintetica per la tabella" />
        </div>

        <div role="group" aria-labelledby={`${idBase}-estesa`}>
          <Label id={`${idBase}-estesa`}>Descrizione estesa</Label>
          <RichTextEditor
            value={form.product_long_description ?? ''}
            onChange={(html) => updateForm({ product_long_description: html })}
            placeholder="Dettagli, materiali, finitura, vantaggi…"
            minHeight={120}
            readOnly={readOnly}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${idBase}-prezzo`}>Prezzo indicativo (€)</Label>
            <Input
              id={`${idBase}-prezzo`}
              type="number"
              step="0.01"
              value={form.product_indicative_price ?? ''}
              onChange={e => updateForm({ product_indicative_price: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="0.00"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Solo orientativo: non è il prezzo del preventivo</p>
          </div>
          <div className="self-end text-[11px] text-muted-foreground pb-2.5">
            {form.product_indicative_price !== null && form.product_indicative_price !== undefined && form.product_unit
              ? `→ €${Number(form.product_indicative_price).toFixed(2)} / ${form.product_unit}`
              : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label id={`${idBase}-specifiche`}>Specifiche tecniche</Label>
            <Button type="button" variant="outline" size="sm" onClick={addSpec} className="gap-1 h-7 text-[11px]">
              <Plus className="h-3 w-3" />Aggiungi specifica
            </Button>
          </div>
          {specs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-3 py-2 border border-dashed rounded">Nessuna specifica. Aggiungine una (es. Spessore: 3 cm).</p>
          ) : (
            <div className="space-y-1.5" role="group" aria-labelledby={`${idBase}-specifiche`}>
              {specs.map((spec, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input value={spec.label} onChange={e => updateSpec(idx, { label: e.target.value })} placeholder="Etichetta (es. Spessore)" aria-label={`Specifica ${idx + 1}: etichetta`} className="min-w-0 flex-1" />
                  <Input value={spec.value} onChange={e => updateSpec(idx, { value: e.target.value })} placeholder="Valore (es. 3 cm)" aria-label={`Specifica ${idx + 1}: valore`} className="min-w-0 flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(idx)} aria-label={`Togli la specifica ${idx + 1}`} className="h-9 w-9 shrink-0 text-red-600 hover:text-red-700">
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
  /** Il colore del marchio dell'azienda: nelle anteprime vale come nel PDF. */
  brandColor?: string | null;
  templates: QuoteTemplate[];
  /** false = chi può solo consultare: il modello si apre ma non si cambia, non si copia, non si elimina. */
  puoModificare: boolean;
  /** id dell'avviso «Stai consultando i modelli»: spiega i pulsanti spenti. */
  idAvvisoSolaLettura?: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Il timbro sta nel contenitore riservato dei modelli: si vede con un link a scadenza. */
function AnteprimaTimbro({ percorso }: { percorso: string }) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setLink(null);
    void supabase.storage.from("quote-template-assets").createSignedUrl(percorso, 60 * 60).then(({ data }) => {
      if (vivo) setLink(data?.signedUrl ?? null);
    });
    return () => { vivo = false; };
  }, [percorso]);
  if (!link) return <div className="h-16 w-40 rounded-md border border-dashed bg-muted/40" aria-hidden="true" />;
  return <img src={link} alt="Timbro e firma dell'impresa" className="h-16 max-w-[200px] rounded-md border bg-white object-contain p-1" />;
}

function TemplateCard({ tmpl, kindMeta, logoSrcFor, effectiveCompanyName, brandColor, templates, puoModificare, idAvvisoSolaLettura, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const kind = (tmpl.kind as QuoteTemplateKind | undefined) ?? 'offerta';

  // Anteprima specifica per kind
  const renderPreview = () => {
    if (kind === 'offerta') {
      const preview = resolveQuoteTemplatePreview(tmpl, templates, brandColor);
      return <QuoteTemplatePreview template={preview} companyName={effectiveCompanyName} logoSrc={logoSrcFor(tmpl)} coverSrc={getLogoPublicUrl(preview.cover_image_url)} scale={0.42} />;
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
      if (tmpl.linked_cover_id || tmpl.cover_title || tmpl.cover_subtitle) parts.push("+ copertina");
      if (tmpl.linked_terms_id || tmpl.linked_legal_id || tmpl.contractual_terms_text || tmpl.payment_terms_text || tmpl.delivery_terms_text) parts.push("+ condizioni");
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
    <Card className={`relative overflow-hidden border ${kindMeta.borderColor} hover:-translate-y-0.5 hover:shadow-lg transition-all`}>
      <CardContent className="p-5 space-y-4">
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
            <Badge variant="secondary" className="shrink-0"><Star className="h-3 w-3 mr-1" />Predefinito</Badge>
          )}
          {usedByCount > 0 && (
            <Badge variant="outline" className="shrink-0 text-[10px]">{usedByCount} offerte</Badge>
          )}
        </div>
        <div className="flex min-h-[292px] items-center justify-center rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 shadow-inner">
          {renderPreview()}
        </div>
        {tmpl.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
        )}
        {kind === 'offerta' && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
              <CircleCheck className="h-3 w-3" /> Completa per il cliente
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
              <ArrowRight className="h-3 w-3" /> Nel preventivatore standard
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit} aria-label={`${puoModificare ? "Modifica" : "Apri"} ${tmpl.name}`}>
            <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />{puoModificare ? "Modifica" : "Apri"}
          </Button>
          <Button
            variant="ghost" size="sm" onClick={onDuplicate} title="Duplica il modello" aria-label={`Duplica ${tmpl.name}`}
            disabled={!puoModificare} aria-describedby={!puoModificare ? idAvvisoSolaLettura : undefined}
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
          </Button>
          {!(tmpl.is_default && kind === 'offerta') && (
            <Button
              variant="ghost" size="sm" onClick={onDelete} aria-label={`Elimina il modello ${tmpl.name}`}
              disabled={!puoModificare} aria-describedby={!puoModificare ? idAvvisoSolaLettura : undefined}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface BlockLinkSelectorProps {
  label: string;
  value: string | null;
  options: QuoteTemplate[];
  onChange: (id: string | null) => void;
  onCreate: () => void;
}

function BlockLinkSelector({ label, value, options, onChange, onCreate }: BlockLinkSelectorProps) {
  const id = useId();
  return (
    <div className="rounded-xl border border-orange-200/80 bg-white/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-semibold text-slate-800">{label}</Label>
        {value && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700"><CircleCheck className="h-3 w-3" /> Collegato</span>}
      </div>
      <div className="flex items-center gap-2">
        <select
          id={id}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 max-sm:h-11 max-sm:text-sm"
        >
          <option value="">Nessun blocco collegato</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-2.5 text-xs" onClick={onCreate} aria-label={`Crea: ${label}`}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Crea
        </Button>
      </div>
      {options.length === 0 && <p className="mt-1.5 text-[10px] text-muted-foreground">Nessun blocco disponibile: puoi crearlo direttamente.</p>}
    </div>
  );
}

interface MultiBlockSelectorProps {
  label: string;
  values: string[];
  options: QuoteTemplate[];
  onChange: (ids: string[]) => void;
}

function MultiBlockSelector({ label, values, options, onChange }: MultiBlockSelectorProps) {
  const idEtichetta = useId();
  const toggle = (id: string) => {
    onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  };

  return (
    <div className="rounded-xl border border-orange-200/80 bg-white/80 p-3" role="group" aria-labelledby={idEtichetta}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label id={idEtichetta} className="text-xs font-semibold text-slate-800">{label}</Label>
        <span className="text-[10px] font-medium text-slate-500">{values.length} selezionate</span>
      </div>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[10px] text-muted-foreground">Nessun blocco disponibile: crealo da «Altri blocchi» e poi torna qui.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map((option) => {
            const checked = values.includes(option.id);
            return (
              <label key={option.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors max-sm:min-h-11 ${checked ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="accent-orange-500" />
                <span className="min-w-0 truncate">{option.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Un riquadro dell'editor a cui porta l'indice in cima: ha il suo id e, quando ci si arriva dall'indice,
 * si evidenzia per un attimo. `scroll-mt-16` lascia libero il posto sotto la barra e l'indice, che restano in vista.
 */
function RiquadroEditor({ id, evidenziato, children }: { id: string; evidenziato: string | null; children: ReactNode }) {
  const acceso = evidenziato === id;
  return (
    <div
      id={id}
      data-evidenziata={acceso ? "true" : undefined}
      className={cn("scroll-mt-16 rounded-lg transition-shadow duration-500", acceso && "ring-2 ring-primary/50")}
    >
      {children}
    </div>
  );
}

/**
 * Un interruttore con il suo nome: toccando il testo si accende, e la riga è alta quanto un dito (44 px),
 * perché l'interruttore da solo è alto 24 px e su telefono si sbaglia.
 */
function RigaInterruttoreModello({
  id,
  etichetta,
  checked,
  onCheckedChange,
}: {
  id: string;
  etichetta: string;
  checked: boolean;
  onCheckedChange: (valore: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="flex-1 cursor-pointer py-2.5 leading-snug">{etichetta}</Label>
    </div>
  );
}

export default function SettingsQuoteTemplates() {
  const isMobile = useIsMobile();
  const { role, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;
  // Chi può solo consultare: i modelli si aprono ma non si cambiano (la regola del database è la stessa,
  // `quote_templates_scrittura`). L'avviso lo dice, e i pulsanti spenti rimandano a lui con aria-describedby.
  const puoModificare = isAdmin;
  const mostraAvvisoSolaLettura = !puoModificare && !permissions.isLoading;
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
  const [showAdvancedCreateTypes, setShowAdvancedCreateTypes] = useState(false);
  const [showAdvancedLibrary, setShowAdvancedLibrary] = useState(false);
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

  // Ricaricamento, link interni (le schede del gruppo, il menu) e ricerca ⌘K chiedono conferma se c'è
  // una modifica non salvata. «Indietro» e gli altri pulsanti della pagina usano confirmDiscardChanges.
  useSettingsDraftGuard(editing && (isDirty || upsertTemplate.isPending));
  const { evidenziato, vai: vaiAlRiquadro } = useVaiAlRiquadro();

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
    toast.success("Stile applicato", {
      description: "Controlla l'anteprima e salva quando il layout ti convince.",
    });
  };

  const openCompleteOffer = useCallback((blueprint: typeof COMPLETE_OFFER_BLUEPRINTS[number]) => {
    if (!confirmDiscardChanges()) return;
    setCreateDialogOpen(false);
    setShowAdvancedCreateTypes(false);
    setActiveKind('offerta');
    setEditId(null);
    setForm({
      ...blankTemplateForKind('offerta'),
      ...blueprint.patch,
      name: blueprint.name,
      description: blueprint.description,
      // Le condizioni standard restano inline: l'offerta è autonoma e non
      // dipende da una scheda separata per poter essere usata nel preventivatore.
      contractual_terms_text: CONDIZIONI_STANDARD_MD,
      body_format: 'markdown',
    });
    setIsDirty(true);
    setEditing(true);
  }, [confirmDiscardChanges]);

  const openNewTemplate = useCallback((kind: QuoteTemplateKind) => {
    setEditId(null);
    setForm({ ...blankTemplateForKind(kind), name: nomeNuovoBlocco(kind) });
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
   * Salva il modello.
   * - asDefault=true: lo usano i nuovi preventivi e chiude (azione "Salva e usa per i nuovi preventivi")
   * - asDefault=false (Salva bozza): salva senza chiudere, l'utente può continuare a modificare.
   *   Dopo il primo insert, editId viene aggiornato così i salvataggi successivi sono UPDATE.
   */
  const handleSave = async (asDefault = false): Promise<boolean> => {
    if (!puoModificare) return false; // sola lettura: nessun pulsante arriva qui, ma il database direbbe di no
    const templateName = form.name?.trim();
    if (!templateName) {
      toast.error("Scrivi il nome del modello");
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
        toast.success(editId ? "Modello salvato: lo useranno i nuovi preventivi" : "Modello creato: lo useranno i nuovi preventivi");
        setEditing(false);
        setEditId(null);
        setIsDirty(false);
      } else {
        // Salva bozza: resta in editor. Se era un nuovo modello, ora abbiamo un id.
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
      toast.error("Modello non salvato", { description: erroreInItaliano(err, "Non sono riuscito a salvarlo. Riprova tra poco.") });
      return false;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Modello eliminato");
      if (editId === id) handleCancel();
    } catch (err: unknown) {
      toast.error("Modello non eliminato", { description: erroreInItaliano(err, "Non sono riuscito a eliminarlo. Riprova tra poco.") });
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
      toast.error("Logo non caricato", { description: erroreInItaliano(err, "Non sono riuscito a caricarlo. Riprova tra poco.") });
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
      toast.error("Copertina non caricata", { description: erroreInItaliano(err, "Non sono riuscito a caricarla. Riprova tra poco.") });
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  };

  // Timbro e firma dell'impresa (25/09/2026): si carica una volta nel modello e il
  // PDF lo stampa nel riquadro «Per l'impresa» di ogni preventivo. Nel contenitore
  // riservato dei modelli, nella cartella dell'azienda: la firma non è pubblica.
  const [timbroUploading, setTimbroUploading] = useState(false);
  const handleTimbroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveCompany?.id) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error("Carica il timbro in PNG o JPG");
      e.target.value = "";
      return;
    }
    setTimbroUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${effectiveCompany.id}/template-timbro-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quote-template-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      updateForm({ timbro_firma_url: path });
      toast.success("Timbro caricato: salva il modello per usarlo nei preventivi");
    } catch (err: unknown) {
      toast.error("Timbro non caricato", { description: erroreInItaliano(err, "Non sono riuscito a caricarlo. Riprova tra poco.") });
    } finally {
      setTimbroUploading(false);
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
      toast.error("Immagine non caricata", { description: erroreInItaliano(err, "Non sono riuscito a caricarla. Riprova tra poco.") });
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
      <div role="status" aria-label="Caricamento dei modelli" className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
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
          Preventivo generico
        </TabsTrigger>
        <TabsTrigger value="moduli-vendita" className="gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5" />
          {/* Da telefono le due linguette non stanno in 375 px: resta «Moduli». */}
          Moduli<span className="max-sm:hidden"> (serramenti, fotovoltaico…)</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="moduli-vendita" className="space-y-4">
        <ModuliVenditaPanel initialModulo={moduloFromUrl} />
      </TabsContent>

      <TabsContent value="documenti" className="space-y-6 mt-0">
      {mostraAvvisoSolaLettura && (
        <Alert id={ID_AVVISO_SOLA_LETTURA}>
          <AlertDescription>{TESTO_SOLA_LETTURA}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-eic-amber flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            {/* Il titolo della pagina è nel layout (h1): qui il titolo di questa scheda è un h2. */}
            <h2 className="text-lg font-semibold leading-tight">Offerte complete</h2>
            {!editing && (
              <p className="text-sm text-muted-foreground">
                Scegli un modello già completo di copertina, contenuti, investimento e condizioni.
                Il preventivatore standard userà direttamente queste offerte.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing && formKind === 'offerta' && (
            <Badge variant={designScore >= 80 ? "secondary" : "outline"} className="gap-1 text-[11px] h-6">
              <CheckCircle2 className="h-3 w-3" />
              Qualità layout {designScore}%
            </Badge>
          )}
          {isAdmin && !editing && (
            <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500">
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo modello
            </Button>
          )}
        </div>
      </div>

      {/* Le offerte complete sono il percorso principale. I blocchi separati
          restano disponibili solo come libreria avanzata/back-office. */}
      {!editing && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveKind('offerta')}
              aria-pressed={activeKind === 'offerta'}
              className={cnTab(activeKind === 'offerta', KIND_META.offerta.color, KIND_META.offerta.borderColor, KIND_META.offerta.bgColor)}
            >
              <span>Offerte complete</span>
              <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-700">{countsByKind.offerta ?? 0}</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-slate-600"
              onClick={() => {
                const next = !showAdvancedLibrary;
                setShowAdvancedLibrary(next);
                if (!next) setActiveKind('offerta');
              }}
            >
              <Blocks className="h-3.5 w-3.5" />
              {showAdvancedLibrary ? 'Nascondi gli altri blocchi' : 'Altri blocchi'}
              <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                {KIND_ORDER.filter((kind) => kind !== 'offerta').reduce((total, kind) => total + (countsByKind[kind] ?? 0), 0)}
              </Badge>
            </Button>
          </div>
          {showAdvancedLibrary && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-2">
              {KIND_ORDER.filter((kind) => kind !== 'offerta').map((k) => {
                const meta = KIND_META[k];
                const count = countsByKind[k] ?? 0;
                const isActive = activeKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveKind(k)}
                    aria-pressed={isActive}
                    className={cnTab(isActive, meta.color, meta.borderColor, meta.bgColor)}
                  >
                    <span>{meta.label}</span>
                    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? "bg-white/80 text-slate-700" : "bg-slate-200 text-slate-600"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!editing ? (
        /* Modelli filtrati per il tipo attivo. Senza il riquadro-guida l'elenco ha tutta la larghezza. */
        <div className="grid grid-cols-1 items-start gap-5">
          <div className="min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[0, 1].map((item) => (
                  <Card key={item} className="overflow-hidden border-slate-200">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center gap-3"><div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" /><div className="space-y-2"><div className="h-3 w-36 animate-pulse rounded bg-slate-200" /><div className="h-2.5 w-52 animate-pulse rounded bg-slate-100" /></div></div>
                      <div className="h-[292px] animate-pulse rounded-xl bg-slate-100" />
                      <div className="h-9 animate-pulse rounded-lg bg-slate-100" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : fetchError ? (
              <Card role="alert" className="p-8 text-center">
                <p className="font-medium text-destructive">Non riesco a leggere i modelli</p>
                <p className="mt-1 text-sm text-muted-foreground">{erroreInItaliano(fetchError, "Riprova tra poco o ricarica la pagina.")}</p>
              </Card>
            ) : filteredTemplates.length === 0 ? (
              <Card className={`space-y-3 p-8 text-center ${KIND_META[activeKind].borderColor} ${KIND_META[activeKind].bgColor}/30`}>
                <div className="text-4xl">{KIND_META[activeKind].emoji}</div>
                <div>
                  <p className={`font-semibold ${KIND_META[activeKind].color}`}>
                    {titoloVuoto(activeKind)}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    {descrizioneTipo(activeKind)}
                  </p>
                </div>
                {isAdmin && (
                  <Button onClick={() => activeKind === 'offerta' ? setCreateDialogOpen(true) : handleNew(activeKind)} className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500">
                    <Plus className="mr-2 h-4 w-4" />{pulsanteVuoto(activeKind)}
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
                        setTimeout(() => updateForm({ body_html: markdownSempliceToHtml(CONDIZIONI_STANDARD_MD), body_format: 'html' }), 60);
                      }}
                    >
                      Parti dal modello standard
                    </Button>
                    <span> · oppure importa le tue condizioni nell&apos;editor.</span>
                  </div>
                )}
                {isAdmin && (
                  <Button variant="outline" onClick={() => setCreateDialogOpen(true)} size="sm" className="ml-2">
                    Vedi tutti i tipi
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredTemplates.map(tmpl => (
                  <TemplateCard
                    key={tmpl.id}
                    tmpl={tmpl}
                    kindMeta={KIND_META[((tmpl.kind as QuoteTemplateKind | undefined) ?? 'offerta')]}
                    logoSrcFor={logoSrcFor}
                    effectiveCompanyName={effectiveCompany?.name}
                    brandColor={effectiveCompany?.brand_primary_color}
                    templates={templates}
                    puoModificare={puoModificare}
                    idAvvisoSolaLettura={ID_AVVISO_SOLA_LETTURA}
                    onEdit={() => handleEdit(tmpl)}
                    onDuplicate={() => handleDuplicate(tmpl)}
                    onDelete={() => setDeleteConfirmId(tmpl.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Editor with preview */
        <div className="space-y-3">
          {/* Barra in alto: ← Indietro · tipo e nome · Salva bozza · Salva e usa per i nuovi preventivi.
              Da telefono va a capo (prima le due file di pulsanti uscivano dallo schermo). */}
          <div className="sticky top-0 z-30 -mx-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur-md">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 max-sm:w-full">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="gap-1.5 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Indietro
              </Button>
              <span className="hidden shrink-0 text-sm text-slate-300 sm:inline" aria-hidden="true">/</span>
              <span className={`hidden shrink-0 items-center gap-1 text-sm font-medium sm:flex ${KIND_META[formKind].color}`}>
                <span aria-hidden="true">{KIND_META[formKind].emoji}</span>
                {KIND_META[formKind].label}
              </span>
              <span className="hidden shrink-0 text-sm text-slate-300 sm:inline" aria-hidden="true">·</span>
              <span className="min-w-[7rem] flex-1 truncate text-sm font-semibold text-slate-900">{form.name || "Senza nome"}</span>
              {!puoModificare && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">Sola lettura</Badge>
              )}
              {puoModificare && editId && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">Modifica</Badge>
              )}
              {puoModificare && !editId && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0 bg-orange-50 text-orange-700 border-orange-200">Bozza</Badge>
              )}
              {isDirty && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                  Modifiche non salvate
                </Badge>
              )}
            </div>
            {/* Da telefono i due salvataggi stanno uno sopra l'altro: «Salva e usa per i nuovi preventivi» non entra in mezza riga e usciva tagliato. */}
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={!puoModificare || upsertTemplate.isPending}
                aria-describedby={!puoModificare ? ID_AVVISO_SOLA_LETTURA : undefined}
                title="Salva senza chiudere"
              >
                {upsertTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                Salva bozza
              </Button>
              {formKind === 'offerta' && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => handleSave(true)}
                  disabled={!puoModificare || upsertTemplate.isPending}
                  aria-describedby={!puoModificare ? ID_AVVISO_SOLA_LETTURA : undefined}
                  className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500 gap-1.5"
                >
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  Salva e usa per i nuovi preventivi
                </Button>
              )}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: form. Da telefono scorre con la pagina; da computer ha la sua altezza e l'anteprima gli sta accanto. */}
          <div className="min-w-0 space-y-6 lg:col-span-3 lg:max-h-[calc(100vh-200px)] lg:overflow-auto lg:pr-2">
            {/* Indice dei riquadri: resta in vista mentre si scorre (solo il preventivo ha 14 riquadri). */}
            {formKind === 'offerta' && (
              <div className="z-10 bg-background/95 py-1.5 backdrop-blur lg:sticky lg:top-0">
                <IndiceSezioni voci={SEZIONI_EDITOR_OFFERTA} onVai={vaiAlRiquadro} />
              </div>
            )}
            {/* disabled su un fieldset spegne ogni campo e pulsante che contiene: chi può solo consultare vede tutto e non cambia niente. */}
            <fieldset disabled={!puoModificare} className="m-0 min-w-0 space-y-6 border-0 p-0">
            {formKind === 'offerta' && (
            <Card className="border-primary/15 bg-gradient-to-br from-primary/5 via-background to-orange-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  Stili pronti
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            <RiquadroEditor id="modello-informazioni" evidenziato={evidenziato}>
            <Card className={`border ${KIND_META[formKind].borderColor}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Nome e descrizione</CardTitle>
                <p className="text-xs text-muted-foreground">{descrizioneTipo(formKind)}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="modello-nome">Nome *</Label>
                  <Input id="modello-nome" value={form.name || ''} onChange={e => updateForm({ name: e.target.value })} placeholder={`Es. ${KIND_META[formKind].label} aziendale`} />
                </div>
                <div>
                  <Label htmlFor="modello-descrizione">Descrizione (interna)</Label>
                  <Input id="modello-descrizione" value={form.description ?? ''} onChange={e => updateForm({ description: e.target.value })} placeholder="A cosa serve questo modello (es. ristrutturazioni, serramenti…)" />
                </div>
                {formKind === 'offerta' && (
                  <RigaInterruttoreModello
                    id="modello-predefinito"
                    etichetta="Usa questo modello per i nuovi preventivi"
                    checked={form.is_default ?? false}
                    onCheckedChange={v => updateForm({ is_default: v })}
                  />
                )}
                {formKind === 'prodotto' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="modello-categoria">Categoria</Label>
                      <Input id="modello-categoria" value={form.product_category ?? ''} onChange={e => updateForm({ product_category: e.target.value })} placeholder="Es. Serramenti, Pavimenti…" />
                    </div>
                    <div>
                      <Label htmlFor="modello-unita">Unità di misura</Label>
                      <Input id="modello-unita" value={form.product_unit ?? ''} onChange={e => updateForm({ product_unit: e.target.value })} placeholder="mq, pz, ml, h…" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </RiquadroEditor>

            {/* COMPOSITORE OFFERTA: solo per kind=offerta — selettori dei blocchi linkati */}
            {formKind === 'offerta' && (
              <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 to-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-orange-600" />
                    Componi l'offerta
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Scegli quali blocchi della libreria includere nel PDF. Per crearne uno nuovo vai in «Altri blocchi».
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
                    <ImageIcon className="h-4 w-4 text-pink-600" aria-hidden="true" />
                    Contenuto copertina
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">È la prima pagina del PDF dell'offerta. Puoi inserire campi automatici (cliente, cantiere, data…).</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div role="group" aria-labelledby="modello-copertina-immagine">
                    <p id="modello-copertina-immagine" className="text-xs font-medium text-muted-foreground">Immagine copertina</p>
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
                      <Label htmlFor="modello-copertina-titolo" className="text-xs text-muted-foreground">Titolo copertina</Label>
                      <MergeTagInserter targetRef={coverTitleRef} currentValue={form.cover_title ?? ""} onInsert={(v) => updateForm({ cover_title: v })} />
                    </div>
                    <Input id="modello-copertina-titolo" ref={coverTitleRef} value={form.cover_title ?? ''} onChange={e => updateForm({ cover_title: e.target.value })} placeholder="Es. Offerta personalizzata per {{cliente.nome_completo}}" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="modello-copertina-sottotitolo" className="text-xs text-muted-foreground">Sottotitolo / claim</Label>
                      <MergeTagInserter targetRef={coverSubtitleRef} currentValue={form.cover_subtitle ?? ""} onInsert={(v) => updateForm({ cover_subtitle: v })} />
                    </div>
                    <Input id="modello-copertina-sottotitolo" ref={coverSubtitleRef} value={form.cover_subtitle ?? ''} onChange={e => updateForm({ cover_subtitle: e.target.value })} placeholder="Es. Cantiere {{cantiere.indirizzo}} — {{data.oggi}}" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CONDIZIONI / LEGALI / SEZIONE: rich text body multi-pagina */}
            {(formKind === 'condizioni' || formKind === 'legali' || formKind === 'sezione') && (
              <Card className={`border ${KIND_META[formKind].borderColor}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span aria-hidden="true">{KIND_META[formKind].emoji}</span>
                    Contenuto {KIND_META[formKind].label.toLowerCase()}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Testo su più pagine. Puoi inserire campi automatici come <code className="text-[10px] bg-white border px-1 rounded">{`{{cliente.nome}}`}</code>.
                    Il PDF va a capo pagina da solo.
                  </p>
                  {(formKind === 'condizioni' || formKind === 'legali') && (
                    <div className="mt-3 rounded-md border border-orange-200 bg-orange-50/50 px-3 py-2 text-xs text-orange-950">
                      Questo blocco è condiviso: dopo il salvataggio potrai inserirlo anche nei modelli di Serramenti, dalla sezione
                      <span className="font-semibold"> Condizioni e disclaimer</span>. Lo stesso testo creato nei Serramenti può essere salvato qui e riusato nei preventivi standard.
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
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="modello-blocco-carattere">
                    <span id="modello-blocco-carattere" className="text-xs font-medium text-muted-foreground">Carattere</span>
                    {FONTS.map(f => (
                      <Button
                        key={f.key}
                        type="button"
                        variant={(form.font_family ?? 'helvetica') === f.key ? 'default' : 'outline'}
                        aria-pressed={(form.font_family ?? 'helvetica') === f.key}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateForm({ font_family: f.key })}
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                  <div role="group" aria-labelledby="modello-blocco-testo">
                    <div className="flex items-center justify-between mb-1">
                      <Label id="modello-blocco-testo" className="text-xs text-muted-foreground">Testo (titoli, grassetto, elenchi come negli altri modelli)</Label>
                      <MergeTagInserter targetRef={bodyHtmlRef} currentValue={form.body_html ?? ""} onInsert={(v) => updateForm({ body_html: v, body_format: 'html' })} />
                    </div>
                    <RichTextEditor
                      readOnly={!puoModificare}
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
                readOnly={!puoModificare}
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
                      type="button"
                      aria-pressed={form.layout === l.key}
                      onClick={() => updateForm({ layout: l.key })}
                      className={`border rounded-lg p-3 text-center text-sm transition-all hover:border-primary ${
                        form.layout === l.key ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="mb-2 flex justify-center">
                        <QuoteTemplatePreview template={{ ...form, layout: l.key }} companyName={effectiveCompany?.name} logoSrc={logoSrcFor(form)} page="detail" scale={0.08} />
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
            <RiquadroEditor id="modello-logo-e-colori" evidenziato={evidenziato}>
            <Card>
              <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <RigaInterruttoreModello
                  id="modello-mostra-logo"
                  etichetta="Mostra logo nel PDF"
                  checked={form.show_logo ?? true}
                  onCheckedChange={v => updateForm({ show_logo: v })}
                />
                {form.show_logo && (
                  <>
                    <div role="group" aria-labelledby="modello-logo-carica">
                      <p id="modello-logo-carica" className="text-sm text-muted-foreground mb-2">Carica logo specifico (PNG/JPG, max 2MB)</p>
                      <div className="flex items-center gap-3">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors max-sm:min-h-11">
                          <Upload className="h-4 w-4" aria-hidden="true" />
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
                            alt="Logo del modello"
                            className="h-20 w-20 rounded-lg border border-border object-contain bg-muted/50 p-1"
                          />
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{form.logo_url.split('/').pop()}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div role="group" aria-labelledby="modello-logo-posizione">
                        <p id="modello-logo-posizione" className="text-sm font-medium">Posizione</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(['left', 'center', 'right'] as LogoPosition[]).map(pos => (
                            <Button key={pos} type="button" variant={form.logo_position === pos ? 'default' : 'outline'} aria-pressed={form.logo_position === pos} size="sm" onClick={() => updateForm({ logo_position: pos })}>
                              {pos === 'left' ? 'Sinistra' : pos === 'center' ? 'Centro' : 'Destra'}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div role="group" aria-labelledby="modello-logo-dimensione">
                        <p id="modello-logo-dimensione" className="text-sm font-medium">Dimensione</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(['small', 'medium', 'large'] as LogoSize[]).map(sz => (
                            <Button key={sz} type="button" variant={form.logo_size === sz ? 'default' : 'outline'} aria-pressed={form.logo_size === sz} size="sm" onClick={() => updateForm({ logo_size: sz })}>
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
            </RiquadroEditor>

            {/* D: Palette colori — Canva style con preset + custom HEX + recenti */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  Palette colori
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {kindColorHint(formKind)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick palette: applica tutti i 4 colori in un click */}
                <div role="group" aria-labelledby="modello-palette-pronte">
                  <p id="modello-palette-pronte" className="text-xs text-muted-foreground mb-1.5">Palette pronte</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {COLOR_PALETTES.map(p => {
                      const isActive = form.primary_color === p.primary && form.accent_color === p.accent;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => applyPalette(p)}
                          aria-pressed={isActive}
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
                <div role="group" aria-labelledby="modello-palette-singoli">
                  <p id="modello-palette-singoli" className="text-xs text-muted-foreground mb-1.5">Personalizza ogni colore</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {kindColorLabels(formKind).map((c) => (
                      <div key={c.key} role="group" aria-label={c.label}>
                        <CanvaColorPicker
                          label={c.label}
                          hint={c.hint}
                          value={(form[c.key] as string) || '#000000'}
                          onChange={(hex) => updateForm({ [c.key]: hex })}
                        />
                      </div>
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
                <div className="space-y-1.5" role="group" aria-labelledby="modello-tipo-famiglia">
                  <p id="modello-tipo-famiglia" className="text-xs font-medium text-muted-foreground">Carattere</p>
                  <div className="flex gap-2 flex-wrap">
                    {FONTS.map(f => (
                      <Button
                        key={f.key}
                        type="button"
                        variant={form.font_family === f.key ? 'default' : 'outline'}
                        aria-pressed={form.font_family === f.key}
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
                    <Label htmlFor="modello-tipo-dimensione" className="text-xs text-muted-foreground">Dimensione del testo</Label>
                    <span className="text-xs font-mono font-semibold">{form.font_size_base ?? 10} pt</span>
                  </div>
                  <input
                    id="modello-tipo-dimensione"
                    type="range"
                    min={7}
                    max={16}
                    step={1}
                    value={form.font_size_base ?? 10}
                    onChange={(e) => updateForm({ font_size_base: Number(e.target.value) })}
                    className="w-full accent-primary max-sm:h-11"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {FONT_SIZE_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        variant={(form.font_size_base ?? 10) === p.value ? "default" : "outline"}
                        aria-pressed={(form.font_size_base ?? 10) === p.value}
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
                    <Label htmlFor="modello-tipo-scala" className="text-xs text-muted-foreground">Scala titoli</Label>
                    <span className="text-xs font-mono font-semibold">
                      ×{(form.heading_size_scale ?? 1.6).toFixed(2)}
                      <span className="opacity-60 ml-1">
                        ≈ {Math.round((form.font_size_base ?? 10) * (form.heading_size_scale ?? 1.6))} pt
                      </span>
                    </span>
                  </div>
                  <input
                    id="modello-tipo-scala"
                    type="range"
                    min={1.0}
                    max={3.0}
                    step={0.1}
                    value={form.heading_size_scale ?? 1.6}
                    onChange={(e) => updateForm({ heading_size_scale: Number(e.target.value) })}
                    className="w-full accent-primary max-sm:h-11"
                  />
                </div>

                {/* Line height */}
                <div className="space-y-1.5" role="group" aria-labelledby="modello-tipo-riga">
                  <div className="flex items-center justify-between">
                    <p id="modello-tipo-riga" className="text-xs font-medium text-muted-foreground">Altezza riga</p>
                    <span className="text-xs font-mono font-semibold">{(form.line_height ?? 1.4).toFixed(2)}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {LINE_HEIGHT_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        variant={(form.line_height ?? 1.4) === p.value ? "default" : "outline"}
                        aria-pressed={(form.line_height ?? 1.4) === p.value}
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
                <div className="space-y-1.5" role="group" aria-labelledby="modello-tipo-allineamento">
                  <p id="modello-tipo-allineamento" className="text-xs font-medium text-muted-foreground">Allineamento di intestazione e titoli</p>
                  <div className="flex flex-wrap gap-2">
                    {(['left', 'center', 'right'] as TextAlignment[]).map((a) => (
                      <Button
                        key={a}
                        type="button"
                        variant={(form.header_alignment ?? 'center') === a ? 'default' : 'outline'}
                        aria-pressed={(form.header_alignment ?? 'center') === a}
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
            <RiquadroEditor id="modello-tabella" evidenziato={evidenziato}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tabella voci</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Row density */}
                <div className="space-y-1.5" role="group" aria-labelledby="modello-tabella-densita">
                  <p id="modello-tabella-densita" className="text-xs font-medium text-muted-foreground">Densità righe</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(ROW_DENSITY_LABELS) as RowDensity[]).map((d) => {
                      const cfg = ROW_DENSITY_LABELS[d];
                      const active = (form.row_density ?? 'normal') === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={active}
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
                <div className="space-y-1.5" role="group" aria-labelledby="modello-tabella-bordi">
                  <p id="modello-tabella-bordi" className="text-xs font-medium text-muted-foreground">Bordi tabella</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['none', 'horizontal', 'all'] as TableBorders[]).map((b) => (
                      <Button
                        key={b}
                        type="button"
                        variant={(form.table_borders ?? 'horizontal') === b ? 'default' : 'outline'}
                        aria-pressed={(form.table_borders ?? 'horizontal') === b}
                        size="sm"
                        onClick={() => updateForm({ table_borders: b })}
                      >
                        {TABLE_BORDERS_LABELS[b]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Zebra */}
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <Label htmlFor="modello-tabella-zebra" className="text-sm">Righe alternate (zebra)</Label>
                    <p id="modello-tabella-zebra-descrizione" className="text-[11px] text-muted-foreground mt-0.5">
                      Righe pari con sfondo grigio chiaro, più facile da leggere su tabelle lunghe.
                    </p>
                  </div>
                  <Switch
                    id="modello-tabella-zebra"
                    aria-describedby="modello-tabella-zebra-descrizione"
                    checked={form.table_zebra ?? true}
                    onCheckedChange={(v) => updateForm({ table_zebra: v })}
                  />
                </div>
              </CardContent>
            </Card>
            </RiquadroEditor>

            {/* E-ter: Pagina (il margine del foglio, non quello di guadagno) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margini del foglio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="modello-margine-foglio" className="text-xs text-muted-foreground">Margine laterale</Label>
                    <span className="text-xs font-mono font-semibold">{form.page_margin_mm ?? 18} mm</span>
                  </div>
                  <input
                    id="modello-margine-foglio"
                    type="range"
                    min={8}
                    max={30}
                    step={1}
                    value={form.page_margin_mm ?? 18}
                    onChange={(e) => updateForm({ page_margin_mm: Number(e.target.value) })}
                    className="w-full accent-primary max-sm:h-11"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Margini minori → più contenuto per pagina. Margini maggiori → PDF più elegante e arieggiato.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* F: Elements */}
            <RiquadroEditor id="modello-cosa-mostrare" evidenziato={evidenziato}>
            <Card>
              <CardHeader><CardTitle className="text-base">Cosa mostrare nel PDF</CardTitle></CardHeader>
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
                  <RigaInterruttoreModello
                    key={el.key}
                    id={`modello-${el.key}`}
                    etichetta={el.label}
                    checked={form[el.key] ?? true}
                    onCheckedChange={v => updateForm({ [el.key]: v })}
                  />
                ))}
                {/* Contatti dell'impresa stampati nel preventivo (25/09/2026): prima usciva
                    sempre la mail del profilo aziendale, che può essere di una persona. */}
                {form.show_company_details !== false && (
                  <div className="border-t pt-3 space-y-2" role="group" aria-labelledby="modello-contatti-titolo">
                    <p id="modello-contatti-titolo" className="text-sm font-medium">Contatti dell'impresa nel preventivo</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="email_impresa" className="text-xs text-muted-foreground">Email</Label>
                        <Input
                          id="email_impresa"
                          type="email"
                          value={form.email_impresa ?? ''}
                          onChange={e => updateForm({ email_impresa: e.target.value })}
                          placeholder={effectiveCompany?.email || 'info@azienda.it'}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="telefono_impresa" className="text-xs text-muted-foreground">Telefono</Label>
                        <Input
                          id="telefono_impresa"
                          type="tel"
                          value={form.telefono_impresa ?? ''}
                          onChange={e => updateForm({ telefono_impresa: e.target.value })}
                          placeholder={effectiveCompany?.phone || '0123 456789'}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Escono sotto «L'impresa» e nel modulo di recesso. Vuoti: si usano quelli del profilo aziendale.
                    </p>
                  </div>
                )}
                {/* Timbro e firma dell'impresa (25/09/2026): caricati una volta, escono già
                    firmati nel riquadro «Per l'impresa» di ogni preventivo di questo modello. */}
                <div className="border-t pt-3 space-y-2" role="group" aria-labelledby="modello-timbro-titolo">
                  <p id="modello-timbro-titolo" className="text-sm font-medium">Timbro e firma dell'impresa</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {form.timbro_firma_url && <AnteprimaTimbro percorso={form.timbro_firma_url} />}
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors max-sm:min-h-11">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {timbroUploading ? "Caricamento..." : form.timbro_firma_url ? "Cambia immagine" : "Carica immagine"}
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleTimbroUpload} disabled={timbroUploading} />
                    </label>
                    {form.timbro_firma_url && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => updateForm({ timbro_firma_url: null })}>
                        <Trash2 className="h-4 w-4 mr-1" />Rimuovi
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="firmatario_impresa" className="text-xs text-muted-foreground">Chi firma per l'impresa</Label>
                    <Input
                      id="firmatario_impresa"
                      value={form.firmatario_impresa ?? ''}
                      onChange={e => updateForm({ firmatario_impresa: e.target.value })}
                      placeholder="Es. Mario Rossi, legale rappresentante"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Timbro e firma insieme, meglio un PNG con il fondo trasparente. Esce nel riquadro «Per l'impresa» di ogni preventivo di questo modello: il cliente lo riceve già firmato da voi. È una firma grafica, non una firma digitale.
                  </p>
                </div>
                <div className="border-t pt-3 space-y-3">
                  <RigaInterruttoreModello
                    id="modello-filigrana"
                    etichetta="Scritta in filigrana"
                    checked={form.show_watermark ?? false}
                    onCheckedChange={v => updateForm({ show_watermark: v })}
                  />
                  {form.show_watermark && (
                    <Input aria-label="Testo della filigrana" value={form.watermark_text || ''} onChange={e => updateForm({ watermark_text: e.target.value })} placeholder="OFFERTA RISERVATA" />
                  )}
                </div>
              </CardContent>
            </Card>
            </RiquadroEditor>

            {/* COVER: Copertina personalizzata */}
            <RiquadroEditor id="modello-copertina" evidenziato={evidenziato}>
            <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 via-background to-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-orange-600" aria-hidden="true" />
                  Copertina personalizzata
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Immagine e titolo che appaiono come prima pagina del PDF. Puoi inserire campi automatici come <code className="text-[10px] bg-white px-1 rounded border">{`{{cliente.nome}}`}</code>.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-white px-3 py-2">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="modello-mostra-copertina" className="text-sm font-medium">Mostra copertina</Label>
                    <p id="modello-mostra-copertina-descrizione" className="text-[11px] text-muted-foreground">Aggiunge una pagina di copertina prima del preventivo</p>
                  </div>
                  <Switch id="modello-mostra-copertina" aria-describedby="modello-mostra-copertina-descrizione" checked={!!form.show_cover_image} onCheckedChange={(v) => updateForm({ show_cover_image: v })} />
                </div>

                {form.show_cover_image && (
                  <>
                    <div role="group" aria-labelledby="modello-offerta-copertina-immagine">
                      <p id="modello-offerta-copertina-immagine" className="text-xs font-medium text-muted-foreground">Immagine di copertina</p>
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
                        <Label htmlFor="modello-offerta-copertina-titolo" className="text-xs text-muted-foreground">Titolo copertina</Label>
                        <MergeTagInserter
                          targetRef={coverTitleRef}
                          currentValue={form.cover_title ?? ""}
                          onInsert={(v) => updateForm({ cover_title: v })}
                        />
                      </div>
                      <Input
                        id="modello-offerta-copertina-titolo"
                        ref={coverTitleRef}
                        value={form.cover_title ?? ''}
                        onChange={e => updateForm({ cover_title: e.target.value })}
                        placeholder="Es. Offerta personalizzata per {{cliente.nome_completo}}"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label htmlFor="modello-offerta-copertina-sottotitolo" className="text-xs text-muted-foreground">Sottotitolo / claim</Label>
                        <MergeTagInserter
                          targetRef={coverSubtitleRef}
                          currentValue={form.cover_subtitle ?? ""}
                          onInsert={(v) => updateForm({ cover_subtitle: v })}
                        />
                      </div>
                      <Input
                        id="modello-offerta-copertina-sottotitolo"
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
            </RiquadroEditor>

            {/* G: Texts (cover tagline + footer) */}
            <RiquadroEditor id="modello-testi" evidenziato={evidenziato}>
            <Card>
              <CardHeader><CardTitle className="text-base">Testi</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="modello-tagline">Tagline (sotto titolo offerta)</Label>
                  <Input id="modello-tagline" aria-describedby="modello-tagline-descrizione" value={form.cover_tagline || ''} onChange={e => updateForm({ cover_tagline: e.target.value })} placeholder="Es: La qualità che fa la differenza." />
                  <p id="modello-tagline-descrizione" className="text-xs text-muted-foreground mt-1">Apparirà sotto il titolo dell'offerta nelle pagine interne</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="modello-piedepagina">Testo a piè di pagina</Label>
                    <MergeTagInserter
                      targetRef={footerRef}
                      currentValue={form.footer_text ?? ""}
                      onInsert={(v) => updateForm({ footer_text: v })}
                    />
                  </div>
                  <Textarea id="modello-piedepagina" aria-describedby="modello-piedepagina-descrizione" ref={footerRef} value={form.footer_text || ''} onChange={e => updateForm({ footer_text: e.target.value })} placeholder="Es: Per informazioni: info@azienda.it | 02 123456" rows={2} />
                  <p id="modello-piedepagina-descrizione" className="text-xs text-muted-foreground mt-1">Apparirà in fondo a ogni pagina</p>
                </div>
              </CardContent>
            </Card>
            </RiquadroEditor>

            {/* T3: Condizioni pagamento + consegna + bancarie */}
            <RiquadroEditor id="modello-condizioni" evidenziato={evidenziato}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  Condizioni standard
                </CardTitle>
                <p className="text-xs text-muted-foreground">Pagamento, consegna, IBAN. Puoi inserire campi automatici.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div role="group" aria-labelledby="modello-cond-pagamento">
                  <div className="flex items-center justify-between mb-1">
                    <Label id="modello-cond-pagamento" className="text-xs text-muted-foreground">Condizioni di pagamento</Label>
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
                    readOnly={!puoModificare}
                  />
                </div>
                <div role="group" aria-labelledby="modello-cond-consegna">
                  <div className="flex items-center justify-between mb-1">
                    <Label id="modello-cond-consegna" className="text-xs text-muted-foreground">Condizioni di consegna</Label>
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
                    readOnly={!puoModificare}
                  />
                </div>
                <div>
                  <Label htmlFor="modello-coordinate-bancarie" className="text-xs text-muted-foreground">Coordinate bancarie (piè di pagina)</Label>
                  <Textarea
                    id="modello-coordinate-bancarie"
                    value={form.bank_details || ''}
                    onChange={e => updateForm({ bank_details: e.target.value })}
                    rows={2}
                    placeholder="IBAN: IT00 X000 0000 0000 0000 0000 000 · BIC: XXXXITXX"
                  />
                </div>
              </CardContent>
            </Card>
            </RiquadroEditor>

            {/* T4: Condizioni contrattuali e termini legali — un solo blocco,
                perché per chi firma sono la stessa cosa: le clausole in coda al PDF.
                Se il modello ha ancora il vecchio campo "termini legali" separato,
                lo si vede qui e lo si unisce con un click. */}
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  Condizioni contrattuali e termini legali
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Garanzia, varianti, penali, e poi privacy GDPR, diritto di recesso, foro competente: tutto in un'unica sezione in coda al PDF.
                  Se hai già un blocco "Condizioni e termini legali" nella libreria, collegalo sopra in "Componi l'offerta": vince su questo testo.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2 max-sm:min-h-11">
                  <Label htmlFor="modello-mostra-condizioni" className="text-sm font-medium">Mostra in PDF</Label>
                  <Switch
                    id="modello-mostra-condizioni"
                    checked={!!form.show_contractual_terms}
                    onCheckedChange={(v) => updateForm({ show_contractual_terms: v, show_legal_terms: v && !!form.legal_terms_text })}
                  />
                </div>
                {form.show_contractual_terms && (
                  <div role="group" aria-labelledby="modello-cond-testo">
                    <div className="flex items-center justify-between mb-1">
                      <Label id="modello-cond-testo" className="text-xs text-muted-foreground">Testo (clausole + termini legali)</Label>
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
                      readOnly={!puoModificare}
                    />
                    {/* Il modulo di recesso è una scelta dell'azienda, spenta di serie (21/09/2026). */}
                    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <Label htmlFor="modello-modulo-recesso" className="text-sm font-medium">Allega il modulo di recesso</Label>
                        <p id="modello-modulo-recesso-descrizione" className="text-xs text-muted-foreground">
                          Serve quando firmi con un privato a casa sua o a distanza (online, al telefono): senza, il cliente
                          può arrivare a recedere fino a 12 mesi dopo, anche a lavori finiti. A chi vende ad aziende o fa
                          firmare in sede non serve.
                        </p>
                      </div>
                      <Switch
                        id="modello-modulo-recesso"
                        aria-describedby="modello-modulo-recesso-descrizione"
                        checked={form.modulo_recesso_attivo === true}
                        onCheckedChange={(v) => updateForm({ modulo_recesso_attivo: v })}
                        aria-label="Allega il modulo di recesso"
                      />
                    </div>
                  </div>
                )}
                {!!form.legal_terms_text && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs space-y-2">
                    <p className="text-amber-900">
                      Questo modello ha ancora un testo "Termini legali" separato (vecchia impostazione). Nel PDF viene già stampato di seguito alle condizioni.
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
            </fieldset>

            {/* Footer actions: solo "Salva e chiudi" come backup, le azioni
                principali sono nella sticky toolbar in alto. */}
            <div className="flex flex-wrap gap-3 pb-8 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={handleCancel}>{puoModificare ? "Annulla e torna ai modelli" : "Torna ai modelli"}</Button>
              <Button
                onClick={async () => {
                  const saved = await handleSave(false);
                  if (!saved) return;
                  setEditing(false);
                  setEditId(null);
                }}
                disabled={!puoModificare || upsertTemplate.isPending}
                aria-describedby={!puoModificare ? ID_AVVISO_SOLA_LETTURA : undefined}
                className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500"
              >
                {upsertTemplate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 mr-2" aria-hidden="true" />}
                Salva e torna ai modelli
              </Button>
            </div>
          </div>

          {/* Right: preview kind-aware */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="pb-3 bg-slate-950 text-white">
                <CardTitle className="text-base flex items-center justify-between gap-3">
                  <span>Anteprima {KIND_META[formKind].label}</span>
                  <Badge variant="secondary" className="bg-white/10 text-white border-white/20" aria-hidden="true">
                    {KIND_META[formKind].emoji}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-white/65">
                  {formKind === 'offerta'
                    ? "Esempio di stile. Controlla il PDF generato prima dell'invio."
                    : `Blocco da riusare: si collega alle offerte. Nel PDF finale compare come ${KIND_META[formKind].label.toLowerCase()}.`}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 bg-slate-100 p-4">
                <div className="w-full overflow-auto rounded-lg bg-slate-200/80 p-4 shadow-inner">
                  <div className="flex min-w-max justify-center">
                    {formKind === 'offerta' ? (
                      <QuoteTemplatePreview
                        template={resolveQuoteTemplatePreview(form, templates, effectiveCompany?.brand_primary_color)}
                        companyName={effectiveCompany?.name}
                        logoSrc={logoSrcFor(form)}
                        coverSrc={getLogoPublicUrl(resolveQuoteTemplatePreview(form, templates).cover_image_url)}
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
                    <Button variant={previewPage === 'cover' ? 'default' : 'outline'} aria-pressed={previewPage === 'cover'} size="sm" onClick={() => setPreviewPage('cover')}>
                      Pagina 1
                    </Button>
                    <Button variant={previewPage === 'detail' ? 'default' : 'outline'} aria-pressed={previewPage === 'detail'} size="sm" onClick={() => setPreviewPage('detail')}>
                      Pagina 2
                    </Button>
                  </div>
                )}
                {/* Niente export su telefono. */}
                {!isMobile && (
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
                            // L'azienda del modello anche per un modello nuovo, non ancora
                            // salvato: la funzione legge logo, copertina e timbro solo dalla
                            // sua cartella (e solo se chi chiama ci può entrare).
                            template_data: { ...form, company_id: form.company_id ?? effectiveCompany?.id },
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
                        a.download = `anteprima-${(form.name || "modello").replace(/\s+/g, "-").toLowerCase()}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("PDF scaricato");
                      } catch (err: unknown) {
                        toast.error("Anteprima PDF non riuscita", { description: erroreInItaliano(err, "Non sono riuscito a preparare il PDF. Riprova tra poco.") });
                      } finally {
                        setDownloadingPdf(false);
                      }
                    }}
                  >
                    {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4 mr-2" aria-hidden="true" />}
                    Scarica PDF Anteprima
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      )}

      {/* L'offerta completa è il percorso principale. I blocchi singoli restano
          disponibili nel dialog solo per chi vuole una composizione avanzata. */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setShowAdvancedCreateTypes(false);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{showAdvancedCreateTypes ? "Aggiungi un blocco" : "Crea un'offerta completa"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {showAdvancedCreateTypes
                ? "Copertine, condizioni, schede prodotto e sezioni sono opzionali: usali solo quando vuoi riutilizzare un contenuto in più offerte."
                : "Ogni modello include copertina, testi, investimento, condizioni e stile. Dopo il salvataggio sarà disponibile nel preventivatore standard."}
            </p>
          </DialogHeader>
          {!showAdvancedCreateTypes ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mt-2">
                {COMPLETE_OFFER_BLUEPRINTS.map((blueprint) => {
                  const blueprintLayout = blueprint.patch.layout ?? "classic";
                  const layoutLabel = LAYOUTS.find((layout) => layout.key === blueprintLayout)?.label ?? "Classic";
                  return (
                    <button
                      key={blueprint.key}
                      type="button"
                      onClick={() => openCompleteOffer(blueprint)}
                      className="group rounded-xl border-2 border-orange-200 bg-gradient-to-b from-white to-orange-50/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-sm">
                          <FileText className="h-5 w-5" />
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                          {layoutLabel}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900">{blueprint.name}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{blueprint.description}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
                        <CircleCheck className="h-3.5 w-3.5" /> Completa di tutto
                        <ArrowRight className="ml-auto h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <p className="text-xs text-muted-foreground">I blocchi separati servono solo per contenuti condivisi tra più offerte.</p>
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setShowAdvancedCreateTypes(true)}>
                  <Blocks className="h-3.5 w-3.5" aria-hidden="true" /> Altri blocchi
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                {KIND_ORDER.filter((kind) => kind !== "offerta").map((k) => {
                  const meta = KIND_META[k];
                  const count = countsByKind[k] ?? 0;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setCreateDialogOpen(false);
                        setShowAdvancedCreateTypes(false);
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
              <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-xs text-slate-600" onClick={() => setShowAdvancedCreateTypes(false)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Torna alle offerte complete
              </Button>
            </>
          )}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annulla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma di eliminazione del modello */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina il modello</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <span className="space-y-2 block">
                  <span className="block">
                    Stai eliminando <strong>{deleteTarget.name}</strong>. Il modello verrà disattivato e non sarà più disponibile per nuove offerte.
                  </span>
                  {deleteImpactOffers.length > 0 ? (
                    <span className="block rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      Questo blocco è usato da {deleteImpactOffers.length} {deleteImpactOffers.length === 1 ? "offerta" : "offerte"}:{" "}
                      {deleteImpactOffers.slice(0, 3).map((offer) => offer.name).join(", ")}
                      {deleteImpactOffers.length > 3 ? ` e altre ${deleteImpactOffers.length - 3}` : ""}. Dopo l'eliminazione verrà scollegato automaticamente.
                    </span>
                  ) : (
                    <span className="block text-muted-foreground">Non risulta collegato ad altri modelli attivi.</span>
                  )}
                </span>
              ) : (
                "Vuoi eliminare questo modello? L'azione non è reversibile."
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
