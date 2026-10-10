/**
 * SettingsBranding — il marchio dell'azienda: logo, colori, nome e indirizzo web della piattaforma.
 *
 * 09/10/2026: il pulsante «Contatta il Supporto per l'Upgrade» apriva /cliente/assistenza, che è l'area dei CLIENTI
 * finali (solo ruolo `customer`): l'amministratore veniva rimandato alla sua home, in una scheda nuova che non
 * mostrava niente. Ora «Chiedi l'attivazione» apre la finestra che l'app usa già per «sblocca questa funzione»
 * (UnlockFeatureDialog: richiesta al consulente, telefono, email). «Salva marchio» sta in una barra che resta in vista
 * (prima in fondo alla pagina, anche sotto «Indirizzo web» dove non serve), la scheda «Indirizzo web» ha il suo
 * indirizzo (?tab=indirizzo), le parole inglesi (Subdomain, tier, brand, footer) sono in italiano.
 * Non cambia chi vede la voce nel menu né il nome della pagina (decisione di Florin).
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
import { Link, useSearchParams } from "react-router-dom";
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
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
  CheckCircle2, RefreshCw, Image as ImageIcon, Wand2, Monitor, LogIn, Save,
} from "lucide-react";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { UnlockFeatureDialog } from "@/components/feature-preview/UnlockFeatureDialog";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { cn } from "@/lib/utils";
import { campiMarginiModificati } from "@/lib/impostazioni/salvataggioMargini";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";

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
/** Titolo di un riquadro: di secondo livello (il primo lo mette il layout), con lo stile di prima. */
function TitoloRiquadro({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("font-semibold leading-none tracking-tight", className)}>{children}</h2>;
}

function FileUploadButton({
  label, onUpload, isUploading, accept, disabled, nome,
}: {
  label: string;
  onUpload: (file: File) => void;
  isUploading: boolean;
  accept?: string;
  disabled?: boolean;
  /** Per cosa è il pulsante («il logo chiaro»): chi usa il lettore di schermo sente «Carica il logo chiaro», non solo «Carica». */
  nome: string;
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
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={isUploading || disabled} aria-label={`${label} ${nome}`}>
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
        {label}
      </Button>
    </div>
  );
}

function HexColorInput({
  id, label, value, onChange, disabled, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const valid = isValidHexColor(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={id}>{label}</Label>
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
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="#1E40AF"
          maxLength={7}
          disabled={disabled}
          aria-invalid={!valid}
          className={`max-w-28 font-mono text-xs uppercase ${!valid ? "border-destructive" : ""}`}
        />
      </div>
      {!valid && <p className="text-[10px] text-destructive">Scrivi il colore così: #1E40AF</p>}
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
const NIENTE_PERMESSI = "Non hai i permessi per modificare il marchio: serve un amministratore.";

/** Cosa si ottiene col White-Label: lo legge la finestra che parte da «Chiedi l'attivazione». */
const COSA_SI_OTTIENE = [
  "I colori del tuo marchio in tutta la piattaforma",
  "Il nome della tua azienda al posto di «EdiliziaInCloud»",
  "Un indirizzo web tuo, per esempio crm.tuaazienda.it",
  "Lo sfondo della pagina di accesso e l'icona del browser",
];

/** Il rifiuto del salvataggio dei dati dell'azienda: nessuna riga toccata (PGRST116) vuol dire che le regole di accesso hanno detto no. */
function motivoSalvataggio(err: unknown): string {
  if ((err as { code?: unknown } | null)?.code === "PGRST116") {
    return "Il tuo utente non può modificare il marchio dell'azienda.";
  }
  return motivoDelRifiuto(err, "Riprova tra poco.");
}

/** Un sottodominio è unico in tutta la piattaforma: se è già di un'altra azienda il database dice «duplicato». */
function motivoSottodominio(err: unknown): string {
  if ((err as { code?: unknown } | null)?.code === "23505") {
    return "Questo sottodominio è già di un'altra azienda: provane un altro.";
  }
  return motivoDelRifiuto(err, "Riprova tra poco.");
}

/**
 * Il motivo vero di un rifiuto del server. Le funzioni del dominio scrivono la frase in italiano nel corpo della
 * risposta («Questo dominio è già associato a un'altra azienda»), mentre `error.message` dice solo
 * «Edge Function returned a non-2xx status code»: prima si leggeva quello.
 */
async function motivoDelServer(err: unknown, fallback: string): Promise<string> {
  try {
    const corpo = await (err as { context?: { json?: () => Promise<{ error?: unknown }> } } | null)?.context?.json?.();
    if (typeof corpo?.error === "string" && corpo.error.trim()) return corpo.error;
  } catch {
    /* il corpo non si legge: si traduce l'errore com'è */
  }
  return motivoDelRifiuto(err, fallback);
}

export default function SettingsBranding() {
  const { effectiveCompany, user, refreshAuth } = useAuth();
  const permissions = usePermissions();
  const { brand, saveBrand, uploadBrandFile, isLoading, isError, refetch } = useBrandSettings();
  const { branding: companyBranding } = useBranding();
  const wlGate = useWhitelabelGate();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  // La scheda sta nell'indirizzo (?tab=indirizzo): si può mandare il link, e il tasto «indietro» la rispetta.
  const [searchParams, setSearchParams] = useSearchParams();
  const scheda = searchParams.get("tab") === "indirizzo" ? "indirizzo" : "aspetto";
  const cambiaScheda = (valore: string) => {
    setSearchParams(valore === "indirizzo" ? { tab: "indirizzo" } : {}, { replace: true });
  };
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
  const [apriAttivazione, setApriAttivazione] = useState(false);

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
      toast.error("Dominio non rimosso", { description: await motivoDelServer(err, "Riprova tra poco.") });
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
      toast.error(NIENTE_PERMESSI);
      return;
    }
    // I nomi sono quelli che si leggono sulla pagina (il colore «secondario» non ha un campo: lo ricava il colore del marchio).
    const hexFields: Array<[string, string]> = [
      ["Colore del marchio", form.brand_primary_color],
      ["Colore del marchio", form.brand_secondary_color],
      ["Sfondo delle voci attive", form.brand_accent_color],
      ["Testo sui bottoni", form.brand_text_on_primary],
    ];
    const invalid = hexFields.find(([, v]) => !isValidHexColor(v));
    if (invalid) {
      toast.error(`${invalid[0]}: scrivi il colore così, #1E40AF`);
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
      if (syncFailed) toast.warning("Marchio salvato, ma la pagina di accesso non è stata aggiornata. Riprova.");
      else toast.success("Marchio aggiornato");
    } catch (err) {
      toast.error("Marchio non salvato", { description: motivoSalvataggio(err) });
    } finally {
      setSaving(false);
    }
  };

  /** Riporta l'aspetto della piattaforma alle impostazioni di sistema:
      colori, nome e powered-by ai default + tema custom disattivato.
      Logo, favicon, subdomain e dominio NON vengono toccati. */
  const handleResetToSystem = async () => {
    if (!canEdit) {
      toast.error(NIENTE_PERMESSI);
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
      toast.success("Aspetto standard ripristinato");
    } catch (err) {
      toast.error("Aspetto non ripristinato", { description: motivoSalvataggio(err) });
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

  /** Prende la tinta dominante del logo e ne ricava la palette (poi si salva col bottone «Salva marchio»). */
  const usaColoriDelLogo = async () => {
    const url = effectiveCompany?.logo_url;
    if (!url) return;
    setLeggendoLogo(true);
    try {
      const colore = await coloreDelLogo(url);
      if (!colore) {
        toast.error("Dal logo non riesco a ricavare un colore (è tutto bianco, nero o grigio, oppure non si legge). Scegli il colore a mano.");
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
      toast.error(NIENTE_PERMESSI);
      return;
    }
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("File troppo grande: al massimo 2 MB.");
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
      toast.success("Immagine caricata");
    } catch (err) {
      toast.error("Immagine non caricata", { description: motivoSalvataggio(err) });
    } finally {
      setUploading(null);
    }
  };

  const handleSaveSubdomain = async () => {
    if (!canEdit) {
      toast.error(NIENTE_PERMESSI);
      return;
    }
    // Se l'utente sta SVUOTANDO un subdomain esistente → chiede conferma
    if (!subdomain && companyBranding?.subdomain) {
      setConfirmRemoveSub(true);
      return;
    }
    try {
      await saveSubdomainMut.mutateAsync(subdomain);
      toast.success(subdomain ? "Sottodominio salvato" : "Sottodominio rimosso");
    } catch (err) {
      toast.error("Sottodominio non salvato", { description: motivoSottodominio(err) });
    }
  };

  const confirmRemoveSubdomain = async () => {
    if (!canEdit) {
      toast.error(NIENTE_PERMESSI);
      return;
    }
    setConfirmRemoveSub(false);
    try {
      await saveSubdomainMut.mutateAsync("");
      toast.success("Sottodominio rimosso");
    } catch (err) {
      toast.error("Sottodominio non rimosso", { description: motivoSottodominio(err) });
    }
  };

  const normalizedCustomDomain = normalizeCustomDomainInput(customDomain);
  const customDomainInvalid = customDomain.length > 0 && !isValidCustomDomain(customDomain);

  const handleConfigureDomain = async () => {
    try {
      await requestVerifMut.mutateAsync(normalizedCustomDomain);
      setCustomDomain(normalizedCustomDomain);
      toast.success("Configurazione avviata: aggiungi il record CNAME qui sotto al tuo DNS.");
    } catch (err) {
      toast.error("Dominio non configurato", { description: await motivoDelServer(err, "Riprova tra poco.") });
    }
  };

  const handleVerifyDomain = async () => {
    try {
      const result = await verifyMut.mutateAsync();
      if (result.verified) {
        toast.success("Dominio verificato");
      } else {
        toast.error(result.error || "Il record CNAME non risulta ancora attivo: può servire fino a 48 ore. Riprova più tardi.");
      }
    } catch (err) {
      toast.error("Verifica non riuscita", { description: await motivoDelServer(err, "Riprova tra poco.") });
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
  // La barra «Salva marchio» da telefono compare solo quando c'è qualcosa da salvare: occupa uno schermo piccolo.
  const barraInUso = isDirty || syncNeeded || saving;

  return (
    <div className="space-y-6 max-w-7xl">
      <p className="text-muted-foreground">
        Logo, colori, nome e indirizzo web della piattaforma con il tuo marchio.
      </p>
      {!permissions.isAdmin && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Stai guardando il marchio dell'azienda: lo cambia solo un amministratore.
          </AlertDescription>
        </Alert>
      )}

      {/* Logo — gestito dal componente condiviso (stesso usato in Profilo aziendale).
          Il logo è UNIVOCO: companies.logo_url → mostrato in sidebar, navbar,
          email, PDF preventivi, portale clienti, branding white-label, login page. */}
      <Card>
        <CardHeader>
          <TitoloRiquadro className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Logo aziendale
          </TitoloRiquadro>
          <CardDescription>
            È lo stesso logo della barra laterale, delle email, dei preventivi in PDF, del portale clienti e della
            pagina di accesso: dove ne imposti uno diverso (un modello PDF, le preferenze email) vale quello. Lo cambi
            qui o in{" "}
            <Link to="/azienda/impostazioni/profilo#logo" className="underline">Profilo aziendale</Link>.
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

      {/* Funzione a pagamento: «Chiedi l'attivazione» apre la richiesta al consulente (prima apriva /cliente/assistenza,
          l'area dei clienti finali, e l'amministratore finiva sulla sua home). */}
      {!isWhiteLabel && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center space-y-4">
            <Lock className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">Personalizzazione completa: White-Label</h2>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Colori, nome della piattaforma, icona del browser, sfondo della pagina di accesso e un indirizzo web
                tuo, per esempio crm.tuaazienda.it. È una funzione a pagamento.
              </p>
            </div>
            {permissions.isAdmin ? (
              <Button variant="outline" onClick={() => setApriAttivazione(true)}>
                <HeadphonesIcon className="h-4 w-4 mr-2" aria-hidden="true" />
                Chiedi l'attivazione
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Per attivarla parlane con l'amministratore dell'azienda.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full branding config — only if white-label enabled */}
      {isWhiteLabel && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Palette className="h-5 w-5" aria-hidden="true" /> Marchio personalizzato
            </h2>
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Attivo</Badge>
          </div>

          <Tabs value={scheda} onValueChange={cambiaScheda} className="space-y-6">
            <TabsList>
              <TabsTrigger value="aspetto">Aspetto</TabsTrigger>
              <TabsTrigger value="indirizzo">Indirizzo web</TabsTrigger>
            </TabsList>

            <TabsContent value="aspetto" className="mt-0 space-y-4">
              {/* «Salva marchio» resta in vista mentre si scorre (prima era in fondo alla pagina, anche sotto «Indirizzo web»
                  dove non serve). In alto e non in basso: da telefono la barra di navigazione galleggia sul fondo. */}
              <div
                className={cn(
                  "sticky top-2 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur",
                  !barraInUso && "max-sm:hidden",
                )}
              >
                <p role="status" className="mr-auto min-w-0 text-xs">
                  {isDirty ? (
                    <span className="text-amber-700">Modifiche non salvate</span>
                  ) : syncNeeded ? (
                    <span className="text-amber-700">Marchio salvato. La pagina di accesso non è ancora aggiornata: riprova.</span>
                  ) : (
                    <span className="text-muted-foreground">Colori, nome e «Powered by» si salvano qui; le immagini, appena le carichi.</span>
                  )}
                </p>
                <Button size="sm" variant="outline" onClick={resetForm} disabled={!canEdit || !isDirty || saving}>
                  Annulla modifiche
                </Button>
                <Button onClick={handleSave} disabled={!canEdit || (!isDirty && !syncNeeded) || saving} size="sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" aria-hidden="true" />}
                  {syncNeeded && !isDirty ? "Riprova sincronizzazione" : "Salva marchio"}
                </Button>
              </div>

              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                {/* 1 · COLORI — si sceglie UN colore (o si prende dal logo) e il resto si ricava da solo. */}
                <Card>
                  <CardHeader>
                    <TitoloRiquadro className="text-base flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Colori
                    </TitoloRiquadro>
                    <CardDescription>
                      Scegli il colore del tuo marchio: bottoni, link e voci attive della piattaforma
                      si adattano da soli, restando sempre leggibili.
                    </CardDescription>
                    {!canChangeColors && (
                      <CardDescription className="text-amber-600">
                        Il tuo piano ({wlGate.name}) non include i colori personalizzati.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex flex-wrap items-end gap-4">
                      <HexColorInput
                        id="bnd-colore-marchio"
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
                        {leggendoLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />}
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

                    <div role="group" aria-labelledby="bnd-colori-pronti" className="space-y-1.5">
                      <p id="bnd-colori-pronti" className="text-xs font-medium leading-none">Oppure parti da uno di questi</p>
                      <div className="flex flex-wrap gap-2">
                        {COLORI_SUGGERITI.map((hex) => {
                          const scelto = form.brand_primary_color.toUpperCase() === hex;
                          return (
                            <button
                              key={hex}
                              type="button"
                              aria-label={`Usa il colore ${hex}`}
                              aria-pressed={scelto}
                              title={hex}
                              disabled={!canEdit || !canChangeColors}
                              onClick={() => setForm((f) => ({ ...f, ...coloriDaPalette(paletteDaColore(hex)) }))}
                              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                                scelto ? "border-foreground ring-2 ring-offset-2 ring-offset-background" : "border-white shadow"
                              }`}
                              style={{ backgroundColor: hex }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <details className="rounded-lg border px-4 py-3 text-sm">
                      <summary className="cursor-pointer select-none font-medium">Regola i dettagli</summary>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <HexColorInput
                          id="bnd-sfondo-voci"
                          label="Sfondo delle voci attive"
                          value={form.brand_accent_color}
                          onChange={(v) => setForm((f) => ({ ...f, brand_accent_color: v }))}
                          disabled={!canEdit || !canChangeColors}
                          hint="Barra laterale e hover: un tono molto chiaro"
                        />
                        <HexColorInput
                          id="bnd-testo-bottoni"
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
                    <TitoloRiquadro className="text-base">Nome e immagini</TitoloRiquadro>
                    <CardDescription>
                      Come si presenta la piattaforma ai tuoi utenti e ai tuoi clienti. Le immagini si salvano appena le
                      carichi; il nome e «Powered by» con «Salva marchio».
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
                        <h3 className="text-sm font-medium leading-none">Logo chiaro</h3>
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
                          nome="il logo chiaro"
                          isUploading={uploading === "brand_logo_dark_url"}
                          onUpload={(f) => handleFileUpload(f, "brand_logo_dark_url", "logo-dark")}
                          accept="image/png,image/svg+xml,image/webp"
                          disabled={!canEdit}
                        />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-medium leading-none">Icona del browser</h3>
                        <p className="text-xs text-muted-foreground">Quadrata, 64×64 px (PNG, ICO o SVG).</p>
                        <div className="h-16 w-16 rounded border bg-muted/30 flex items-center justify-center p-1.5">
                          {brand?.brand_favicon_url ? (
                            <img loading="lazy" src={brand.brand_favicon_url} alt="Icona del browser" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Vuota</span>
                          )}
                        </div>
                        <FileUploadButton
                          label={brand?.brand_favicon_url ? "Cambia" : "Carica"}
                          nome="l'icona del browser"
                          isUploading={uploading === "brand_favicon_url"}
                          onUpload={(f) => handleFileUpload(f, "brand_favicon_url", "favicon")}
                          accept="image/png,image/x-icon,image/svg+xml"
                          disabled={!canEdit}
                        />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-medium leading-none">Sfondo della pagina di accesso</h3>
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
                          nome="lo sfondo della pagina di accesso"
                          isUploading={uploading === "brand_login_bg_url"}
                          onUpload={(f) => handleFileUpload(f, "brand_login_bg_url", "login-bg")}
                          disabled={!canEdit || !canLoginPage}
                        />
                        {!canLoginPage && <p className="text-[10px] text-amber-600">Non incluso nel tuo piano</p>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-t pt-4">
                      <div className="min-w-0">
                        <Label htmlFor="bnd-hide-pby">Nascondi «Powered by EdiliziaInCloud»</Label>
                        <p className="text-xs text-muted-foreground">Toglie la scritta «Powered by EdiliziaInCloud» dalla piattaforma e dalle email.</p>
                        {!canHidePoweredBy && <p className="text-[10px] text-amber-600 mt-1">Non incluso nel tuo piano</p>}
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
                    {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />}
                    Ripristina aspetto standard
                  </Button>
                </div>
              </div>

              {/* Anteprima sempre in vista mentre si scorre (sotto la barra «Salva marchio») */}
              <div className="lg:sticky lg:top-20">
                <Card>
                  <CardHeader className="pb-3">
                    <TitoloRiquadro className="text-base">Anteprima</TitoloRiquadro>
                    <CardDescription>Si aggiorna mentre scegli. Dopo «Salva marchio» la vedono tutti gli utenti.</CardDescription>
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
              {/* Sottodominio */}
              <Card>
                <CardHeader>
                  <TitoloRiquadro className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Sottodominio
                  </TitoloRiquadro>
                  <CardDescription>Accedi alla piattaforma da un indirizzo personalizzato gratuito.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bnd-subdomain">Il tuo sottodominio</Label>
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
                      Da 3 a 63 caratteri: lettere minuscole, numeri e trattini; non può cominciare né finire con un trattino.
                    </p>
                    {subdomain.length > 0 && !isValidSubdomain(subdomain) && (
                      <p className="text-xs text-destructive">Il sottodominio non è valido: guarda le regole qui sopra.</p>
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
                    {!subdomain && companyBranding?.subdomain ? "Rimuovi sottodominio" : "Salva sottodominio"}
                  </Button>
                </CardContent>
              </Card>

              {/* Custom Domain */}
              <Card>
                <CardHeader>
                  <TitoloRiquadro className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Dominio personalizzato
                  </TitoloRiquadro>
                  <CardDescription>
                    Usa un dominio tuo, per esempio crm.tuaazienda.it. Richiede una modifica al DNS del dominio e potrebbe
                    servirti l'aiuto di chi lo gestisce.
                  </CardDescription>
                  {!canCustomDomain && (
                    <CardDescription className="text-amber-600">
                      Il tuo piano ({wlGate.name}) non include i domini personalizzati.
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
                          <Button variant="ghost" size="sm" onClick={() => window.open(`https://${customDomain}`, "_blank", "noopener,noreferrer")}>
                            Apri ↗
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={!canEdit || removeDomainMut.isPending}
                            aria-label="Rimuovi il dominio"
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
                            aria-label="Configura il dominio"
                            disabled={requestVerifMut.isPending || !customDomain || customDomainInvalid || !canEdit || !canCustomDomain}
                            onClick={handleConfigureDomain}
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
                            <p className="font-medium">Aggiungi questo record CNAME al DNS del tuo dominio:</p>
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
                                onClick={handleVerifyDomain}
                              >
                                {verifyMut.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
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
        </>
      )}

      {/* Dialog conferma rimozione dominio personalizzato */}
      <AlertDialog open={confirmRemoveDomain} onOpenChange={setConfirmRemoveDomain}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il dominio personalizzato?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{customDomain || companyBranding?.custom_domain}</strong> non sarà più collegato alla
              piattaforma: chi lo usava dovrà entrare dall'indirizzo standard. Potrai configurare un nuovo dominio
              quando vuoi.
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
            <AlertDialogTitle>Tornare all'aspetto standard?</AlertDialogTitle>
            <AlertDialogDescription>
              Colori, nome della piattaforma e «Powered by» tornano a quelli di EdiliziaInCloud, per tutti gli utenti
              della tua azienda. Logo, icona del browser, sottodominio e dominio personalizzato restano come sono.
              Potrai rimettere i tuoi colori quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetToSystem}>Ripristina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog conferma rimozione sottodominio */}
      <AlertDialog open={confirmRemoveSub} onOpenChange={setConfirmRemoveSub}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il sottodominio?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{companyBranding?.subdomain}.ediliziaincloud.com</strong> non sarà più raggiungibile: chi aveva
              salvato quel link vedrà una pagina non trovata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveSubdomain}>Rimuovi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* La richiesta d'attivazione: la stessa finestra di «sblocca questa funzione» (ticket al consulente, telefono, email). */}
      <UnlockFeatureDialog
        open={apriAttivazione}
        onOpenChange={setApriAttivazione}
        featureKey="white_label"
        featureLabel="White-Label"
        actionLabel="Personalizzare il marchio"
        description="Colori, nome della piattaforma, icona, pagina di accesso e indirizzo web con il tuo marchio, al posto di quelli di EdiliziaInCloud."
        benefits={COSA_SI_OTTIENE}
        chiudiLabel="Non ora"
      />
    </div>
  );
}
