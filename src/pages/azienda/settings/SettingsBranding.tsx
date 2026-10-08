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
  useRemoveCustomDomain,
} from "@/hooks/useBrandingByDomain";
import { isValidHexColor, coloriApplicati } from "@/lib/brandTheme";
import { coloreDelLogo, paletteDaColore, rampaBrand, hexValido } from "@/lib/brandPalette";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Upload, Palette, Lock, HeadphonesIcon, Globe, Copy,
  CheckCircle2, RefreshCw, Image as ImageIcon, Wand2, Monitor, LogIn,
} from "lucide-react";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { campiMarginiModificati } from "@/lib/impostazioni/salvataggioMargini";

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

function HexColorInput({
  label, value, onChange, disabled, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const valid = isValidHexColor(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#1E40AF"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 w-12 rounded border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 bg-transparent p-0.5"
          aria-label={`Selettore ${label}`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="#1E40AF"
          maxLength={7}
          disabled={disabled}
          aria-invalid={!valid}
          className={`max-w-28 font-mono text-xs uppercase ${!valid ? "border-destructive" : ""}`}
        />
      </div>
      {!valid && <p className="text-[10px] text-destructive">Formato HEX richiesto, es. #1E40AF</p>}
      {hint && valid && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Colori proposti: un clic e la palette si ricava da sola. */
const COLORI_SUGGERITI = ["#1E40AF", "#0F766E", "#15803D", "#B45309", "#B91C1C", "#7E22CE", "#BE185D", "#334155"];

/**
 * Anteprima di come verrà la piattaforma, a due viste: «Piattaforma» (barra
 * laterale, bottone, link, riquadro scuro di riepilogo) e «Accesso» (pagina di
 * login). Usa gli stessi colori che il tema applica davvero (coloriApplicati e
 * rampaBrand), quindi quello che vedi qui è quello che vedranno i tuoi utenti.
 * Non tocca il tema globale finché non salvi.
 */
function AnteprimaPiattaforma({
  primary, accent, textOnPrimary, logoUrl, nome, sfondoLogin,
}: {
  primary: string; accent: string; textOnPrimary: string;
  logoUrl?: string | null; nome: string; sfondoLogin?: string | null;
}) {
  const [vista, setVista] = useState<"piattaforma" | "accesso">("piattaforma");
  const c = coloriApplicati({ primaryColor: primary, accentColor: accent, textOnPrimary });
  const p = c.primary ?? "#1E40AF";
  const att = c.sidebarAccent ?? "#DBEAFE";
  const attTesto = c.accentText ?? p;
  const scurito = isValidHexColor(primary) && c.primary && c.primary.toLowerCase() !== primary.toLowerCase();
  const rampa = hexValido(p) ? rampaBrand(p) : null;
  const scuro = rampa ? `rgb(${rampa.navy.split(" ").join(",")})` : "#1E3A5F";
  const logo = logoUrl ? (
    <img src={logoUrl} alt="" className="max-h-7 max-w-full object-contain" />
  ) : (
    <span className="truncate text-xs font-semibold" style={{ color: p }}>{nome || "La tua azienda"}</span>
  );
  const voci = ["Commesse", "Clienti", "Calendario"];
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="Vista anteprima">
        {([["piattaforma", "Piattaforma", Monitor], ["accesso", "Accesso", LogIn]] as const).map(([k, t, Icona]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={vista === k}
            onClick={() => setVista(k)}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors ${
              vista === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icona className="h-3.5 w-3.5" /> {t}
          </button>
        ))}
      </div>

      {vista === "piattaforma" ? (
        <div className="flex overflow-hidden rounded-lg border bg-white text-slate-700">
          <div className="w-32 shrink-0 space-y-1 border-r bg-white p-2.5">
            <div className="mb-2 flex h-7 items-center">{logo}</div>
            {voci.map((v, i) => (
              <div
                key={v}
                className="rounded-md px-2 py-1.5 text-xs"
                style={i === 0 ? { backgroundColor: att, color: attTesto, fontWeight: 500 } : undefined}
              >
                {v}
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-3 bg-slate-50 p-3">
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium shadow-sm"
              style={{ backgroundColor: p, color: c.textOnPrimary }}
            >
              Nuova commessa
            </span>
            <div className="w-full rounded-md p-2.5 text-white" style={{ backgroundColor: scuro }}>
              <div className="text-[10px] opacity-80">Riepilogo</div>
              <div className="text-sm font-semibold">€ 48.250</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: att, color: attTesto }}>
                In corso
              </span>
              <span className="text-xs font-medium" style={{ color: p }}>Vedi tutte →</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-slate-100"
          style={sfondoLogin ? { backgroundImage: `url("${sfondoLogin.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <div className="w-44 space-y-2 rounded-lg bg-white p-3 text-slate-700 shadow-lg">
            <div className="flex h-7 items-center justify-center">{logo}</div>
            <div className="h-6 rounded border bg-slate-50" />
            <div className="h-6 rounded border bg-slate-50" />
            <div
              className="rounded-md py-1.5 text-center text-xs font-medium"
              style={{ backgroundColor: p, color: c.textOnPrimary }}
            >
              Accedi
            </div>
          </div>
        </div>
      )}

      {scurito && (
        <p className="text-[11px] text-muted-foreground">
          Il colore scelto è troppo chiaro per il testo bianco: per tenerlo leggibile nei bottoni
          viene usato un tono più scuro della stessa tinta ({c.primary}).
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function SettingsBranding() {
  const { effectiveCompany, user, refreshAuth } = useAuth();
  const permissions = usePermissions();
  const { brand, saveBrand, uploadBrandFile, isLoading, isError, refetch } = useBrandSettings();
  const { branding: companyBranding } = useBranding();
  const wlGate = useWhitelabelGate();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [syncNeeded, setSyncNeeded] = useState(false);
  const canEdit = permissions.isAdmin && !isLoading && !isError && !saving;
  const [uploading, setUploading] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [confirmRemoveSub, setConfirmRemoveSub] = useState(false);
  const [confirmResetSystem, setConfirmResetSystem] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [leggendoLogo, setLeggendoLogo] = useState(false);

  const saveSubdomainMut = useSaveSubdomain(companyId);
  const requestVerifMut = useRequestDomainVerification(companyId);
  const verifyMut = useVerifyCustomDomain(companyId);
  const removeDomainMut = useRemoveCustomDomain(companyId);
  const [confirmRemoveDomain, setConfirmRemoveDomain] = useState(false);

  const handleRemoveDomain = async () => {
    setConfirmRemoveDomain(false);
    try {
      await removeDomainMut.mutateAsync();
      setCustomDomain("");
      toast.success("Dominio rimosso");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error("Impossibile rimuovere il dominio", { description: msg });
    }
  };

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

  const [baseline, setBaseline] = useState<typeof form | null>(null);
  const hydratedCompany = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);
  const isDirty = baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);
  useSettingsDraftGuard((permissions.isAdmin && isDirty) || saving);

  useEffect(() => {
    if (hydratedCompany.current !== companyId) {
      hydratedCompany.current = companyId;
      setSyncNeeded(false);
      setBaseline(null);
      dirtyRef.current = false;
      setForm(buildFormFromBrand(brand));
    }
    if (brand && !dirtyRef.current) {
      const incoming = buildFormFromBrand(brand);
      setBaseline(incoming);
      setForm(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, companyId]);

  const resetForm = () => {
    if (brand) {
      const incoming = buildFormFromBrand(brand);
      setBaseline(incoming);
      dirtyRef.current = false;
      setForm(incoming);
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
    const hexFields: Array<[string, string]> = [
      ["Colore primario", form.brand_primary_color],
      ["Colore secondario", form.brand_secondary_color],
      ["Colore evidenziazione", form.brand_accent_color],
      ["Testo su primario", form.brand_text_on_primary],
    ];
    const invalid = hexFields.find(([, v]) => !isValidHexColor(v));
    if (invalid) {
      toast.error(`${invalid[0]}: formato HEX non valido (es. #1E40AF)`);
      return;
    }
    setSaving(true);
    try {
      // white_label_enabled è il flag runtime letto dai layout: va acceso
      // quando l'azienda ha un tier white-label attivo.
      const savedBrand = await saveBrand.mutateAsync({
        ...campiMarginiModificati(form, baseline ?? {}),
        ...(wlGate.isWhiteLabel ? { white_label_enabled: true } : {}),
      } as Partial<typeof brand>);
      const savedForm = buildFormFromBrand(savedBrand);

      // Sync su company_branding (per login page + custom domain branding)
      let syncFailed = false;
      if (companyId) {
        await supabase
          .from("company_branding" as never)
          .upsert(
            {
              company_id: companyId,
              primary_color: savedForm.brand_primary_color,
              secondary_color: savedForm.brand_secondary_color,
              accent_color: savedForm.brand_accent_color,
              platform_name: savedForm.brand_platform_name || null,
              hide_platform_branding: savedForm.brand_hide_powered_by,
              logo_url: savedBrand.logo_url || null,
              favicon_url: savedBrand.brand_favicon_url || null,
              login_bg_color: savedBrand.brand_login_bg_url
                ? buildLoginBackgroundValue(savedBrand.brand_login_bg_url)
                : companyBranding?.login_bg_color || null,
              is_active: true,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "company_id" } as never,
          )
          .then((r) => {
            if (r.error) syncFailed = true;
          }, () => {
            // Il salvataggio principale è riuscito anche se cade la connessione al mirror.
            syncFailed = true;
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
          }, () => {
            console.warn("Audit log skipped: connessione non disponibile");
          });
      }
      queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      queryClient.invalidateQueries({ queryKey: ["branding-by-domain"] });
      setBaseline(savedForm);
      dirtyRef.current = false;
      setForm(savedForm);
      setSyncNeeded(syncFailed);
      if (syncFailed) toast.warning("Aspetto salvato, ma la pagina di accesso non è stata sincronizzata. Riprova più tardi.");
      else toast.success("Brand aggiornato con successo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /** Riporta l'aspetto della piattaforma alle impostazioni di sistema:
      colori, nome e powered-by ai default + tema custom disattivato.
      Logo, favicon, subdomain e dominio NON vengono toccati. */
  const handleResetToSystem = async () => {
    if (!canEdit) {
      toast.error("Non hai i permessi per modificare il branding");
      return;
    }
    setConfirmResetSystem(false);
    setResetting(true);
    const DEFAULTS = {
      brand_primary_color: "#1E40AF",
      brand_secondary_color: "#3B82F6",
      brand_accent_color: "#DBEAFE",
      brand_text_on_primary: "#FFFFFF",
      brand_platform_name: null as string | null,
      brand_hide_powered_by: false,
    };
    try {
      await saveBrand.mutateAsync({
        ...DEFAULTS,
        white_label_enabled: false,
      } as Partial<typeof brand>);

      if (companyId) {
        await supabase
          .from("company_branding" as never)
          .upsert(
            {
              company_id: companyId,
              primary_color: DEFAULTS.brand_primary_color,
              secondary_color: DEFAULTS.brand_secondary_color,
              accent_color: DEFAULTS.brand_accent_color,
              platform_name: null,
              hide_platform_branding: false,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "company_id" } as never,
          )
          .then((r) => {
            if (r.error) console.warn("Sync company_branding skipped:", r.error.message);
          });
      }

      setForm({ ...DEFAULTS, brand_platform_name: "" });
      queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      queryClient.invalidateQueries({ queryKey: ["branding-by-domain"] });
      toast.success("Aspetto di sistema ripristinato");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  // Si salva il colore COME LO HA SCELTO (o come è nel logo): il tono scurito per
  // la leggibilità lo applica il tema in esecuzione (coloriApplicati), non i dati.
  const coloriDaPalette = (p: ReturnType<typeof paletteDaColore>) => ({
    brand_primary_color: p.secondary,
    brand_secondary_color: p.secondary,
    brand_accent_color: p.accent,
    brand_text_on_primary: p.textOnPrimary,
  });

  /** Prende la tinta dominante del logo e ne ricava la palette (poi si salva col bottone in basso). */
  const usaColoriDelLogo = async () => {
    const url = effectiveCompany?.logo_url;
    if (!url) return;
    setLeggendoLogo(true);
    try {
      const colore = await coloreDelLogo(url);
      if (!colore) {
        toast.error("Nel logo non trovo un colore del marchio (è tutto bianco, nero o grigio). Scegli il colore a mano.");
        return;
      }
      setForm((f) => ({ ...f, ...coloriDaPalette(paletteDaColore(colore)) }));
      toast.success(`Colore del logo: ${colore}. Controlla l'anteprima e salva.`);
    } finally {
      setLeggendoLogo(false);
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

  if (isError || !brand || !companyId) {
    return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">Non riesco a leggere il branding aziendale. Nessuna modifica verrà salvata.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription></Alert>;
  }

  const isWhiteLabel = wlGate.isWhiteLabel || (brand?.white_label_enabled ?? false);
  // Gating capabilities dal tier: se tier presente, applica i flag
  // Capabilities tier (la palette colori è temporaneamente disabilitata sul
  // frontend a prescindere dal tier).
  const canChangeColors = !wlGate.isWhiteLabel || wlGate.canChangeColors !== false;
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
      {!permissions.isAdmin && (
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
            clienti e pagina di login. Dove metti un logo diverso (un modello PDF, le preferenze
            email) vale quello. Modifica qui o in <a href="/azienda/impostazioni/profilo" className="underline">Profilo aziendale</a>.
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
              <Palette className="h-5 w-5" /> Brand personalizzato
            </h2>
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Attivo</Badge>
          </div>

          <Tabs defaultValue="aspetto" className="space-y-6">
            <TabsList>
              <TabsTrigger value="aspetto">Aspetto</TabsTrigger>
              <TabsTrigger value="indirizzo">Indirizzo web</TabsTrigger>
            </TabsList>

            <TabsContent value="aspetto" className="mt-0">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              {/* 1 · COLORI — si sceglie UN colore (o si prende dal logo) e il resto si ricava da solo. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" /> Colori
                  </CardTitle>
                  <CardDescription>
                    Scegli il colore del tuo marchio: bottoni, link e voci attive della piattaforma
                    si adattano da soli, restando sempre leggibili.
                  </CardDescription>
                  {!canChangeColors && (
                    <CardDescription className="text-amber-600">
                      Il tuo tier ({wlGate.name}) non include la personalizzazione colori.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap items-end gap-4">
                    <HexColorInput
                      label="Colore del marchio"
                      value={form.brand_primary_color}
                      onChange={(v) => setForm((f) => (
                        isValidHexColor(v)
                          ? { ...f, ...coloriDaPalette(paletteDaColore(v)) }
                          : { ...f, brand_primary_color: v }
                      ))}
                      disabled={!canEdit || !canChangeColors}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEdit || !canChangeColors || !effectiveCompany?.logo_url || leggendoLogo}
                      onClick={usaColoriDelLogo}
                    >
                      {leggendoLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                      Usa i colori del logo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canEdit || !canChangeColors}
                      onClick={() => setForm((f) => ({ ...f, ...coloriDaPalette(paletteDaColore("#1E40AF")) }))}
                    >
                      Colori di EdiliziaInCloud
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Oppure parti da uno di questi</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLORI_SUGGERITI.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`Usa il colore ${hex}`}
                          title={hex}
                          disabled={!canEdit || !canChangeColors}
                          onClick={() => setForm((f) => ({ ...f, ...coloriDaPalette(paletteDaColore(hex)) }))}
                          className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                            form.brand_primary_color.toUpperCase() === hex ? "border-foreground ring-2 ring-offset-2 ring-offset-background" : "border-white shadow"
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  <details className="rounded-lg border px-4 py-3 text-sm">
                    <summary className="cursor-pointer select-none font-medium">Regola i dettagli</summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <HexColorInput
                        label="Sfondo delle voci attive"
                        value={form.brand_accent_color}
                        onChange={(v) => setForm((f) => ({ ...f, brand_accent_color: v }))}
                        disabled={!canEdit || !canChangeColors}
                        hint="Barra laterale e hover: un tono molto chiaro"
                      />
                      <HexColorInput
                        label="Testo sui bottoni"
                        value={form.brand_text_on_primary}
                        onChange={(v) => setForm((f) => ({ ...f, brand_text_on_primary: v }))}
                        disabled={!canEdit || !canChangeColors}
                        hint="Bianco o quasi nero, secondo il colore"
                      />
                    </div>
                  </details>
                </CardContent>
              </Card>

              {/* 2 · NOME E IMMAGINI */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nome e immagini</CardTitle>
                  <CardDescription>
                    Come si presenta la piattaforma ai tuoi utenti e ai tuoi clienti.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="bnd-name">Nome della piattaforma</Label>
                    <Input
                      id="bnd-name"
                      value={form.brand_platform_name}
                      onChange={(e) => setForm((f) => ({ ...f, brand_platform_name: e.target.value }))}
                      placeholder="EdiliziaInCloud"
                      maxLength={50}
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground">
                      Sostituisce «EdiliziaInCloud» nella barra e nel titolo del browser. Vuoto = nome standard.
                    </p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Logo chiaro</Label>
                      <p className="text-xs text-muted-foreground">Versione bianca, per le copertine scure dei preventivi.</p>
                      <div className="h-16 w-full rounded border bg-slate-900 flex items-center justify-center p-2">
                        {brand?.brand_logo_dark_url ? (
                          <img loading="lazy" src={brand.brand_logo_dark_url} alt="Logo versione chiara" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[10px] text-slate-400 text-center leading-tight px-1">Si usa il logo principale</span>
                        )}
                      </div>
                      <FileUploadButton
                        label={brand?.brand_logo_dark_url ? "Cambia" : "Carica"}
                        isUploading={uploading === "brand_logo_dark_url"}
                        onUpload={(f) => handleFileUpload(f, "brand_logo_dark_url", "logo-dark")}
                        accept="image/png,image/svg+xml,image/webp"
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Icona del browser</Label>
                      <p className="text-xs text-muted-foreground">Quadrata, 64×64 px (PNG, ICO o SVG).</p>
                      <div className="h-16 w-16 rounded border bg-muted/30 flex items-center justify-center p-1.5">
                        {brand?.brand_favicon_url ? (
                          <img loading="lazy" src={brand.brand_favicon_url} alt="Favicon" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Vuota</span>
                        )}
                      </div>
                      <FileUploadButton
                        label={brand?.brand_favicon_url ? "Cambia" : "Carica"}
                        isUploading={uploading === "brand_favicon_url"}
                        onUpload={(f) => handleFileUpload(f, "brand_favicon_url", "favicon")}
                        accept="image/png,image/x-icon,image/svg+xml"
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Sfondo della pagina di accesso</Label>
                      <p className="text-xs text-muted-foreground">Facoltativo, 1920×1080 px.</p>
                      <div className="h-16 w-full rounded border bg-muted/30 overflow-hidden flex items-center justify-center">
                        {brand?.brand_login_bg_url ? (
                          <img loading="lazy" src={brand.brand_login_bg_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Nessuno sfondo</span>
                        )}
                      </div>
                      <FileUploadButton
                        label={brand?.brand_login_bg_url ? "Cambia" : "Carica"}
                        isUploading={uploading === "brand_login_bg_url"}
                        onUpload={(f) => handleFileUpload(f, "brand_login_bg_url", "login-bg")}
                        disabled={!canEdit || !canLoginPage}
                      />
                      {!canLoginPage && <p className="text-[10px] text-amber-600">Non incluso nel tuo tier</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-4">
                    <div className="min-w-0">
                      <Label htmlFor="bnd-hide-pby">Nascondi «Powered by EdiliziaInCloud»</Label>
                      <p className="text-xs text-muted-foreground">Toglie il riferimento alla piattaforma dal footer e dalle email.</p>
                      {!canHidePoweredBy && <p className="text-[10px] text-amber-600 mt-1">Non incluso nel tuo tier</p>}
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

              {/* Ripristino */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Vuoi tornare all'aspetto originale? Cambiano colori, nome e «Powered by»; logo, icona e indirizzi restano.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || resetting || saving}
                  onClick={() => setConfirmResetSystem(true)}
                >
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Ripristina aspetto standard
                </Button>
              </div>
            </div>

            {/* Anteprima sempre in vista mentre si scorre */}
            <div className="lg:sticky lg:top-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Anteprima</CardTitle>
                  <CardDescription>Si aggiorna mentre scegli. Dopo «Salva brand» la vedono tutti gli utenti.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AnteprimaPiattaforma
                    primary={form.brand_primary_color}
                    accent={form.brand_accent_color}
                    textOnPrimary={form.brand_text_on_primary}
                    logoUrl={effectiveCompany?.logo_url}
                    nome={form.brand_platform_name || effectiveCompany?.name || ""}
                    sfondoLogin={brand?.brand_login_bg_url}
                  />
                </CardContent>
              </Card>
            </div>
            </div>
            </TabsContent>

            <TabsContent value="indirizzo" className="mt-0 space-y-6">
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
                      <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                        <span><strong>{customDomain}</strong> è verificato e attivo.</span>
                        <span className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => window.open(`https://${customDomain}`, "_blank")}>
                            Apri ↗
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={!canEdit || removeDomainMut.isPending}
                            onClick={() => setConfirmRemoveDomain(true)}
                          >
                            {removeDomainMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rimuovi"}
                          </Button>
                        </span>
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
                            <div className="flex items-center gap-2 flex-wrap">
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
                              <Button
                                size="sm" variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={!canEdit || removeDomainMut.isPending}
                                onClick={() => setConfirmRemoveDomain(true)}
                              >
                                {removeDomainMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rimuovi dominio"}
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Nel flusso della pagina: non copre contenuti o navigazione mobile. */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t py-3">
            {isDirty && (
              <span role="status" className="w-full text-xs text-amber-700 sm:mr-auto sm:w-auto">Modifiche non salvate</span>
            )}
            {syncNeeded && <p role="status" className="w-full text-xs text-amber-700">Aspetto salvato. Riprova la sincronizzazione della pagina di accesso.</p>}
            <Button size="sm" variant="outline" onClick={resetForm} disabled={!canEdit || !isDirty || saving}>
              Annulla modifiche
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || (!isDirty && !syncNeeded) || saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Palette className="h-4 w-4 mr-2" />}
              {syncNeeded && !isDirty ? "Riprova sincronizzazione" : "Salva brand"}
            </Button>
          </div>
        </>
      )}

      {/* Dialog conferma rimozione dominio personalizzato */}
      <AlertDialog open={confirmRemoveDomain} onOpenChange={setConfirmRemoveDomain}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il dominio personalizzato?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{customDomain || companyBranding?.custom_domain}</strong> non sarà più
              collegato alla piattaforma. Gli utenti che lo usavano dovranno accedere
              dall'indirizzo standard. Potrai configurare un nuovo dominio in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveDomain} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog conferma ripristino aspetto di sistema */}
      <AlertDialog open={confirmResetSystem} onOpenChange={setConfirmResetSystem}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ripristinare l'aspetto di sistema?</AlertDialogTitle>
            <AlertDialogDescription>
              Colori, nome piattaforma e "Powered by" torneranno ai valori originali di
              EdiliziaInCloud per tutti gli utenti della tua azienda. Logo, favicon,
              subdomain e dominio personalizzato restano invariati. Potrai riattivare
              il tuo brand quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetToSystem}>Ripristina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
