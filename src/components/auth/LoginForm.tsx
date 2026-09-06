import { useState, useEffect, forwardRef } from "react";
import { prioritaCaricamento } from "@/lib/immagini/prioritaCaricamento";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  TrendingUp,
  Users,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "./TwoFactorVerify";
import { SSOButtons } from "./SSOButtons";
import { EmailOTPLogin } from "./EmailOTPLogin";
import { markSessionStarted } from "@/hooks/useSessionTimeout";
import { useBrandingByDomain } from "@/hooks/useBrandingByDomain";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { cn } from "@/lib/utils";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

type ViewMode = "login" | "forgot" | "2fa" | "email-otp";

const features = [
  { icon: TrendingUp, text: "Tieni sotto controllo margini e utili in tempo reale" },
  { icon: ClipboardList, text: "Gestisci ordini, cantieri e scadenzari" },
  { icon: Users, text: "Team, dipendenti e venditori sempre aggiornati" },
];

function isLocalDevOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export const LoginForm = forwardRef<HTMLDivElement>(function LoginForm(_props, ref) {
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Domain-based branding for white-label login
  const { data: domainBranding } = useBrandingByDomain();

  const platformName = domainBranding?.platform_name || domainBranding?.login_title || "Edilizia in Cloud";
  const loginSubtitle = domainBranding?.login_subtitle || "La piattaforma per l'edilizia moderna";
  const loginBgColor = domainBranding?.login_bg_color || undefined;
  const loginLogoUrl = domainBranding?.login_logo_url || domainBranding?.logo_url || null;
  const isWhiteLabel = !!domainBranding;

  // Apply favicon from branding
  useEffect(() => {
    if (domainBranding?.favicon_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) link.href = domainBranding.favicon_url;
    }
    if (domainBranding?.platform_name) {
      document.title = domainBranding.platform_name;
    }
  }, [domainBranding]);

  // Warmup dell'endpoint /auth/v1/token mentre l'utente digita le credenziali.
  // Su Supabase free tier l'endpoint auth può andare in cold-start (10-20s).
  // Senza warmup: utente preme login → 20s di attesa → timeout → errore "non
  // validi" (sbagliato) → ripreme → questa volta caldo → OK.
  // Con warmup: ping silenzioso a /auth/v1/health al mount → quando l'utente
  // preme login dopo ~3-5s di typing, l'endpoint è già caldo → login istantaneo.
  // Fire-and-forget, errori silenziati, no UI feedback.
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabasePublishableKey) return;
    const controller = new AbortController();
    fetch(`${supabaseUrl}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: supabasePublishableKey },
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => { /* silent — è solo un warmup */ });
    return () => controller.abort();
  }, []);

  // Benvenuto → "imposta la password". L'email di benvenuto NON porta un token
  // (scadeva prima che l'utente cliccasse): porta qui, e il link di reset viene
  // generato adesso, quando serve davvero.
  useEffect(() => {
    if (searchParams.get("reset") !== "1") return;
    const mail = searchParams.get("email");
    if (mail) setEmail(mail);
    setView("forgot");
  }, [searchParams]);

  // Capture referral code from URL
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      sessionStorage.setItem("referral_code", refCode);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      fetchWithTimeout(`${supabaseUrl}/functions/v1/track-referral-click`, {
        method: "POST",
        timeoutMs: 5_000,
        context: "login.track-referral",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_code: refCode,
          landing_page: window.location.pathname,
          utm_source: searchParams.get("utm_source") || undefined,
          utm_medium: searchParams.get("utm_medium") || undefined,
          utm_campaign: searchParams.get("utm_campaign") || undefined,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.click_id) sessionStorage.setItem("referral_click_id", d.click_id);
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsLoading(true);
    // Hard-stop: anche se TUTTE le promise sotto pendono indefinitamente
    // (es. iOS Safari + ITP + SW intercept che congela un fetch), questo
    // garantisce che il pulsante esca dallo stato "Accesso in corso..." entro
    // 20 s e l'utente possa riprovare. Senza questo, in produzione mobile il
    // login restava bloccato per sempre dopo un sign-in con credenziali valide.
    const hardStopId = setTimeout(() => setIsLoading(false), 20_000);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        // Distinguish timeout (Supabase auth cold-start) from real credential
        // errors. Prima TUTTI gli errori mostravano "Email o password non
        // validi" → utente confuso anche se credenziali corrette ma server lento.
        const isTimeout =
          (error as Error & { __isTimeout?: boolean }).__isTimeout === true ||
          /timeout/i.test(error.message ?? "");
        const msg = isTimeout
          ? "Server lento (cold-start). Attendi 2 secondi e riprova: il prossimo tentativo sarà istantaneo."
          : "Email o password non validi. Riprova.";
        setFormError(msg);
        toast({
          variant: "destructive",
          title: isTimeout ? "Connessione lenta" : "Errore di accesso",
          description: msg,
        });
        return;
      }

      // Check if account is blocked by admin — best-effort, with timeout.
      // Se la query pende (storage lock contention su Safari mobile), procediamo
      // comunque al login: il check `is_blocked` è una sanity-check, non l'unico
      // gate (la sessione Supabase è già attiva e RLS protegge l'accesso ai dati).
      try {
        const blockedCheck = supabase
          .from("profiles")
          .select("is_blocked")
          .eq("email", email)
          .maybeSingle();
        // Swallow eventuali rejection dopo il timeout race: senza questo, su
        // WebKit Safari mobile l'errore CORS arriva DOPO il redirect e diventa
        // un unhandled promise rejection → PAGEERROR catturato da ErrorBoundary
        // → "Errore nel pannello di amministrazione" sul dashboard.
        (blockedCheck as unknown as Promise<unknown>).catch(() => {});
        const { data: profile } = await Promise.race([
          blockedCheck,
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 5_000),
          ),
        ]);
        if (profile?.is_blocked) {
          await supabase.auth.signOut();
          setFormError("Il tuo account è stato bloccato dall'amministratore. Contatta il supporto.");
          toast({
            variant: "destructive",
            title: "Accesso bloccato",
            description: "Il tuo account è stato bloccato. Contatta l'amministratore.",
          });
          return;
        }
      } catch {
        // If blocked check fails, proceed normally
      }

      // 2FA status — anche questa è una edge function (può andare in cold-start
      // 10-30s su free tier). Timeout: se non risponde in 6s, assumiamo nessun
      // 2FA configurato e procediamo al redirect normale. Se l'utente ha 2FA
      // attivo ma il check è andato in timeout, il route guard lo riporterà
      // alla pagina 2FA al primo accesso protetto.
      try {
        // In locale il frontend punta spesso alle edge function remote:
        // se l'ultima versione CORS non è ancora deployata, il browser stampa
        // un errore rosso anche se il login è riuscito. In produzione il check
        // resta attivo; in dev lo saltiamo per non bloccare/debuggare login.
        if (isLocalDevOrigin()) {
          toast({ title: "Accesso effettuato", description: "Benvenuto!" });
          return;
        }

        const totpInvoke = supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        // Su WebKit/Safari, il fetch a /functions/v1/* può fallire con errore
        // CORS (preflight non gestito dalla edge). Se il timeout race ha già
        // vinto e questa promise rejecta DOPO, senza un .catch diventa una
        // unhandled rejection — su Safari quella si propaga come PAGEERROR
        // visibile al window e fa scattare l'ErrorBoundary del componente
        // padre (es. AdminLayout dopo il redirect post-login). Risultato:
        // l'utente vedeva "Errore nel pannello di amministrazione" subito
        // dopo aver loggato, anche se il login era andato a buon fine.
        (totpInvoke as Promise<unknown>).catch(() => {});
        const result = await Promise.race([
          totpInvoke,
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 6_000),
          ),
        ]);
        const totpStatus = (result as { data: { enabled?: boolean; require_2fa?: boolean } | null }).data;
        if (totpStatus?.enabled) {
          setView("2fa");
          return;
        }
        // Mandatory 2FA setup if required by company admin
        if (totpStatus?.require_2fa && !totpStatus?.enabled) {
          toast({
            title: "Autenticazione a due fattori obbligatoria",
            description: "Il tuo account richiede la configurazione del 2FA per accedere.",
          });
          window.location.href = "/azienda/impostazioni/mio-profilo?tab=sicurezza";
          return;
        }
      } catch {
        // If TOTP check fails, proceed normally
      }

      // v8.6.99 — Email OTP come 2FA automatico (sostituisce il login finale).
      // L'utente è già signed-in, ma forziamo la verifica via codice email.
      // setView("email-otp") rende montato EmailOTPLogin che invia il codice
      // e blocca l'UI finché non viene verificato.
      setView("email-otp");
      return;
    } catch {
      setFormError("Si è verificato un errore. Riprova più tardi.");
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      clearTimeout(hardStopId);
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsLoading(true);
    try {
      // Item 18: use branded reset email via edge function
      const { error } = await supabase.functions.invoke("reset-password-branded", {
        body: { email, redirect_to: window.location.origin },
      });
      if (error) {
        // Fallback to standard Supabase reset if EF fails
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      }
      setResetSent(true);
    } catch {
      setFormError("Si è verificato un errore. Riprova più tardi.");
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const switchToForgot = () => {
    setView("forgot");
    setResetSent(false);
    setPassword("");
    setFormError(null);
  };

  const switchToLogin = () => {
    setView("login");
    setResetSent(false);
    setFormError(null);
  };

  const handle2FAVerified = () => {
    toast({ title: "Accesso effettuato", description: "Benvenuto!" });
    // navigate invece di window.location.reload(): il reload forzava
    // re-fetch HTML + re-parse bundle JS + re-init React + re-bootstrap
    // auth (5-15s percepiti). La sessione Supabase è già attiva post-2FA
    // → AuthContext.onAuthStateChange ha già emesso SIGNED_IN → user è
    // nello state → navigate("/") delega a SubdomainRedirect che instrada
    // al dashboard giusto per il ruolo. Tempo: <100ms.
    navigate("/", { replace: true });
  };

  const handle2FACancel = async () => {
    await supabase.auth.signOut();
    setView("login");
    toast({ title: "Accesso annullato", description: "Verifica 2FA richiesta." });
  };

  const gradientStyle = loginBgColor
    ? { background: loginBgColor }
    : undefined;

  const gradientClass = !loginBgColor
    ? ""  // niente gradient, usiamo bg-[#0a0a0a] direttamente
    : "";

  return (
    <div ref={ref} className="min-h-dvh flex flex-col lg:flex-row bg-[#0a0a0a]">
      {/* ─── Left branding panel (desktop only) ─── */}
      <div
        className={cn(
          "hidden lg:flex lg:w-[45%] items-center justify-center p-12 shrink-0 bg-[#0a0a0a] relative overflow-hidden",
          gradientClass
        )}
        style={gradientStyle}
      >
        {/* Orange ambient orb */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-[#F97415]/20 blur-[100px] pointer-events-none" />

        <div className="max-w-sm w-full text-center space-y-10 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 relative z-10">
          {/* Logo — è l'elemento LCP della pagina di accesso: niente lazy
              (rimandava il download a dopo il layout, priorità Low) e
              fetchpriority alto per farlo partire con gli altri critici. */}
          {loginLogoUrl ? (
            <img
              src={loginLogoUrl}
              alt={platformName}
              {...prioritaCaricamento("high")}
              decoding="async"
              className="h-14 mx-auto object-contain"
            />
          ) : (
            <img
              src={ediliziaLogo}
              alt="EdiliziaInCloud"
              {...prioritaCaricamento("high")}
              decoding="async"
              width={720}
              height={174}
              className="h-14 w-auto mx-auto brightness-0 invert"
            />
          )}

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white leading-tight">
              {isWhiteLabel ? platformName : "Il tuo gestionale per l'edilizia"}
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              {isWhiteLabel
                ? loginSubtitle
                : "Controlla margini, cantieri e clienti — tutto in un unico posto."}
            </p>
          </div>

          {/* Feature bullets */}
          {!isWhiteLabel && (
            <div className="space-y-4 text-left">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-white/80">
                  <div className="rounded-full bg-[#F97415]/20 p-2 shrink-0">
                    <Icon className="h-4 w-4 text-[#F97415]" />
                  </div>
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Social proof */}
          {!isWhiteLabel && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#F97415] text-[#F97415]" />
                ))}
              </div>
              <span className="text-white/60 text-xs">4.9/5 da 142 imprese edili</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Right form panel — always light ─── */}
      <div
        className={cn(
          "flex-1 flex items-start justify-center overflow-y-auto bg-background px-4 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]",
          "sm:items-center sm:py-10 lg:py-12 lg:px-12"
        )}
      >
        {/* Card — white on mobile, transparent on desktop */}
        <div
          className={cn(
            "w-full max-w-sm",
            "rounded-2xl bg-white dark:bg-zinc-900 border border-border shadow-xl p-5 sm:p-8",
            "lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:border-0 lg:shadow-none lg:p-0",
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
          )}
        >
          {/* Mobile logo (inside card) */}
          <div className="lg:hidden mb-5 sm:mb-8 text-center">
            {loginLogoUrl ? (
              <img loading="lazy" src={loginLogoUrl} alt={platformName} className="h-9 sm:h-11 mx-auto object-contain" />
            ) : (
              <img loading="lazy" src={ediliziaLogo} alt="EdiliziaInCloud" className="h-9 sm:h-11 mx-auto" />
            )}
          </div>

          {/* ── 2FA view ── */}
          {view === "2fa" && (
            <div className="animate-in fade-in-0 duration-300">
              <TwoFactorVerify onVerified={handle2FAVerified} onCancel={handle2FACancel} />
            </div>
          )}

          {/* ── Email OTP MFA view (v8.6.99 — 2-step verification post-login) ── */}
          {view === "email-otp" && (
            <EmailOTPLogin
              email={email}
              onCancel={async () => {
                await supabase.auth.signOut();
                setView("login");
              }}
              onVerified={() => {
                markSessionStarted(); // v8.6.99 — session TTL 45gg parte da ora
                toast({ title: "Accesso confermato", description: "Benvenuto!" });
                // AuthContext rileva la sessione già attiva e ridirige automaticamente.
                // Forziamo un reload per assicurarsi che la dashboard si carichi pulita.
                window.location.href = COMPANY_APP_HOME;
              }}
            />
          )}

          {/* ── Login view ── */}
          {view === "login" && (
            <div className="animate-in fade-in-0 duration-300 space-y-5 sm:space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">Accedi al gestionale</h2>
                <p className="text-muted-foreground text-sm">Imprese, collaboratori e clienti: inserisci le tue credenziali per accedere</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="nome@tuaazienda.it"
                      value={email}
                      onChange={(e) => { setFormError(null); setEmail(e.target.value); }}
                      required
                      disabled={isLoading}
                      autoComplete="email"
                      autoFocus={!isMobileAppRuntime}
                      className="pl-10 h-12 sm:h-11 focus-visible:ring-[#F97415]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-[#F97415] hover:text-[#F97415]/80 font-medium transition-colors"
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setFormError(null); setPassword(e.target.value); }}
                      required
                      disabled={isLoading}
                      autoComplete="current-password"
                      className="pl-10 pr-12 h-12 sm:h-11 focus-visible:ring-[#F97415]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Inline error */}
                {formError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 sm:h-11 bg-[#F97415] hover:bg-[#F97415]/90 text-white font-semibold transition-all"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    "Accedi al gestionale"
                  )}
                </Button>
              </form>

              {/* ── SSO providers (v8.6.92) ────────────────────────────── */}
              <SSOButtons disabled={isLoading} onError={(msg) => setFormError(msg)} />

              {/* v8.6.99 — Magic-link rimosso: l'OTP email è 2FA automatico
                  dopo signInWithPassword. Niente più login senza password. */}

              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                L'accesso è riservato agli utenti registrati.
                {/* App Store Guideline 3.1.1: nell'app mobile (iOS/Android) NON deve
                    comparire alcun link al sito/marketing — Apple lo considera un
                    accesso indiretto a meccanismi di acquisto esterni. Usiamo
                    isMobileAppRuntime, che include il flag BUILD-TIME
                    VITE_APP_MODE=mobile (mobile:build): affidabile a prescindere dal
                    runtime Capacitor — il link non viene MAI renderizzato nell'app.
                    Prima si usava isIOS (rilevamento runtime) → fragile, motivo dei
                    rifiuti ripetuti. Sul WEB il link resta visibile. */}
                {!isMobileAppRuntime && (
                  <>
                    <br />
                    <a href="https://www.ediliziaincloud.com" className="text-[#F97415] hover:text-[#F97415]/80 font-medium transition-colors" target="_blank" rel="noopener noreferrer">
                      Scopri Edilizia in Cloud →
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          {/* ── Forgot password view ── */}
          {view === "forgot" && (
            <div className="animate-in fade-in-0 duration-300 space-y-5 sm:space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">Reimposta la password</h2>
                <p className="text-muted-foreground text-sm">
                  Ti invieremo un link via email per reimpostare la password
                </p>
              </div>

              {resetSent ? (
                <div className="text-center space-y-4 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-foreground font-medium">Controlla la tua email</p>
                  <p className="text-sm text-muted-foreground">
                    Abbiamo inviato le istruzioni per reimpostare la password al tuo indirizzo email.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="nome@azienda.it"
                        value={email}
                        onChange={(e) => { setFormError(null); setEmail(e.target.value); }}
                        required
                        disabled={isLoading}
                        autoComplete="email"
                        autoFocus={!isMobileAppRuntime}
                        className="pl-10 h-12 sm:h-11 focus-visible:ring-[#F97415]"
                      />
                    </div>
                  </div>

                  {/* Inline error */}
                  {formError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {formError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 sm:h-11 bg-[#F97415] hover:bg-[#F97415]/90 text-white font-semibold transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      "Invia link di reset"
                    )}
                  </Button>
                </form>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={switchToLogin}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna al login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
