/**
 * SettingsBranding — v8.6.60
 *
 * Pagina di branding aziendale white-label.
 *
 * Layout: 12-col grid responsive
 *   - lg+: 8/12 contenuto editabile · 4/12 preview live + status sticky
 *   - mobile: stack verticale
 *
 * Sorgente di verità unica: companies.brand_* + companies.logo_url.
 * Sincronizzazione automatica con company_branding.* per il login page.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useBranding } from "@/hooks/useBranding";
import { useWhitelabelGate } from "@/hooks/useWhitelabelGate";
import { useSaveSubdomain, useRequestDomainVerification, useVerifyCustomDomain } from "@/hooks/useBrandingByDomain";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Upload, Palette, Lock, HeadphonesIcon, Eye, Globe, Copy,
  CheckCircle2, RefreshCw, AlertTriangle, Image as ImageIcon,
} from "lucide-react";

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

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY validazione + contrasto
═══════════════════════════════════════════════════════════════════════════ */
const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function isValidHex(v: string): boolean {
  return HEX_REGEX.test(v);
}

/** RFC 1035: subdomain 3–63 chars, [a-z0-9-], no leading/trailing dash. */
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
function isValidSubdomain(v: string): boolean {
  if (!v) return false;
  if (v.length < 3 || v.length > 63) return false;
  return SUBDOMAIN_REGEX.test(v);
}

/** Calcolo luminanza relativa (WCAG 2.x). */
function relativeLuminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio WCAG (max 21:1). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */
function FileUploadButton({
  label, onUpload, isUploading, accept, disabled,
}: {
  label: string;
  onUpload: (file: File) => void;
  isUploading: boolean;
  accept?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept || "image/*"}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={isUploading || disabled}>
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
        {label}
      </Button>
    </div>
  );
}

function HexColorInput({
  label, value, onChange, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  const valid = isValidHex(draft);
  const handleBlur = () => {
    let v = draft.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    if (isValidHex(v)) {
      onChange(v.toUpperCase());
      setDraft(v.toUpperCase());
    } else {
      setDraft(value);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? draft : value}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); setDraft(e.target.value.toUpperCase()); }}
          className="h-9 w-9 rounded border cursor-pointer p-0.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Selettore colore ${label}`}
          disabled={disabled}
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="#1E40AF"
          aria-invalid={!valid}
          disabled={disabled}
          className={`font-mono text-sm flex-1 ${valid ? "" : "border-destructive focus-visible:ring-destructive"}`}
        />
      </div>
      {!valid && (
        <p className="text-[10px] text-destructive">Formato non valido (es. #1E40AF)</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREVIEW LIVE (sticky pannello destra)
═══════════════════════════════════════════════════════════════════════════ */
function LivePreview({
  primary, secondary, accent, textOnPrimary, platformName, logoUrl,
}: {
  primary: string; secondary: string; accent: string; textOnPrimary: string;
  platformName: string; logoUrl: string | null | undefined;
}) {
  return (
    <div className="rounded-xl border overflow-hidden shadow-sm bg-background">
      {/* Header navbar mock */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: primary, color: textOnPrimary }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-6 w-auto object-contain rounded bg-white/10 p-0.5" />
        ) : (
          <div className="h-6 w-6 rounded bg-white/20" />
        )}
        <span className="text-sm font-semibold truncate flex-1">{platformName || "EdiliziaInCloud"}</span>
        <span className="text-[10px] opacity-75 shrink-0">Utente ▼</span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3" style={{ backgroundColor: accent }}>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="px-3 py-1.5 rounded text-xs font-medium shadow-sm"
            style={{ backgroundColor: primary, color: textOnPrimary }}
          >
            Azione primaria
          </button>
          <span
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ backgroundColor: secondary, color: textOnPrimary }}
          >
            Badge
          </span>
        </div>
        <p className="text-xs" style={{ color: primary }}>
          Esempio di testo con il colore primario.
        </p>
        <div className="rounded border bg-white p-2 text-[10px] text-muted-foreground">
          Card sfondo bianco (contenuto)
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function SettingsBranding() {
  const { effectiveCompany, user } = useAuth();
  const { brand, saveBrand, uploadBrandFile, isLoading } = useBrandSettings();
  const { branding: companyBranding } = useBranding();
  const wlGate = useWhitelabelGate();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [confirmRemoveSub, setConfirmRemoveSub] = useState(false);

  const saveSubdomainMut = useSaveSubdomain(companyId);
  const requestVerifMut = useRequestDomainVerification(companyId);
  const verifyMut = useVerifyCustomDomain(companyId);

  // Sync subdomain/domain from DB
  useEffect(() => {
    if (companyBranding) {
      setSubdomain(companyBranding.subdomain || "");
      setCustomDomain(companyBranding.custom_domain || "");
    }
  }, [companyBranding]);

  const [form, setForm] = useState({
    brand_primary_color: "#1E40AF",
    brand_secondary_color: "#3B82F6",
    brand_accent_color: "#DBEAFE",
    brand_text_on_primary: "#FFFFFF",
    brand_platform_name: "",
    brand_hide_powered_by: false,
  });

  const buildFormFromBrand = (b: typeof brand) => ({
    brand_primary_color: b?.brand_primary_color || "#1E40AF",
    brand_secondary_color: b?.brand_secondary_color || "#3B82F6",
    brand_accent_color: b?.brand_accent_color || "#DBEAFE",
    brand_text_on_primary: b?.brand_text_on_primary || "#FFFFFF",
    brand_platform_name: b?.brand_platform_name || "",
    brand_hide_powered_by: b?.brand_hide_powered_by || false,
  });

  useEffect(() => {
    if (brand) setForm(buildFormFromBrand(brand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  const initialFormSnapshot = JSON.stringify(buildFormFromBrand(brand));
  const isDirty = JSON.stringify(form) !== initialFormSnapshot;

  const resetForm = () => {
    if (brand) setForm(buildFormFromBrand(brand));
  };

  // Contrast check: warning se primary vs text-on-primary < 4.5 (WCAG AA)
  const primaryContrast = useMemo(
    () => contrastRatio(form.brand_primary_color, form.brand_text_on_primary),
    [form.brand_primary_color, form.brand_text_on_primary],
  );
  const contrastWarning = primaryContrast < 4.5;

  const handleSave = async () => {
    const hexFields: Array<keyof typeof form> = [
      "brand_primary_color", "brand_secondary_color", "brand_accent_color", "brand_text_on_primary",
    ];
    for (const k of hexFields) {
      const v = form[k];
      if (typeof v === "string" && !isValidHex(v)) {
        toast.error(`Colore non valido in "${k.replace("brand_", "").replace(/_/g, " ")}"`);
        return;
      }
    }

    setSaving(true);
    try {
      await saveBrand.mutateAsync(form as Partial<typeof brand>);

      // Sync su company_branding (per login page + custom domain branding)
      if (companyId) {
        await supabase
          .from("company_branding" as never)
          .upsert(
            {
              company_id: companyId,
              primary_color: form.brand_primary_color,
              secondary_color: form.brand_secondary_color,
              accent_color: form.brand_accent_color,
              platform_name: form.brand_platform_name || null,
              hide_platform_branding: form.brand_hide_powered_by,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "company_id" } as never,
          )
          .then((r) => {
            if (r.error) console.warn("Sync company_branding skipped:", r.error.message);
          });
      }

      // Audit log best-effort
      if (user && effectiveCompany) {
        await supabase
          .from("company_addons_log" as never)
          .insert({
            company_id: effectiveCompany.id,
            addon_key: "white_label",
            action: "branding_updated",
            performed_by: user.id,
            performed_by_email: user.email,
            new_value: form,
          } as never)
          .then((r) => {
            if (r.error) console.warn("Audit log skipped:", r.error.message);
          });
      }
      toast.success("Brand aggiornato con successo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File, field: string, path: string) => {
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("File troppo grande (max 2 MB)");
      return;
    }
    setUploading(field);
    try {
      const url = await uploadBrandFile(file, path);
      await saveBrand.mutateAsync({ [field]: url } as Partial<typeof brand>);
      queryClient.invalidateQueries({ queryKey: ["effective-company"] });
      queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      toast.success("File caricato con successo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
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

  const handleSaveSubdomain = async () => {
    // Se l'utente sta SVUOTANDO un subdomain esistente → chiede conferma
    if (!subdomain && companyBranding?.subdomain) {
      setConfirmRemoveSub(true);
      return;
    }
    try {
      await saveSubdomainMut.mutateAsync(subdomain);
      toast.success(subdomain ? "Subdomain salvato" : "Subdomain rimosso");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error(msg);
    }
  };

  const confirmRemoveSubdomain = async () => {
    setConfirmRemoveSub(false);
    try {
      await saveSubdomainMut.mutateAsync("");
      toast.success("Subdomain rimosso");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isWhiteLabel = wlGate.isWhiteLabel || (brand?.white_label_enabled ?? false);
  // Gating capabilities dal tier: se tier presente, applica i flag
  const canColors = !wlGate.isWhiteLabel || wlGate.canChangeColors !== false;
  const canLoginPage = !wlGate.isWhiteLabel || wlGate.canChangeLoginPage !== false;
  const canCustomDomain = !wlGate.isWhiteLabel || wlGate.canCustomDomain !== false;
  const canHidePoweredBy = !wlGate.isWhiteLabel || wlGate.canHidePoweredBy !== false;

  return (
    <div className="space-y-6 max-w-7xl">
      <p className="text-muted-foreground">
        Personalizza colori, logo, dominio e l'aspetto della piattaforma per la tua azienda.
      </p>

      {/* Logo — sempre disponibile, riempie tutta la larghezza */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-muted-foreground" /> Logo aziendale
          </CardTitle>
          <CardDescription>
            Mostrato in sidebar, navbar e comunicazioni. Raccomandato: PNG/SVG trasparente, max 2 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-16 w-32 rounded border bg-muted/30 flex items-center justify-center p-2">
              {effectiveCompany?.logo_url ? (
                <img src={effectiveCompany.logo_url} alt="Logo" className="h-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">Nessun logo</span>
              )}
            </div>
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
              <h2 className="text-lg font-semibold">White Label — Funzione Premium</h2>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Personalizza completamente il tuo brand: colori, nome piattaforma, favicon, dominio personalizzato e molto altro.
              </p>
              {wlGate.tier && wlGate.tier !== "none" && (
                <Badge variant="secondary" className="mt-2">Piano attuale: {wlGate.tier}</Badge>
              )}
            </div>
            <Button variant="outline" onClick={() => window.open("/cliente/assistenza", "_blank")}>
              <HeadphonesIcon className="h-4 w-4 mr-2" />
              Contatta il Supporto per l'Upgrade
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
            {wlGate.tier !== "none" && (
              <Badge variant="outline" className="text-[10px]">Tier: {wlGate.name || wlGate.tier}</Badge>
            )}
          </div>

          {/* ═════ LAYOUT 2-COL: editor (8) + preview live (4) ══════════════════════ */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* COL SX — Editor */}
            <div className="lg:col-span-8 space-y-6">
              {/* Nome piattaforma */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nome piattaforma</CardTitle>
                  <CardDescription>
                    Sostituisce "EdiliziaInCloud" in navbar e titolo browser. Lascia vuoto per il default.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    value={form.brand_platform_name}
                    onChange={(e) => setForm((f) => ({ ...f, brand_platform_name: e.target.value }))}
                    placeholder="EdiliziaInCloud"
                    maxLength={50}
                  />
                </CardContent>
              </Card>

              {/* Palette colori */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" /> Palette colori
                  </CardTitle>
                  {!canColors && (
                    <CardDescription className="text-amber-600">
                      Il tuo tier ({wlGate.name}) non include la personalizzazione colori.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <HexColorInput
                      label="Colore primario" disabled={!canColors}
                      value={form.brand_primary_color}
                      onChange={(v) => setForm((f) => ({ ...f, brand_primary_color: v }))}
                    />
                    <HexColorInput
                      label="Colore secondario" disabled={!canColors}
                      value={form.brand_secondary_color}
                      onChange={(v) => setForm((f) => ({ ...f, brand_secondary_color: v }))}
                    />
                    <HexColorInput
                      label="Colore accento (sfondi chiari)" disabled={!canColors}
                      value={form.brand_accent_color}
                      onChange={(v) => setForm((f) => ({ ...f, brand_accent_color: v }))}
                    />
                    <HexColorInput
                      label="Testo su colore primario" disabled={!canColors}
                      value={form.brand_text_on_primary}
                      onChange={(v) => setForm((f) => ({ ...f, brand_text_on_primary: v }))}
                    />
                  </div>

                  {/* Contrast warning WCAG AA */}
                  {contrastWarning && (
                    <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Contrasto basso ({primaryContrast.toFixed(1)}:1). WCAG AA richiede &ge; 4.5:1 per testo
                        su sfondi. Il testo bianco potrebbe risultare illeggibile.
                      </AlertDescription>
                    </Alert>
                  )}

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
                          disabled={!canColors}
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
                </CardContent>
              </Card>

              {/* Favicon + Login BG: grid 2-col */}
              <div className="grid gap-6 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Favicon</CardTitle>
                    <CardDescription className="text-xs">Icona del browser (64×64px, PNG/ICO/SVG)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-10 w-10 rounded border bg-muted/30 flex items-center justify-center p-1">
                      {brand?.brand_favicon_url ? (
                        <img src={brand.brand_favicon_url} alt="Favicon" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-muted-foreground">Vuoto</span>
                      )}
                    </div>
                    <FileUploadButton
                      label="Carica favicon"
                      isUploading={uploading === "brand_favicon_url"}
                      onUpload={(f) => handleFileUpload(f, "brand_favicon_url", "favicon")}
                      accept="image/png,image/x-icon,image/svg+xml"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sfondo login</CardTitle>
                    <CardDescription className="text-xs">Opzionale (1920×1080px raccomandato)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-16 w-full rounded border bg-muted/30 overflow-hidden flex items-center justify-center">
                      {brand?.brand_login_bg_url ? (
                        <img src={brand.brand_login_bg_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Nessuno sfondo</span>
                      )}
                    </div>
                    <FileUploadButton
                      label="Carica sfondo"
                      isUploading={uploading === "brand_login_bg_url"}
                      onUpload={(f) => handleFileUpload(f, "brand_login_bg_url", "login-bg")}
                      disabled={!canLoginPage}
                    />
                    {!canLoginPage && (
                      <p className="text-[10px] text-amber-600">Non incluso nel tuo tier</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Opzioni avanzate */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Opzioni avanzate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Label htmlFor="bnd-hide-pby">Nascondi "Powered by EdiliziaInCloud"</Label>
                      <p className="text-xs text-muted-foreground">Rimuove il riferimento alla piattaforma nel footer e nelle email</p>
                      {!canHidePoweredBy && (
                        <p className="text-[10px] text-amber-600 mt-1">Non incluso nel tuo tier</p>
                      )}
                    </div>
                    <Switch
                      id="bnd-hide-pby"
                      checked={form.brand_hide_powered_by}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, brand_hide_powered_by: v }))}
                      disabled={!canHidePoweredBy}
                    />
                  </div>
                </CardContent>
              </Card>

              <Separator />

              {/* Subdomain */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" /> Subdomain
                  </CardTitle>
                  <CardDescription>Accedi alla piattaforma da un indirizzo personalizzato gratuito</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bnd-subdomain">Il tuo subdomain</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        id="bnd-subdomain"
                        value={subdomain}
                        onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="la-mia-azienda"
                        maxLength={63}
                        aria-invalid={subdomain.length > 0 && !isValidSubdomain(subdomain)}
                        className={`max-w-48 ${subdomain.length > 0 && !isValidSubdomain(subdomain) ? "border-destructive" : ""}`}
                      />
                      <span className="text-sm text-muted-foreground">.ediliziaincloud.com</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      3–63 caratteri, lettere minuscole/numeri/trattini, non può iniziare o finire con un trattino.
                    </p>
                    {subdomain.length > 0 && !isValidSubdomain(subdomain) && (
                      <p className="text-xs text-destructive">Formato subdomain non valido</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={
                      saveSubdomainMut.isPending ||
                      (subdomain.length > 0 && !isValidSubdomain(subdomain)) ||
                      subdomain === (companyBranding?.subdomain || "")
                    }
                    onClick={handleSaveSubdomain}
                  >
                    {saveSubdomainMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {!subdomain && companyBranding?.subdomain ? "Rimuovi subdomain" : "Salva subdomain"}
                  </Button>
                </CardContent>
              </Card>

              {/* Custom Domain */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" /> Dominio personalizzato
                  </CardTitle>
                  <CardDescription>
                    Usa il tuo dominio (es. crm.tuaazienda.it). Richiede configurazione DNS e potrebbe richiedere assistenza tecnica.
                  </CardDescription>
                  {!canCustomDomain && (
                    <CardDescription className="text-amber-600">
                      Il tuo tier ({wlGate.name}) non include domini personalizzati.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {(companyBranding as { custom_domain_verified?: boolean } | null)?.custom_domain_verified ? (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <AlertDescription className="flex items-center justify-between gap-2">
                        <span><strong>{customDomain}</strong> è verificato e attivo.</span>
                        <Button variant="ghost" size="sm" onClick={() => window.open(`https://${customDomain}`, "_blank")}>
                          Apri ↗
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="bnd-custom-domain">Dominio</Label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            id="bnd-custom-domain"
                            value={customDomain}
                            onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
                            placeholder="crm.tuaazienda.it"
                            className="max-w-64"
                            disabled={!canCustomDomain}
                          />
                          <Button
                            size="sm"
                            disabled={requestVerifMut.isPending || !customDomain || !canCustomDomain}
                            onClick={async () => {
                              try {
                                await requestVerifMut.mutateAsync(customDomain);
                                toast.success("Configurazione avviata — segui le istruzioni DNS");
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : "Errore";
                                toast.error(msg);
                              }
                            }}
                          >
                            {requestVerifMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Configura"}
                          </Button>
                        </div>
                      </div>

                      {(companyBranding as { custom_domain_cname?: string; custom_domain_verified?: boolean } | null)?.custom_domain_cname &&
                       !(companyBranding as { custom_domain_verified?: boolean } | null)?.custom_domain_verified && (
                        <Alert>
                          <AlertDescription className="space-y-3">
                            <p className="font-medium">Aggiungi questo record CNAME al tuo DNS:</p>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground w-16 shrink-0">Tipo:</span>
                                <Badge variant="secondary">CNAME</Badge>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground w-16 shrink-0">Nome:</span>
                                <code className="bg-muted px-2 py-0.5 rounded text-xs break-all">{customDomain}</code>
                                <Button
                                  variant="ghost" size="icon" aria-label="Copia nome CNAME" className="h-6 w-6"
                                  onClick={() => { navigator.clipboard.writeText(customDomain); toast.success("Copiato"); }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground w-16 shrink-0">Valore:</span>
                                <code className="bg-muted px-2 py-0.5 rounded text-xs break-all">
                                  {(companyBranding as { custom_domain_cname?: string }).custom_domain_cname}
                                </code>
                                <Button
                                  variant="ghost" size="icon" aria-label="Copia valore CNAME" className="h-6 w-6"
                                  onClick={() => {
                                    const v = (companyBranding as { custom_domain_cname?: string }).custom_domain_cname || "";
                                    navigator.clipboard.writeText(v);
                                    toast.success("Copiato");
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              La propagazione DNS può richiedere da 5 minuti a 48 ore.
                            </p>
                            <Button
                              size="sm" variant="outline"
                              disabled={verifyMut.isPending}
                              onClick={async () => {
                                try {
                                  const result = await verifyMut.mutateAsync();
                                  if (result.verified) {
                                    toast.success("Dominio verificato! ✓");
                                  } else {
                                    toast.error(result.error || "CNAME non ancora propagato. Riprova più tardi.");
                                  }
                                } catch {
                                  toast.error("Errore durante la verifica");
                                }
                              }}
                            >
                              {verifyMut.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Verifica ora
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* COL DX — Preview live sticky */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    Anteprima live
                  </h3>
                  <p className="text-xs text-muted-foreground">Si aggiorna man mano che modifichi.</p>
                </div>
                <LivePreview
                  primary={form.brand_primary_color}
                  secondary={form.brand_secondary_color}
                  accent={form.brand_accent_color}
                  textOnPrimary={form.brand_text_on_primary}
                  platformName={form.brand_platform_name}
                  logoUrl={effectiveCompany?.logo_url}
                />
                <Card className="border-muted">
                  <CardContent className="p-3 text-xs text-muted-foreground space-y-1.5">
                    <p className="flex items-center justify-between">
                      <span>Contrasto testo/primario:</span>
                      <span className={contrastWarning ? "text-amber-600 font-medium" : "text-emerald-700 font-medium"}>
                        {primaryContrast.toFixed(1)}:1 {contrastWarning ? "✗" : "✓"}
                      </span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span>Stato modifiche:</span>
                      <span className={isDirty ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                        {isDirty ? "Non salvate" : "Tutto salvato"}
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </aside>
          </div>

          {/* Save bar sticky in basso */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-3 z-10">
            {isDirty && (
              <span className="text-xs text-amber-600 mr-auto">• Modifiche non salvate</span>
            )}
            <Button variant="outline" onClick={resetForm} disabled={!isDirty || saving}>
              Annulla modifiche
            </Button>
            <Button onClick={handleSave} disabled={!isDirty || saving} size="lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Palette className="h-4 w-4 mr-2" />}
              Salva brand
            </Button>
          </div>
        </>
      )}

      {/* Dialog conferma rimozione subdomain */}
      <AlertDialog open={confirmRemoveSub} onOpenChange={setConfirmRemoveSub}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il subdomain?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{companyBranding?.subdomain}.ediliziaincloud.com</strong> non sarà più
              raggiungibile. Gli utenti che avevano salvato quel link riceveranno un 404.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveSubdomain}>Rimuovi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
