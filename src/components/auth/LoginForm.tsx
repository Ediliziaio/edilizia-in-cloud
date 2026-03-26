import { useState, useEffect, forwardRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "./TwoFactorVerify";
import { useBrandingByDomain } from "@/hooks/useBrandingByDomain";
import { cn } from "@/lib/utils";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";

type ViewMode = "login" | "forgot" | "2fa";

const features = [
  { icon: TrendingUp, text: "Tieni sotto controllo margini e utili in tempo reale" },
  { icon: ClipboardList, text: "Gestisci ordini, cantieri e scadenzari" },
  { icon: Users, text: "Team, dipendenti e venditori sempre aggiornati" },
];

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

  // Capture referral code from URL
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      sessionStorage.setItem("referral_code", refCode);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://rsbrguhkodgnqfomrevo.supabase.co";
      fetch(`${supabaseUrl}/functions/v1/track-referral-click`, {
        method: "POST",
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
    try {
      const { error } = await signIn(email, password);
      if (error) {
        setFormError("Email o password non validi. Riprova.");
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Email o password non validi. Riprova.",
        });
        setIsLoading(false);
        return;
      }

      try {
        const { data: totpStatus } = await supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        if (totpStatus?.enabled) {
          setView("2fa");
          setIsLoading(false);
          return;
        }
      } catch {
        // If TOTP check fails, proceed normally
      }

      toast({ title: "Accesso effettuato", description: "Benvenuto!" });
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setFormError("Impossibile inviare l'email di reset. Riprova.");
        toast({
          variant: "destructive",
          title: "Errore",
          description: "Impossibile inviare l'email di reset. Riprova.",
        });
      } else {
        setResetSent(true);
      }
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
    window.location.reload();
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
    ? "bg-gradient-to-br from-primary via-primary/90 to-primary/70"
    : "";

  return (
    <div ref={ref} className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* ─── Left branding panel (desktop only) ─── */}
      <div
        className={cn(
          "hidden lg:flex lg:w-[45%] items-center justify-center p-12 shrink-0",
          gradientClass
        )}
        style={gradientStyle}
      >
        <div className="max-w-sm w-full text-center space-y-10 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          {/* Logo */}
          {loginLogoUrl ? (
            <img
              src={loginLogoUrl}
              alt={platformName}
              className="h-14 mx-auto object-contain"
            />
          ) : (
            <img
              src={ediliziaLogo}
              alt="EdiliziaInCloud"
              className="h-14 mx-auto brightness-0 invert"
            />
          )}

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white leading-tight">
              {isWhiteLabel ? platformName : "Il tuo gestionale per l'edilizia"}
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              {isWhiteLabel
                ? loginSubtitle
                : "Controlla margini, cantieri e clienti — tutto in un unico posto."}
            </p>
          </div>

          {/* Feature bullets */}
          {!isWhiteLabel && (
            <div className="space-y-4 text-left">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-white/90">
                  <div className="rounded-full bg-white/20 p-2 shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right form panel (desktop) / Full-screen gradient (mobile) ─── */}
      <div
        className={cn(
          "flex-1 flex items-center justify-center px-4 py-10 lg:py-12 lg:px-12",
          // Mobile: same gradient background
          "lg:bg-background",
          gradientClass + " lg:bg-none"
        )}
        style={!loginBgColor ? undefined : gradientStyle}
      >
        {/* Card — glassmorphism on mobile, clean panel on desktop */}
        <div
          className={cn(
            "w-full max-w-sm",
            // Mobile card
            "rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-8",
            // Desktop: reset to plain background
            "lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:backdrop-blur-none lg:shadow-none lg:p-0",
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
          )}
        >
          {/* Mobile logo (inside card) */}
          <div className="lg:hidden mb-8 text-center">
            {loginLogoUrl ? (
              <img src={loginLogoUrl} alt={platformName} className="h-11 mx-auto object-contain" />
            ) : (
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-11 mx-auto" />
            )}
          </div>

          {/* ── 2FA view ── */}
          {view === "2fa" && (
            <div className="animate-in fade-in-0 duration-300">
              <TwoFactorVerify onVerified={handle2FAVerified} onCancel={handle2FACancel} />
            </div>
          )}

          {/* ── Login view ── */}
          {view === "login" && (
            <div className="animate-in fade-in-0 duration-300 space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-foreground">Accedi al gestionale</h2>
                <p className="text-muted-foreground text-sm">Inserisci le tue credenziali per accedere</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
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
                      autoFocus
                      className="pl-10 h-12 sm:h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-primary hover:underline font-medium"
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
                      className="pl-10 pr-12 h-12 sm:h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 -mr-0 text-muted-foreground hover:text-foreground transition-colors"
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
                  className="w-full h-12 sm:h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-semibold transition-all"
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

              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                L'accesso è riservato agli utenti registrati.<br />
                <a href="https://www.ediliziaincloud.com" className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">
                  Scopri Edilizia in Cloud →
                </a>
              </p>
            </div>
          )}

          {/* ── Forgot password view ── */}
          {view === "forgot" && (
            <div className="animate-in fade-in-0 duration-300 space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-foreground">Reimposta la password</h2>
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
                        autoFocus
                        className="pl-10 h-12 sm:h-11"
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
                    className="w-full h-12 sm:h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-semibold transition-all"
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
