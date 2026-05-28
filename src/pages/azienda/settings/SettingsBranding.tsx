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
import { useState, useRef, useEffect } from "react";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useBranding } from "@/hooks/useBranding";
import { useWhitelabelGate } from "@/hooks/useWhitelabelGate";
import {
  isValidCustomDomain,
  normalizeCustomDomainInput,
  useSaveSubdomain,
  useRequestDomainVerification,
  useVerifyCustomDomain,
} from "@/hooks/useBrandingByDomain";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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
  Loader2, Upload, Palette, Lock, HeadphonesIcon, Globe, Copy,
  CheckCircle2, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import { LogoUploader } from "@/components/settings/LogoUploader";

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY validazione
═══════════════════════════════════════════════════════════════════════════ */

/** RFC 1035: subdomain 3–63 chars, [a-z0-9-], no leading/trailing dash. */
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
const isValidSubdomain = (v: string): boolean => {
  if (!v) return false;
  if (v.length < 3 || v.length > 63) return false;
  return SUBDOMAIN_REGEX.test(v);
};

const buildLoginBackgroundValue = (url: string): string =>
  `url("${url.replace(/"/g, "%22")}") center / cover no-repeat`;

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copiato");
  } catch {
    toast.error("Non riesco a copiare automaticamente");
  }
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

/* Note: HexColorInput e LivePreview rimossi insieme alla palette colori.
   Quando il binding HEX→HSL al design system sarà pronto, ripristinare dalla
   storia git (commit d09fe07e) e abilitare la sezione colori. */

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function SettingsBranding() {
  const { effectiveCompany, user, refreshAuth } = useAuth();
  const permissions = usePermissions();
  const { brand, saveBrand, uploadBrandFile, isLoading } = useBrandSettings();
  const { branding: companyBranding } = useBranding();
  const wlGate = useWhitelabelGate();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const canEdit = permissions.isAdmin;
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

  const handleSave = async () => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
    // Validazione hex non più necessaria: la palette colori è disabilitata
    // (i campi brand_*_color sono salvati ma non editabili dalla UI).
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
              logo_url: effectiveCompany?.logo_url || null,
              favicon_url: brand?.brand_favicon_url || null,
              login_bg_color: brand?.brand_login_bg_url
                ? buildLoginBackgroundValue(brand.brand_login_bg_url)
                : companyBranding?.login_bg_color || null,
              is_active: true,
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
      queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      queryClient.invalidateQueries({ queryKey: ["branding-by-domain"] });
      toast.success("Brand aggiornato con successo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File, field: string, path: string) => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("File troppo grande (max 2 MB)");
      return;
    }
    setUploading(field);
    try {
      const url = await uploadBrandFile(file, path);
      await saveBrand.mutateAsync({ [field]: url } as Partial<typeof brand>);
      if (companyId) {
        const companyBrandingPatch: Record<string, unknown> = {
          company_id: companyId,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (field === "brand_favicon_url") {
          companyBrandingPatch.favicon_url = url;
        }
        if (field === "brand_login_bg_url") {
          companyBrandingPatch.login_bg_color = buildLoginBackgroundValue(url);
        }
        await supabase
          .from("company_branding" as never)
          .upsert(companyBrandingPatch as never, { onConflict: "company_id" } as never)
          .then((r) => {
            if (r.error) console.warn("Sync company_branding skipped:", r.error.message);
          });
      }
      queryClient.invalidateQueries({ queryKey: ["effective-company"] });
      queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      queryClient.invalidateQueries({ queryKey: ["branding-by-domain"] });
      toast.success("File caricato con successo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  };

  const handleSaveSubdomain = async () => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
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
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
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
  // Capabilities tier (la palette colori è temporaneamente disabilitata sul
  // frontend a prescindere dal tier).
  const canLoginPage = !wlGate.isWhiteLabel || wlGate.canChangeLoginPage !== false;
  const canCustomDomain = !wlGate.isWhiteLabel || wlGate.canCustomDomain !== false;
  const canHidePoweredBy = !wlGate.isWhiteLabel || wlGate.canHidePoweredBy !== false;
  const normalizedCustomDomain = normalizeCustomDomainInput(customDomain);
  const customDomainInvalid = customDomain.length > 0 && !isValidCustomDomain(customDomain);

  return (
    <div className="space-y-6 max-w-7xl">
      <p className="text-muted-foreground">
        Personalizza colori, logo, dominio e l'aspetto della piattaforma per la tua azienda.
      </p>
      {!canEdit && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Puoi visualizzare il white-label, ma non modificarlo. Serve un account amministratore aziendale.
          </AlertDescription>
        </Alert>
      )}

      {/* Logo — gestito dal componente condiviso (stesso usato in Profilo aziendale).
          Il logo è UNIVOCO: companies.logo_url → mostrato in sidebar, navbar,
          email, PDF preventivi, portale clienti, branding white-label, login page. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-muted-foreground" /> Logo aziendale
          </CardTitle>
          <CardDescription>
            Lo stesso logo viene mostrato in sidebar, navbar, email, preventivi PDF, portale
            clienti e pagina di login. Modifica qui o in <a href="/azienda/impostazioni/profilo" className="underline">Profilo aziendale</a>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUploader
            company={effectiveCompany}
            disabled={!canEdit}
            onLogoUpdated={async (logoUrl) => {
              if (companyId) {
                await supabase
                  .from("company_branding" as never)
                  .upsert(
                    {
                      company_id: companyId,
                      logo_url: logoUrl ?? null,
                      is_active: true,
                      updated_at: new Date().toISOString(),
                    } as never,
                    { onConflict: "company_id" } as never,
                  )
                  .then((r) => {
                    if (r.error) console.warn("Sync company_branding logo skipped:", r.error.message);
                  });
              }
              // Invalida tutte le query che leggono il logo per propagazione istantanea
              queryClient.invalidateQueries({ queryKey: ["effective-company"] });
              queryClient.invalidateQueries({ queryKey: ["company-branding"] });
              queryClient.invalidateQueries({ queryKey: ["branding-by-domain"] });
              queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
              // Refresh AuthContext per aggiornare effectiveCompany live
              await refreshAuth();
            }}
          />
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

          {/* ═════ LAYOUT FULL-WIDTH (preview colori rimossa: la palette è in arrivo) ═ */}
          <div className="space-y-6">
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
                    disabled={!canEdit}
                  />
                </CardContent>
              </Card>

              {/* Palette colori — disabilitata: i colori vengono salvati nel DB
                  ma il design system dell'app usa --primary (HSL) non
                  --brand-primary (HEX). Non applichiamo finché non c'è il
                  binding completo HEX→HSL per evitare di rompere il look. */}
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" /> Palette colori
                    <Badge variant="secondary" className="text-[10px]">In arrivo</Badge>
                  </CardTitle>
                  <CardDescription>
                    La personalizzazione dei colori della piattaforma è in fase di rilascio.
                    Stiamo lavorando al binding completo con il design system per garantire
                    un'esperienza visiva coerente. Per ora restano disponibili logo, favicon,
                    nome piattaforma, sfondo login e dominio personalizzato.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Palette className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Vuoi i colori del tuo brand sulla piattaforma?{" "}
                      <a href="/cliente/assistenza" className="text-primary underline">
                        Contatta l'assistenza
                      </a>{" "}
                      — possiamo applicarli manualmente al tuo account.
                    </AlertDescription>
                  </Alert>
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
                      disabled={!canEdit}
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
                      disabled={!canEdit || !canLoginPage}
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
                      disabled={!canEdit || !canHidePoweredBy}
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
                        disabled={!canEdit}
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
                      !canEdit ||
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
                            aria-invalid={customDomainInvalid}
                            className={`max-w-64 ${customDomainInvalid ? "border-destructive" : ""}`}
                            disabled={!canEdit || !canCustomDomain}
                          />
                          <Button
                            size="sm"
                            disabled={requestVerifMut.isPending || !customDomain || customDomainInvalid || !canEdit || !canCustomDomain}
                            onClick={async () => {
                              try {
                                await requestVerifMut.mutateAsync(normalizedCustomDomain);
                                setCustomDomain(normalizedCustomDomain);
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
                        {customDomainInvalid ? (
                          <p className="text-xs text-destructive">
                            Inserisci un dominio valido, esterno alla piattaforma, per esempio crm.tuaazienda.it.
                          </p>
                        ) : customDomain && normalizedCustomDomain !== customDomain ? (
                          <p className="text-xs text-muted-foreground">
                            Verrà salvato come <strong>{normalizedCustomDomain}</strong>.
                          </p>
                        ) : null}
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
                                  variant="ghost" size="icon" aria-label="Copia nome CNAME" className="h-9 w-9 md:h-6 md:w-6"
                                  onClick={() => copyText(customDomain)}
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
                                  variant="ghost" size="icon" aria-label="Copia valore CNAME" className="h-9 w-9 md:h-6 md:w-6"
                                  onClick={() => {
                                    const v = (companyBranding as { custom_domain_cname?: string }).custom_domain_cname || "";
                                    copyText(v);
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
                              disabled={!canEdit || verifyMut.isPending}
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

          {/* Save bar sticky in basso */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-3 z-10">
            {isDirty && (
              <span className="text-xs text-amber-600 mr-auto">• Modifiche non salvate</span>
            )}
            <Button variant="outline" onClick={resetForm} disabled={!canEdit || !isDirty || saving}>
              Annulla modifiche
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || !isDirty || saving} size="lg">
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
