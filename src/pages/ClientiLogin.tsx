import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
  Building2,
  FileText,
  Calendar,
  HardHat,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { SSOButtons } from "@/components/auth/SSOButtons";
import { useSEO } from "@/hooks/useSEO";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

type ViewMode = "login" | "forgot" | "2fa";

export default function ClientiLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  useSEO({ title: "Portale Clienti", noindex: true });
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Already authenticated as customer — redirect to portal
  if (!isLoading && user && role === "customer") {
    return <Navigate to="/cliente" replace />;
  }

  // Already authenticated but wrong role — block access
  if (!isLoading && user && role && role !== "customer") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-500 to-teal-400 p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 text-center space-y-6 max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8">
          <Building2 className="h-14 w-14 text-red-500 mx-auto" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Accesso non autorizzato</h1>
            <p className="text-muted-foreground text-sm">
              Questo portale è riservato ai clienti. Se hai un account aziendale, accedi da{" "}
              <span className="font-medium">app.ediliziaincloud.com</span>
            </p>
          </div>
          <Button
            className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white"
            onClick={async () => {
              await signOut();
            }}
          >
            Torna al login
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-500 to-teal-400">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-white/80 text-sm">Caricamento...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setFormError("Email o password non validi. Riprova.");
        setIsSubmitting(false);
        return;
      }

      // Check 2FA status. Timeout race 6s: su cold-start free-tier
      // manage-totp può prendere 10-30s, bloccava il login.
      try {
        const totpInvoke = supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        (totpInvoke as Promise<unknown>).catch(() => {});
        const result = await Promise.race([
          totpInvoke,
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 6_000),
          ),
        ]);
        const totpStatus = (result as { data: { enabled?: boolean } | null }).data;
        if (totpStatus?.enabled) {
          setView("2fa");
          setIsSubmitting(false);
          return;
        }
      } catch {
        // If TOTP check fails, proceed normally
      }

      // Verify that the logged-in user is actually a customer
      const {
        data: { user: loggedUser },
      } = await supabase.auth.getUser();
      if (loggedUser) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", loggedUser.id);

        const isCustomer = roles?.some((r) => r.role === "customer");
        if (!isCustomer) {
          await supabase.auth.signOut();
          setFormError("Accesso riservato ai clienti. Contatta l'azienda per assistenza.");
          setIsSubmitting(false);
          return;
        }

        // Cliente bloccato = portale clienti non attivo per la sua azienda (lo
        // impone il database: 20280924110000). Prima questa pagina non lo
        // guardava: con «Password dimenticata» un cliente bloccato entrava in un
        // portale vuoto. Ora esce subito, con il motivo.
        const { data: profiloCliente } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("id", loggedUser.id)
          .maybeSingle();
        if ((profiloCliente as { is_blocked?: boolean | null } | null)?.is_blocked) {
          await supabase.auth.signOut();
          setFormError("Il portale clienti non è attivo. Per informazioni contatta l'azienda.");
          setIsSubmitting(false);
          return;
        }
      }

      toast({ title: "Accesso effettuato", description: "Benvenuto nel portale clienti!" });
    } catch {
      setFormError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setFormError("Impossibile inviare l'email di reset. Riprova.");
      } else {
        setResetSent(true);
      }
    } catch {
      setFormError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setIsSubmitting(false);
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
    toast({ title: "Accesso effettuato", description: "Benvenuto nel portale clienti!" });
    // navigate invece di reload: la sessione è già attiva post-2FA,
    // AuthContext ha già emesso SIGNED_IN. Reload causerebbe re-bootstrap
    // completo (5-15s percepiti). navigate("/cliente") <100ms.
    navigate("/cliente", { replace: true });
  };

  const handle2FACancel = async () => {
    await supabase.auth.signOut();
    setView("login");
    toast({ title: "Accesso annullato", description: "Verifica 2FA richiesta." });
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left branding panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center p-12 bg-gradient-to-br from-blue-600 via-blue-500 to-teal-500">
        <div className="max-w-sm w-full space-y-10">
          {/* Logo */}
          <div className="flex justify-start">
            <img loading="lazy"
              src={ediliziaLogo}
              alt="Edilizia in Cloud"
              className="h-12 object-contain brightness-0 invert"
            />
          </div>

          {/* Title block + features + trust note wrapped in flex col so mt-auto works */}
          <div className="flex flex-col min-h-[400px] space-y-10">
            <div className="space-y-3">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                PORTALE CLIENTI
              </p>
              <h1 className="text-3xl font-bold text-white leading-tight">
                Il tuo cantiere, sempre con te
              </h1>
              <p className="text-white/80 text-base leading-relaxed">
                Accedi per seguire l&apos;avanzamento dei tuoi lavori in tempo reale
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <HardHat className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Avanzamento cantieri e lavori</p>
                  <p className="text-white/60 text-xs mt-0.5">Segui ogni fase del tuo progetto</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Ordini e documenti</p>
                  <p className="text-white/60 text-xs mt-0.5">Preventivi, contratti e fatture</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Appuntamenti e scadenze</p>
                  <p className="text-white/60 text-xs mt-0.5">Non perdere nessuna data importante</p>
                </div>
              </div>
            </div>

            {/* Trust note */}
            <div className="mt-auto pt-8 border-t border-white/20">
              <p className="text-white/50 text-xs leading-relaxed">
                Le tue credenziali ti sono state fornite dall&apos;impresa che gestisce i tuoi lavori.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen lg:min-h-0 bg-gradient-to-br from-blue-600 via-blue-500 to-teal-400 lg:bg-none lg:bg-background p-6">
        {/* 2FA view */}
        {view === "2fa" && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-4">
                  <Lock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground">Verifica 2FA</h2>
              <p className="text-sm text-muted-foreground">Portale Clienti</p>
            </div>
            <TwoFactorVerify onVerified={handle2FAVerified} onCancel={handle2FACancel} />
          </div>
        )}

        {/* Login view */}
        {view === "login" && (
          <>
            {/* Mobile logo */}
            <div className="lg:hidden mb-8 text-center space-y-2">
              <img loading="lazy"
                src={ediliziaLogo}
                alt="Edilizia in Cloud"
                className="h-10 mx-auto object-contain brightness-0 invert"
              />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-widest">
                Portale Clienti
              </p>
            </div>

            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl lg:shadow-none lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:backdrop-blur-none p-8 lg:p-0 space-y-6">
              {/* Desktop header */}
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-foreground lg:text-foreground text-zinc-900 dark:text-white">
                  Accedi al tuo portale
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 lg:text-muted-foreground">
                  Usa le credenziali ricevute dalla tua impresa edile
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="clienti-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="clienti-email"
                      type="email"
                      placeholder="tuanome@email.it"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFormError(null);
                      }}
                      required
                      autoFocus
                      disabled={isSubmitting}
                      autoComplete="email"
                      className="pl-10 h-12"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="clienti-password">Password</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium transition-colors"
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="clienti-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFormError(null);
                      }}
                      required
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      className="pl-10 pr-10 h-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-medium shadow-md"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    "Accedi al portale"
                  )}
                </Button>
              </form>

              {/* SSO Google + Microsoft — il role check filtra chi non è cliente */}
              <SSOButtons disabled={isSubmitting} onError={(msg) => setFormError(msg)} />

              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">
                  Non hai le credenziali?
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  Contatta direttamente la tua impresa edile di riferimento.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Forgot password view */}
        {view === "forgot" && (
          <>
            {/* Mobile logo */}
            <div className="lg:hidden mb-8 text-center space-y-2">
              <img loading="lazy"
                src={ediliziaLogo}
                alt="Edilizia in Cloud"
                className="h-10 mx-auto object-contain brightness-0 invert"
              />
            </div>

            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl lg:shadow-none lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:backdrop-blur-none p-8 lg:p-0 space-y-6">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white lg:text-foreground">
                  Password dimenticata?
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 lg:text-muted-foreground">
                  Inserisci la tua email e ti invieremo le istruzioni
                </p>
              </div>

              {resetSent ? (
                <div className="text-center space-y-4 py-4">
                  <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
                  <p className="text-foreground font-semibold">Controlla la tua email</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Abbiamo inviato le istruzioni per reimpostare la password. Se non la vedi,
                    controlla anche la cartella spam.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="clienti-reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="clienti-reset-email"
                        type="email"
                        placeholder="tuanome@email.it"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setFormError(null);
                        }}
                        required
                        autoFocus
                        disabled={isSubmitting}
                        autoComplete="email"
                        className="pl-10 h-12"
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {formError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-medium shadow-md"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      "Invia istruzioni"
                    )}
                  </Button>
                </form>
              )}

              <Button
                variant="ghost"
                className="w-full text-zinc-700 dark:text-zinc-300 lg:text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={switchToLogin}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna al login
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
