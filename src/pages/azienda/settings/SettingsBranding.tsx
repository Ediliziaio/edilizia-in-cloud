import { useState, useRef, useEffect } from "react";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Palette, Lock, HeadphonesIcon, Eye } from "lucide-react";

const COLOR_PRESETS = [
  { name: "Blu Professionale", primary: "#1E40AF", secondary: "#3B82F6", accent: "#DBEAFE", text: "#FFFFFF" },
  { name: "Verde Fiducia", primary: "#166534", secondary: "#22C55E", accent: "#DCFCE7", text: "#FFFFFF" },
  { name: "Rosso Energia", primary: "#991B1B", secondary: "#EF4444", accent: "#FEE2E2", text: "#FFFFFF" },
  { name: "Grigio Elegante", primary: "#374151", secondary: "#6B7280", accent: "#F3F4F6", text: "#FFFFFF" },
  { name: "Viola Premium", primary: "#5B21B6", secondary: "#8B5CF6", accent: "#EDE9FE", text: "#FFFFFF" },
  { name: "Arancio", primary: "#C2410C", secondary: "#F97316", accent: "#FFF7ED", text: "#FFFFFF" },
  { name: "Teal Moderno", primary: "#115E59", secondary: "#14B8A6", accent: "#CCFBF1", text: "#FFFFFF" },
  { name: "Nero Lusso", primary: "#18181B", secondary: "#3F3F46", accent: "#F4F4F5", text: "#FFFFFF" },
];

function FileUploadButton({ label, onUpload, isUploading, accept }: { label: string; onUpload: (file: File) => void; isUploading: boolean; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept || "image/*"} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={isUploading}>
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
        {label}
      </Button>
    </div>
  );
}

function HexColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded border cursor-pointer p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1E40AF"
          className="font-mono text-sm flex-1"
        />
      </div>
    </div>
  );
}

export default function SettingsBranding() {
  const { effectiveCompany, user } = useAuth();
  const { brand, effectiveBrand, saveBrand, uploadBrandFile, isLoading } = useBrandSettings();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const [form, setForm] = useState({
    brand_primary_color: "#1E40AF",
    brand_secondary_color: "#3B82F6",
    brand_accent_color: "#DBEAFE",
    brand_text_on_primary: "#FFFFFF",
    brand_platform_name: "",
    brand_hide_powered_by: false,
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && brand) {
      setForm({
        brand_primary_color: brand.brand_primary_color || "#1E40AF",
        brand_secondary_color: brand.brand_secondary_color || "#3B82F6",
        brand_accent_color: brand.brand_accent_color || "#DBEAFE",
        brand_text_on_primary: brand.brand_text_on_primary || "#FFFFFF",
        brand_platform_name: brand.brand_platform_name || "",
        brand_hide_powered_by: brand.brand_hide_powered_by || false,
      });
      setInitialized(true);
    }
  }, [brand, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBrand.mutateAsync(form as any);
      // Log branding update
      if (user && effectiveCompany) {
        await supabase.from("company_addons_log" as never).insert({
          company_id: effectiveCompany.id,
          addon_key: "white_label",
          action: "branding_updated",
          performed_by: user.id,
          performed_by_email: user.email,
          new_value: form,
        } as never);
      }
      toast.success("Brand aggiornato con successo");
    } catch (err: any) {
      toast.error(err.message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File, field: string, path: string) => {
    setUploading(field);
    try {
      const url = await uploadBrandFile(file, path);
      await saveBrand.mutateAsync({ [field]: url } as any);
      toast.success("File caricato con successo");
    } catch (err: any) {
      toast.error(err.message || "Errore nel caricamento");
    } finally {
      setUploading(null);
    }
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setForm((f) => ({
      ...f,
      brand_primary_color: preset.primary,
      brand_secondary_color: preset.secondary,
      brand_accent_color: preset.accent,
      brand_text_on_primary: preset.text,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isWhiteLabel = brand?.white_label_enabled ?? false;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">White-Label & Branding</h1>
        <p className="text-muted-foreground">Personalizza l'aspetto della piattaforma per la tua azienda</p>
      </div>

      {/* Logo — always available */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Logo Aziendale</CardTitle>
          <CardDescription>Il logo viene mostrato nella sidebar e nelle comunicazioni</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {effectiveCompany?.logo_url && (
              <img src={effectiveCompany.logo_url} alt="Logo" className="h-12 object-contain rounded border p-1 bg-background" />
            )}
            <FileUploadButton
              label="Carica logo"
              isUploading={uploading === "logo_url"}
              onUpload={(f) => handleFileUpload(f, "logo_url", "logo")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Premium Gate */}
      {!isWhiteLabel && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center space-y-4">
            <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">White Label — Funzione Premium</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Personalizza completamente il tuo brand: colori, nome piattaforma, favicon e sfondo login.
              </p>
            </div>
            <Button variant="outline" onClick={() => window.open("/cliente/assistenza", "_blank")}>
              <HeadphonesIcon className="h-4 w-4 mr-2" />
              Contatta il Supporto
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Full branding config — only if white-label enabled */}
      {isWhiteLabel && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Palette className="h-5 w-5" /> Brand Personalizzato
            </h2>
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">ATTIVO</Badge>
          </div>

          {/* Platform Name */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nome Piattaforma</CardTitle>
              <CardDescription>Verrà mostrato nella navbar e nel browser al posto di "EdiliziaInCloud"</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={form.brand_platform_name}
                onChange={(e) => setForm((f) => ({ ...f, brand_platform_name: e.target.value }))}
                placeholder="Lascia vuoto per il nome predefinito"
              />
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Palette Colori</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HexColorInput label="Colore primario" value={form.brand_primary_color} onChange={(v) => setForm((f) => ({ ...f, brand_primary_color: v }))} />
                <HexColorInput label="Colore secondario" value={form.brand_secondary_color} onChange={(v) => setForm((f) => ({ ...f, brand_secondary_color: v }))} />
                <HexColorInput label="Sfondo leggero" value={form.brand_accent_color} onChange={(v) => setForm((f) => ({ ...f, brand_accent_color: v }))} />
                <HexColorInput label="Testo su colore scuro" value={form.brand_text_on_primary} onChange={(v) => setForm((f) => ({ ...f, brand_text_on_primary: v }))} />
              </div>

              {/* Presets */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Palette predefinite</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <Button
                      key={preset.name}
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={() => applyPreset(preset)}
                    >
                      <div className="flex gap-0.5">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.primary }} />
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.secondary }} />
                      </div>
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg border overflow-hidden">
                <div className="px-4 py-2 flex items-center gap-3" style={{ backgroundColor: form.brand_primary_color, color: form.brand_text_on_primary }}>
                  <span className="text-sm font-semibold">{form.brand_platform_name || "Navbar"}</span>
                  <span className="ml-auto text-xs opacity-75">Utente ▼</span>
                </div>
                <div className="p-3 flex items-center gap-3" style={{ backgroundColor: form.brand_accent_color }}>
                  <Button size="sm" style={{ backgroundColor: form.brand_primary_color, color: form.brand_text_on_primary, border: "none" }}>
                    Salva
                  </Button>
                  <Badge style={{ backgroundColor: form.brand_secondary_color, color: form.brand_text_on_primary }}>Attivo</Badge>
                  <span className="text-xs" style={{ color: form.brand_primary_color }}>Testo primario</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Favicon */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Favicon</CardTitle>
              <CardDescription>Icona del browser (raccomandata: 64×64px, PNG o ICO)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {brand?.brand_favicon_url && (
                <img src={brand.brand_favicon_url} alt="Favicon" className="h-8 w-8 object-contain rounded border p-0.5 bg-background" />
              )}
              <FileUploadButton
                label="Carica favicon"
                isUploading={uploading === "brand_favicon_url"}
                onUpload={(f) => handleFileUpload(f, "brand_favicon_url", "favicon")}
                accept="image/png,image/x-icon,image/svg+xml"
              />
            </CardContent>
          </Card>

          {/* Login Background */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sfondo Pagina di Login</CardTitle>
              <CardDescription>Immagine opzionale per la pagina di accesso (raccomandata: 1920×1080px)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {brand?.brand_login_bg_url && (
                <img src={brand.brand_login_bg_url} alt="Login BG" className="h-24 w-40 object-cover rounded border bg-background" />
              )}
              <FileUploadButton
                label="Carica sfondo"
                isUploading={uploading === "brand_login_bg_url"}
                onUpload={(f) => handleFileUpload(f, "brand_login_bg_url", "login-bg")}
              />
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opzioni avanzate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Nascondi "Powered by EdiliziaInCloud"</Label>
                  <p className="text-xs text-muted-foreground">Rimuove il riferimento alla piattaforma nel footer</p>
                </div>
                <Switch
                  checked={form.brand_hide_powered_by}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, brand_hide_powered_by: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setInitialized(false)}>
              Annulla modifiche
            </Button>
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              💾 Salva Brand
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
