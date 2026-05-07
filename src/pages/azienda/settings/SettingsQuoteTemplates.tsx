import React, { useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import {
  COLOR_PALETTES, DEFAULT_TEMPLATE, FONT_SIZE_PRESETS, LINE_HEIGHT_PRESETS,
  ROW_DENSITY_LABELS, TABLE_BORDERS_LABELS, HEADER_ALIGNMENT_LABELS,
} from "@/types/quoteTemplate";
import type {
  QuoteTemplate, QuoteTemplateLayout, LogoPosition, LogoSize, FontFamily,
  RowDensity, TableBorders, TextAlignment,
} from "@/types/quoteTemplate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Pencil, Star, Loader2, Upload, ImageIcon, Download, Copy, FileText, Eye,
  CheckCircle2, Palette, Wand2, FileImage, Scale, ScrollText, Tag,
} from "lucide-react";
import { MergeTagInserter } from "@/components/quotes/MergeTagInserter";

const LAYOUTS: { key: QuoteTemplateLayout; label: string; desc: string }[] = [
  { key: 'classic', label: 'Classic', desc: 'Header bianco, bordo colorato. Professionale.' },
  { key: 'modern', label: 'Modern', desc: 'Header full-color. Design contemporaneo.' },
  { key: 'minimal', label: 'Minimal', desc: 'Solo linee e tipografia. Elegante.' },
  { key: 'bold', label: 'Bold', desc: 'Sidebar colorata. Massimo impatto.' },
];

const FONTS: { key: FontFamily; label: string; desc: string }[] = [
  { key: 'helvetica', label: 'Helvetica', desc: 'Moderno, leggibile' },
  { key: 'times', label: 'Times New Roman', desc: 'Classico, formale' },
  { key: 'courier', label: 'Courier', desc: 'Monospace' },
];

const DESIGN_PRESETS: Array<{ name: string; desc: string; patch: Partial<QuoteTemplate> }> = [
  {
    name: "Executive",
    desc: "Look premium, ideale per offerte ad alto valore.",
    patch: {
      layout: "modern",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 1.9,
      line_height: 1.45,
      row_density: "comfortable",
      table_borders: "horizontal",
      page_margin_mm: 20,
      table_zebra: true,
    },
  },
  {
    name: "Compatto",
    desc: "Più righe per pagina, ottimo per listini lunghi.",
    patch: {
      layout: "classic",
      font_family: "helvetica",
      font_size_base: 9,
      heading_size_scale: 1.5,
      line_height: 1.25,
      row_density: "compact",
      table_borders: "horizontal",
      page_margin_mm: 14,
      table_zebra: true,
    },
  },
  {
    name: "Cantiere premium",
    desc: "Impatto forte e margini chiari per clienti retail.",
    patch: {
      layout: "bold",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 2.0,
      line_height: 1.4,
      row_density: "normal",
      table_borders: "all",
      page_margin_mm: 18,
      table_zebra: false,
      primary_color: "#EA580C",
      secondary_color: "#F97316",
      accent_color: "#FFF7ED",
      header_text_color: "#FFFFFF",
    },
  },
];

const getLogoPublicUrl = (path: string) =>
  supabase.storage.from("quote-template-assets").getPublicUrl(path).data.publicUrl;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);

type TemplateFormPayload = Partial<Omit<QuoteTemplate, "created_at" | "updated_at">>;
type TemplateColorKey = "primary_color" | "secondary_color" | "accent_color" | "text_color" | "header_text_color";
type TemplateVisibilityKey =
  | "show_quote_number"
  | "show_validity_date"
  | "show_company_details"
  | "show_client_details"
  | "show_payment_terms"
  | "show_delivery_terms"
  | "show_notes"
  | "show_page_numbers";

export default function SettingsQuoteTemplates() {
  const { role, effectiveCompany } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { templates, isLoading, fetchError, upsertTemplate, deleteTemplate } = useQuoteTemplates();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<QuoteTemplate>>(DEFAULT_TEMPLATE);
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<'cover' | 'detail'>('cover');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const updateForm = useCallback((patch: Partial<QuoteTemplate>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

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

  const handleNew = () => {
    setEditId(null);
    setForm({ ...DEFAULT_TEMPLATE, name: 'Nuovo Template', is_default: false });
    setEditing(true);
  };

  const handleEdit = (tmpl: QuoteTemplate) => {
    setEditId(tmpl.id);
    setForm({ ...tmpl });
    setEditing(true);
  };

  const handleDuplicate = (tmpl: QuoteTemplate) => {
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = tmpl;
    setEditId(null);
    setForm({ ...rest, name: `${tmpl.name} (copia)`, is_default: false });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditId(null);
  };

  const handleSave = async (asDefault = false) => {
    const templateName = form.name?.trim();
    if (!templateName) {
      toast.error("Inserisci un nome template");
      return;
    }
    const payload: TemplateFormPayload = { ...form };
    payload.name = templateName;
    if (asDefault) payload.is_default = true;
    if (editId) payload.id = editId;
    if (!editId) delete payload.id;

    try {
      await upsertTemplate.mutateAsync(payload);
      toast.success(editId ? "Template aggiornato" : "Template creato");
      setEditing(false);
      setEditId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
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
  const legalRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const applyPalette = (p: typeof COLOR_PALETTES[number]) => {
    updateForm({
      primary_color: p.primary,
      secondary_color: p.secondary,
      accent_color: p.accent,
      header_text_color: p.headerText,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Template Offerte</h1>
            <p className="text-sm text-muted-foreground">
              Personalizza il layout, colori, logo e tipografia dei PDF di preventivi e offerte.
              Ogni modifica viene mostrata in anteprima live qui sotto.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && templates.length > 0 && (
            <Badge variant="outline" className="gap-1 text-[11px] h-6">
              <Eye className="h-3 w-3" />
              {templates.length} template · {templates.filter((t) => t.is_default).length > 0 ? "default attivo" : "nessun default"}
            </Badge>
          )}
          {editing && (
            <Badge variant={designScore >= 80 ? "secondary" : "outline"} className="gap-1 text-[11px] h-6">
              <CheckCircle2 className="h-3 w-3" />
              Qualità layout {designScore}%
            </Badge>
          )}
          {isAdmin && !editing && (
            <Button onClick={handleNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Nuovo Template</Button>
          )}
        </div>
      </div>

      {!editing ? (
        /* Template list */
        fetchError ? (
          <Card className="p-8 text-center">
            <p className="text-destructive font-medium">Errore nel caricamento dei template</p>
            <p className="text-sm text-muted-foreground mt-1">{(fetchError as Error).message}</p>
          </Card>
        ) : !isLoading && templates.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nessun template trovato</p>
            {isAdmin && (
              <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Crea il primo template</Button>
            )}
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tmpl => (
            <Card key={tmpl.id} className="relative overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {tmpl.logo_url ? (
                      <img src={getLogoPublicUrl(tmpl.logo_url)} alt="" className="h-8 w-8 rounded object-contain border border-border bg-muted/50 p-0.5" />
                    ) : (
                      <div className="h-8 w-8 rounded border border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/30">
                        <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{tmpl.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{tmpl.layout}</p>
                    </div>
                  </div>
                  {tmpl.is_default && <Badge variant="secondary"><Star className="h-3 w-3 mr-1" />Default</Badge>}
                </div>
                <div className="flex justify-center">
                  <QuoteTemplatePreview template={tmpl} companyName={effectiveCompany?.name} logoSrc={logoSrcFor(tmpl)} scale={0.2} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(tmpl)}>
                    <Pencil className="h-3 w-3 mr-1" />Modifica
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(tmpl)} title="Duplica">
                    <Copy className="h-3 w-3" />
                  </Button>
                  {!tmpl.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(tmpl.id)}
                      aria-label="Elimina template"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )
      ) : (
        /* Editor with preview */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: form */}
          <div className="lg:col-span-3 space-y-6 overflow-auto max-h-[calc(100vh-200px)] pr-2">
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

            {/* A: Info base */}
            <Card>
              <CardHeader><CardTitle className="text-base">Informazioni Base</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nome template *</Label>
                  <Input value={form.name || ''} onChange={e => updateForm({ name: e.target.value })} placeholder="Es. Classico Aziendale" />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_default ?? false} onCheckedChange={v => updateForm({ is_default: v })} />
                  <Label>Imposta come default</Label>
                </div>
              </CardContent>
            </Card>

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
                          <img
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

            {/* D: Palette */}
            <Card>
              <CardHeader><CardTitle className="text-base">Palette Colori</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COLOR_PALETTES.map(p => (
                    <button
                      key={p.name}
                      onClick={() => applyPalette(p)}
                      className={`border rounded-lg p-2 text-center text-xs transition-all hover:border-primary ${
                        form.primary_color === p.primary && form.accent_color === p.accent
                          ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                      }`}
                    >
                      <div className="flex gap-1 justify-center mb-1">
                        <div className="h-5 w-5 rounded-full" style={{ backgroundColor: p.primary }} />
                        <div className="h-5 w-5 rounded-full" style={{ backgroundColor: p.accent }} />
                      </div>
                      <span className="text-muted-foreground">{p.name}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  {[
                    { key: 'primary_color' as const, label: 'Primario' },
                    { key: 'secondary_color' as const, label: 'Secondario' },
                    { key: 'accent_color' as const, label: 'Sfondo leggero' },
                    { key: 'text_color' as const, label: 'Testo corpo' },
                    { key: 'header_text_color' as const, label: 'Testo header' },
                  ].map((c: { key: TemplateColorKey; label: string }) => (
                    <div key={c.key}>
                      <Label className="text-xs">{c.label}</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={form[c.key] || '#000000'}
                          onChange={e => updateForm({ [c.key]: e.target.value })}
                          className="h-8 w-8 rounded border border-border cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground">{form[c.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* E: Tipografia — font, dimensioni, righe */}
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
                            <img src={getLogoPublicUrl(form.cover_image_url)} alt="Cover" className="h-full w-full object-cover" />
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
                  <Textarea
                    ref={paymentRef}
                    value={form.payment_terms_text || ''}
                    onChange={e => updateForm({ payment_terms_text: e.target.value })}
                    rows={3}
                    placeholder="Es. Acconto 30% alla firma, 40% a inizio lavori, saldo {{cliente.nome}} a consegna chiavi in mano."
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
                  <Textarea
                    ref={deliveryRef}
                    value={form.delivery_terms_text || ''}
                    onChange={e => updateForm({ delivery_terms_text: e.target.value })}
                    rows={2}
                    placeholder="3-4 settimane dalla conferma. Cantiere: {{cantiere.indirizzo}}"
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

            {/* T4: Termini contrattuali estesi */}
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-blue-600" />
                  Termini contrattuali
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Clausole contrattuali specifiche (oltre pagamento/consegna): garanzia, varianti, penali, modifica progetto, ecc.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2">
                  <Label className="text-sm font-medium">Mostra in PDF</Label>
                  <Switch checked={!!form.show_contractual_terms} onCheckedChange={(v) => updateForm({ show_contractual_terms: v })} />
                </div>
                {form.show_contractual_terms && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Testo clausole contrattuali</Label>
                      <MergeTagInserter
                        targetRef={contractualRef}
                        currentValue={form.contractual_terms_text ?? ""}
                        onInsert={(v) => updateForm({ contractual_terms_text: v })}
                      />
                    </div>
                    <Textarea
                      ref={contractualRef}
                      value={form.contractual_terms_text ?? ''}
                      onChange={e => updateForm({ contractual_terms_text: e.target.value })}
                      rows={8}
                      placeholder={`Es.\n\n1. OGGETTO\nL'azienda {{azienda.ragione_sociale}} si impegna ad eseguire i lavori descritti per il cliente {{cliente.nome_completo}} presso {{cantiere.indirizzo}}.\n\n2. GARANZIA\nLa garanzia è di 24 mesi dalla data di consegna.\n\n3. VARIANTI\nEventuali varianti devono essere concordate per iscritto...`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* T5: Termini legali */}
            <Card className="border-purple-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="h-4 w-4 text-purple-600" />
                  Termini legali
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Privacy GDPR, diritto di recesso, foro competente. Apparirà in coda al PDF.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/40 px-3 py-2">
                  <Label className="text-sm font-medium">Mostra in PDF</Label>
                  <Switch checked={!!form.show_legal_terms} onCheckedChange={(v) => updateForm({ show_legal_terms: v })} />
                </div>
                {form.show_legal_terms && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Testo termini legali</Label>
                      <MergeTagInserter
                        targetRef={legalRef}
                        currentValue={form.legal_terms_text ?? ""}
                        onInsert={(v) => updateForm({ legal_terms_text: v })}
                      />
                    </div>
                    <Textarea
                      ref={legalRef}
                      value={form.legal_terms_text ?? ''}
                      onChange={e => updateForm({ legal_terms_text: e.target.value })}
                      rows={8}
                      placeholder={`Es.\n\nPRIVACY (GDPR Reg. UE 2016/679)\nI dati personali di {{cliente.nome_completo}} saranno trattati nel rispetto del GDPR per l'esecuzione del contratto...\n\nDIRITTO DI RECESSO\nIl cliente può recedere dal contratto entro 14 giorni come da art. 52 D.lgs 206/2005...\n\nFORO COMPETENTE\nPer ogni controversia è competente il Foro di [città azienda].`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* H: Actions */}
            <div className="flex gap-3 pb-8">
              <Button variant="outline" onClick={handleCancel}>Annulla</Button>
              <Button onClick={() => handleSave(false)} disabled={upsertTemplate.isPending}>
                {upsertTemplate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salva Template
              </Button>
              <Button variant="secondary" onClick={() => handleSave(true)} disabled={upsertTemplate.isPending}>
                Salva e Imposta Default
              </Button>
            </div>
          </div>

          {/* Right: preview */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="pb-3 bg-slate-950 text-white">
                <CardTitle className="text-base flex items-center justify-between gap-3">
                  <span>Anteprima PDF</span>
                  <Badge variant="secondary" className="bg-white/10 text-white border-white/20">
                    {previewPage === "cover" ? "Pagina 1" : "Pagina 2"}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-white/65">
                  Anteprima fedele a logo, margini, tabella, footer e condizioni.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3 bg-slate-100 p-4">
                <div className="w-full overflow-auto rounded-lg bg-slate-200/80 p-4 shadow-inner">
                  <div className="flex min-w-max justify-center">
                    <QuoteTemplatePreview
                      template={form}
                      companyName={effectiveCompany?.name}
                      logoSrc={logoSrcFor(form)}
                      page={previewPage}
                      scale={0.45}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant={previewPage === 'cover' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewPage('cover')}>
                    Pagina 1
                  </Button>
                  <Button variant={previewPage === 'detail' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewPage('detail')}>
                    Pagina 2
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={downloadingPdf}
                  onClick={async () => {
                    setDownloadingPdf(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
                        body: { preview_mode: true, template_data: form, company_name: effectiveCompany?.name },
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
      )}

      {/* Delete template confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo template? L'azione non è reversibile.
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
    </div>
  );
}
