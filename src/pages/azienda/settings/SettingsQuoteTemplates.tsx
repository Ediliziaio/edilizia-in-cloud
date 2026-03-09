import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import { COLOR_PALETTES, DEFAULT_TEMPLATE } from "@/types/quoteTemplate";
import type { QuoteTemplate, QuoteTemplateLayout, LogoPosition, LogoSize, FontFamily } from "@/types/quoteTemplate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Pencil, Star, Loader2, Upload, ImageIcon,
  LayoutGrid, Sparkles, Minus, Maximize, Download, Copy,
} from "lucide-react";

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

export default function SettingsQuoteTemplates() {
  const { role, effectiveCompany } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { templates, isLoading, upsertTemplate, deleteTemplate } = useQuoteTemplates();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<QuoteTemplate>>(DEFAULT_TEMPLATE);
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewPage, setPreviewPage] = useState<'cover' | 'detail'>('cover');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const updateForm = useCallback((patch: Partial<QuoteTemplate>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

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
    const { id, created_at, updated_at, ...rest } = tmpl;
    setEditId(null);
    setForm({ ...rest, name: `${tmpl.name} (copia)`, is_default: false });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditId(null);
  };

  const handleSave = async (asDefault = false) => {
    const payload: any = { ...form };
    if (asDefault) payload.is_default = true;
    if (editId) payload.id = editId;
    delete payload.created_at;
    delete payload.updated_at;
    if (!editId) delete payload.id;

    try {
      await upsertTemplate.mutateAsync(payload);
      toast.success(editId ? "Template aggiornato" : "Template creato");
      setEditing(false);
      setEditId(null);
    } catch (err: any) {
      toast.error(err.message || "Errore salvataggio");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo template?")) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Template eliminato");
      if (editId === id) handleCancel();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveCompany?.id) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${effectiveCompany.id}/template-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quote-template-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      updateForm({ logo_url: path });
      toast.success("Logo caricato");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
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

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Template Offerte</h1>
          <p className="text-muted-foreground text-sm">Personalizza l'aspetto grafico dei tuoi preventivi PDF</p>
        </div>
        {isAdmin && !editing && (
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Nuovo Template</Button>
        )}
      </div>

      {!editing ? (
        /* Template list */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tmpl => (
            <Card key={tmpl.id} className="relative overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{tmpl.layout}</p>
                  </div>
                  {tmpl.is_default && <Badge variant="secondary"><Star className="h-3 w-3 mr-1" />Default</Badge>}
                </div>
                <div className="flex justify-center">
                  <QuoteTemplatePreview template={tmpl} companyName={effectiveCompany?.name} scale={0.2} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(tmpl)}>
                    <Pencil className="h-3 w-3 mr-1" />Modifica
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(tmpl)} title="Duplica">
                    <Copy className="h-3 w-3" />
                  </Button>
                  {!tmpl.is_default && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(tmpl.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nessun template creato.</p>
              <Button variant="link" onClick={handleNew}>Crea il primo template</Button>
            </div>
          )}
        </div>
      ) : (
        /* Editor with preview */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: form */}
          <div className="lg:col-span-3 space-y-6 overflow-auto max-h-[calc(100vh-200px)] pr-2">
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
                        <QuoteTemplatePreview template={{ ...form, layout: l.key }} companyName={effectiveCompany?.name} scale={0.08} />
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
                        {form.logo_url && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{form.logo_url.split('/').pop()}</span>}
                      </div>
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
                  ].map(c => (
                    <div key={c.key}>
                      <Label className="text-xs">{c.label}</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={form[c.key] || '#000000'}
                          onChange={e => updateForm({ [c.key]: e.target.value } as any)}
                          className="h-8 w-8 rounded border border-border cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground">{form[c.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* E: Font */}
            <Card>
              <CardHeader><CardTitle className="text-base">Tipografia</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  {FONTS.map(f => (
                    <Button key={f.key} variant={form.font_family === f.key ? 'default' : 'outline'} size="sm" onClick={() => updateForm({ font_family: f.key })}>
                      {f.label}
                    </Button>
                  ))}
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
                ].map(el => (
                  <div key={el.key} className="flex items-center gap-3">
                    <Switch checked={(form as any)[el.key] ?? true} onCheckedChange={v => updateForm({ [el.key]: v } as any)} />
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

            {/* G: Texts */}
            <Card>
              <CardHeader><CardTitle className="text-base">Testi Personalizzabili</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tagline copertina</Label>
                  <Input value={form.cover_tagline || ''} onChange={e => updateForm({ cover_tagline: e.target.value })} placeholder="Es: La qualità che fa la differenza." />
                  <p className="text-xs text-muted-foreground mt-1">Apparirà sotto il titolo dell'offerta</p>
                </div>
                <div>
                  <Label>Testo footer pagine</Label>
                  <Textarea value={form.footer_text || ''} onChange={e => updateForm({ footer_text: e.target.value })} placeholder="Es: Per informazioni: info@azienda.it | 02 123456" rows={2} />
                  <p className="text-xs text-muted-foreground mt-1">Apparirà in fondo a ogni pagina</p>
                </div>
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
          <div className="lg:col-span-2 sticky top-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Anteprima</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <QuoteTemplatePreview
                  template={form}
                  companyName={effectiveCompany?.name}
                  page={previewPage}
                  scale={0.45}
                />
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
                      if (error) throw error;
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
                    } catch (err: any) {
                      toast.error(err.message || "Errore generazione PDF");
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
    </div>
  );
}
