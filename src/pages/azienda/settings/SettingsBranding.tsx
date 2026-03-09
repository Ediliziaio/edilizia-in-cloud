import { useState, useRef } from "react";
import { useBranding, useBrandingMutation } from "@/hooks/useBranding";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Palette, Type, Globe, Mail, Eye } from "lucide-react";
import { Separator } from "@/components/ui/separator";

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Convert HSL string to hex for the color picker, and back
  const hslToDisplay = value || "";
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={hslToDisplay}
        onChange={(e) => onChange(e.target.value)}
        placeholder="es. 222 47% 11%"
        className="font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">Formato HSL: H S% L%</p>
    </div>
  );
}

function FileUploadButton({ label, onUpload, isUploading }: { label: string; onUpload: (file: File) => void; isUploading: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={isUploading}>
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
        {label}
      </Button>
    </div>
  );
}

export default function SettingsBranding() {
  const { branding, isLoading, refetch } = useBranding();
  const { upsert, uploadBrandingFile, companyId } = useBrandingMutation();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const [form, setForm] = useState({
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    sidebar_bg_color: "",
    sidebar_text_color: "",
    login_bg_color: "",
    login_title: "",
    login_subtitle: "",
    custom_domain: "",
    email_footer_text: "",
    hide_platform_branding: false,
  });

  const [initialized, setInitialized] = useState(false);

  if (!initialized && branding) {
    setForm({
      primary_color: branding.primary_color || "",
      secondary_color: branding.secondary_color || "",
      accent_color: branding.accent_color || "",
      sidebar_bg_color: branding.sidebar_bg_color || "",
      sidebar_text_color: branding.sidebar_text_color || "",
      login_bg_color: branding.login_bg_color || "",
      login_title: branding.login_title || "",
      login_subtitle: branding.login_subtitle || "",
      custom_domain: branding.custom_domain || "",
      email_footer_text: branding.email_footer_text || "",
      hide_platform_branding: branding.hide_platform_branding || false,
    });
    setInitialized(true);
  }

  if (!initialized && !isLoading && !branding) {
    setInitialized(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsert(form);
      await queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      toast.success("Branding salvato con successo");
    } catch (err: any) {
      toast.error(err.message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File, field: string, path: string) => {
    setUploading(field);
    try {
      const url = await uploadBrandingFile(file, path);
      await upsert({ [field]: url });
      await queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      toast.success("File caricato con successo");
    } catch (err: any) {
      toast.error(err.message || "Errore nel caricamento");
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">White-Label & Branding</h1>
        <p className="text-muted-foreground">Personalizza l'aspetto della piattaforma per la tua azienda</p>
      </div>

      {/* Logo & Favicon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Logo & Identità</CardTitle>
          <CardDescription>Carica il logo e la favicon personalizzati</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label>Logo sidebar</Label>
              {branding?.logo_url && (
                <img src={branding.logo_url} alt="Logo" className="h-12 object-contain rounded border p-1 bg-background" />
              )}
              <FileUploadButton
                label="Carica logo"
                isUploading={uploading === "logo_url"}
                onUpload={(f) => handleFileUpload(f, "logo_url", "logo")}
              />
            </div>
            <div className="space-y-3">
              <Label>Favicon</Label>
              {branding?.favicon_url && (
                <img src={branding.favicon_url} alt="Favicon" className="h-8 w-8 object-contain rounded border p-0.5 bg-background" />
              )}
              <FileUploadButton
                label="Carica favicon"
                isUploading={uploading === "favicon_url"}
                onUpload={(f) => handleFileUpload(f, "favicon_url", "favicon")}
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <Label>Logo pagina di login</Label>
            {branding?.login_logo_url && (
              <img src={branding.login_logo_url} alt="Login Logo" className="h-12 object-contain rounded border p-1 bg-background" />
            )}
            <FileUploadButton
              label="Carica logo login"
              isUploading={uploading === "login_logo_url"}
              onUpload={(f) => handleFileUpload(f, "login_logo_url", "login-logo")}
            />
          </div>
          <div className="space-y-3">
            <Label>Logo email</Label>
            {branding?.email_header_logo_url && (
              <img src={branding.email_header_logo_url} alt="Email Logo" className="h-10 object-contain rounded border p-1 bg-background" />
            )}
            <FileUploadButton
              label="Carica logo email"
              isUploading={uploading === "email_header_logo_url"}
              onUpload={(f) => handleFileUpload(f, "email_header_logo_url", "email-logo")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Colori</CardTitle>
          <CardDescription>Definisci la palette colori della piattaforma (formato HSL)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ColorInput label="Colore primario" value={form.primary_color} onChange={(v) => setForm(p => ({ ...p, primary_color: v }))} />
            <ColorInput label="Colore secondario" value={form.secondary_color} onChange={(v) => setForm(p => ({ ...p, secondary_color: v }))} />
            <ColorInput label="Colore accento" value={form.accent_color} onChange={(v) => setForm(p => ({ ...p, accent_color: v }))} />
            <ColorInput label="Sfondo sidebar" value={form.sidebar_bg_color} onChange={(v) => setForm(p => ({ ...p, sidebar_bg_color: v }))} />
            <ColorInput label="Testo sidebar" value={form.sidebar_text_color} onChange={(v) => setForm(p => ({ ...p, sidebar_text_color: v }))} />
            <ColorInput label="Sfondo login" value={form.login_bg_color} onChange={(v) => setForm(p => ({ ...p, login_bg_color: v }))} />
          </div>

          {form.primary_color && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Anteprima:</span>
              <div className="h-8 w-8 rounded-md border" style={{ backgroundColor: `hsl(${form.primary_color})` }} />
              {form.secondary_color && <div className="h-8 w-8 rounded-md border" style={{ backgroundColor: `hsl(${form.secondary_color})` }} />}
              {form.accent_color && <div className="h-8 w-8 rounded-md border" style={{ backgroundColor: `hsl(${form.accent_color})` }} />}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Login Page */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" /> Pagina di Login</CardTitle>
          <CardDescription>Personalizza i testi della pagina di accesso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input value={form.login_title} onChange={(e) => setForm(p => ({ ...p, login_title: e.target.value }))} placeholder="Es. Benvenuto nel portale" />
            </div>
            <div className="space-y-1.5">
              <Label>Sottotitolo</Label>
              <Input value={form.login_subtitle} onChange={(e) => setForm(p => ({ ...p, login_subtitle: e.target.value }))} placeholder="Es. Gestisci la tua azienda" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Domain */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Dominio Personalizzato</CardTitle>
          <CardDescription>Configura un dominio custom per accedere alla piattaforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Dominio</Label>
            <Input value={form.custom_domain} onChange={(e) => setForm(p => ({ ...p, custom_domain: e.target.value }))} placeholder="app.tuodominio.com" />
          </div>
          <p className="text-xs text-muted-foreground">
            Per attivare il dominio personalizzato, configura un record CNAME verso la piattaforma. Contatta il supporto per assistenza.
          </p>
        </CardContent>
      </Card>

      {/* Email Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Branding Email</CardTitle>
          <CardDescription>Personalizza il footer delle email inviate dalla piattaforma</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Testo footer email</Label>
            <Textarea
              value={form.email_footer_text}
              onChange={(e) => setForm(p => ({ ...p, email_footer_text: e.target.value }))}
              placeholder="Es. © 2026 La Tua Azienda S.r.l. - Tutti i diritti riservati"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Misc */}
      <Card>
        <CardHeader>
          <CardTitle>Opzioni avanzate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Nascondi branding piattaforma</Label>
              <p className="text-xs text-muted-foreground">Rimuovi il logo e i riferimenti alla piattaforma dalla sidebar</p>
            </div>
            <Switch
              checked={form.hide_platform_branding}
              onCheckedChange={(v) => setForm(p => ({ ...p, hide_platform_branding: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salva branding
        </Button>
      </div>
    </div>
  );
}
