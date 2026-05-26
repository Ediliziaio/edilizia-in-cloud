import { useState } from "react";
import { Navigate } from "react-router-dom";
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
  HardHat,
  Truck,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Hammer,
  ClipboardList,
  Calendar,
} from "lucide-react";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { SSOButtons } from "@/components/auth/SSOButtons";
import { CAMPO_ROLES } from "@/types/auth";
import { useSEO } from "@/hooks/useSEO";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

type ViewMode = "login" | "forgot" | "2fa";

const GRADIENT = "from-orange-600 via-orange-500 to-amber-400";
const BTN_GRADIENT =
  "bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-medium shadow-md";

export default function LavoriLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  useSEO({ title: "Area Lavori", noindex: true });
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ✅ Già autenticato come operaio/subappaltatore — vai all'area lavori
  if (!isLoading && user && role && CAMPO_ROLES.includes(role as "employee" | "subcontractor")) {
    return <Navigate to="/campo" replace />;
  }

  // 🚫 Autenticato ma ruolo non autorizzato
  if (!isLoading && user && role && !CAMPO_ROLES.includes(role as "employee" | "subcontractor")) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${GRADIENT} p-4`}>
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 text-center space-y-6 max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8">
          <HardHat className="h-14 w-14 text-red-500 mx-auto" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Accesso non autorizzato</h1>
            <p className="text-muted-foreground text-sm">
              Questo portale è riservato a <strong>operai</strong> e{" "}
              <strong>subappaltatori</strong>.{" "}
              {role === "customer"
                ? "Se sei un cliente, accedi da clienti.ediliziaincloud.com"
                : "Se hai un account aziendale, accedi da app.ediliziaincloud.com"}
            </p>
          </div>
          <Button className={`w-full ${BTN_GRADIENT}`} onClick={async () => { await signOut(); }}>
            Torna al login
          </Button>
        </div>
      </div>
    );
  }

  // ⏳ Caricamento
  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${GRADIENT}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-white/80 text-sm">Caricamento...</p>
        </div>
      </div>
    );
  }

  // 🔐 Gestione login
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
      // Timeout race 6s: su cold-start manage-totp può prendere 10-30s,
      // bloccava il login. Fail-open = "no 2FA" se non risponde in 6s.
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
        // 2FA non configurato — continua
      }
    } catch {
      setFormError("Errore di connessione. Riprova tra qualche secondo.");
      setIsSubmitting(false);
    }
  };

  // 📧 Gestione reset password
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) {
        setFormError("Impossibile inviare l'email. Controlla l'indirizzo inserito.");
      } else {
        setResetSent(true);
      }
    } catch {
      setFormError("Errore di rete. Riprova.");
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

  // ─── Layout radice ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Pannello branding — solo desktop ─────────────────────────────── */}
      <div className={`hidden lg:flex lg:w-[45%] flex-col items-center justify-center p-12 bg-gradient-to-br ${GRADIENT}`}>
        <div className="max-w-sm w-full space-y-10">

          {/* Logo */}
          <div className="flex justify-start">
            <img
              src={ediliziaLogo}
              alt="Edilizia in Cloud"
              className="h-12 object-contain brightness-0 invert"
            />
          </div>

          <div className="flex flex-col min-h-[400px] space-y-10">

            {/* Titolo */}
            <div className="space-y-3">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                AREA LAVORI
              </p>
              <h1 className="text-3xl font-bold text-white leading-tight">
                Il tuo cantiere,<br />sempre a portata di mano
              </h1>
              <p className="text-white/80 text-base leading-relaxed">
                Accedi per timbrare, inviare rapportini e seguire l&apos;avanzamento dei lavori
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <Hammer className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Rapportini di lavoro</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Compila e invia le ore direttamente dal cantiere
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Avanzamento SAL</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Stato avanzamento lavori in tempo reale
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 shrink-0 mt-0.5">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Calendario cantieri</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Turni, scadenze e attività pianificate
                  </p>
                </div>
              </div>
            </div>

            {/* Badge ruoli + nota */}
            <div className="mt-auto pt-8 border-t border-white/20">
              <div className="flex gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 bg-white/20 text-white rounded-full px-3 py-1 text-xs font-medium">
                  <HardHat className="h-3 w-3" />
                  Operaio
                </span>
                <span className="flex items-center gap-1.5 bg-white/20 text-white rounded-full px-3 py-1 text-xs font-medium">
                  <Truck className="h-3 w-3" />
                  Subappaltatore
                </span>
              </div>
              <p className="text-white/50 text-xs leading-relaxed mt-3">
                Le credenziali di accesso ti sono state fornite dall&apos;azienda committente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pannello form ─────────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col items-center justify-center min-h-screen lg:min-h-0 bg-gradient-to-br ${GRADIENT} lg:bg-none lg:bg-background p-6`}
      >

        {/* ── 2FA ──────────────────────────────────────────────────────────── */}
        {view === "2fa" && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-4">
                  <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground">Verifica 2FA</h2>
              <p className="text-sm text-muted-foreground">Area Lavori</p>
            </div>
            <TwoFactorVerify
              onSuccess={() => setView("login")}
              onCancel={() => { setView("login"); void signOut(); }}
            />
          </div>
        )}

        {/* ── Login ─────────────────────────────────────────────────────────── */}
        {view === "login" && (
          <>
            {/* Logo mobile */}
            <div className="lg:hidden mb-8 text-center space-y-2">
              <img
                src={ediliziaLogo}
                alt="Edilizia in Cloud"
                className="h-10 mx-auto object-contain brightness-0 invert"
              />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-widest">
                Area Lavori
              </p>
            </div>

            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl lg:shadow-none lg:rounded-none lg:bg-transparent lg:dark:bg-transparent lg:backdrop-blur-none p-8 lg:p-0 space-y-6">

              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white lg:text-foreground">
                  Accedi all&apos;area lavori
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 lg:text-muted-foreground">
                  Usa le credenziali ricevute dalla tua azienda
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="lavori-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lavori-email"
                      type="email"
                      placeholder="tuo@email.it"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
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
                    <Label htmlFor="lavori-password">Password</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-orange-600 hover:text-orange-700 hover:underline font-medium transition-colors"
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lavori-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
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
                      aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                  className={`w-full h-12 ${BTN_GRADIENT}`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    "Accedi"
                  )}
                </Button>
              </form>

              {/* SSO Google + Microsoft — il role check filtra chi non è operatore */}
              <SSOButtons disabled={isSubmitting} onError={(msg) => setFormError(msg)} />

              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">Non hai le credenziali?</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Contatta l&apos;azienda committente per cui lavori.
                </p>
              </div>

              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 lg:text-muted-foreground">
                Sei un titolare?{" "}
                <a
                  href="https://app.ediliziaincloud.com"
                  className="text-orange-600 hover:text-orange-700 hover:underline font-medium"
                >
                  Accedi dall&apos;app aziendale
                </a>
              </p>
            </div>
          </>
        )}

        {/* ── Password dimenticata ───────────────────────────────────────── */}
        {view === "forgot" && (
          <>
            {/* Logo mobile */}
            <div className="lg:hidden mb-8 text-center space-y-2">
              <img
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
                <form onSubmit={handleForgot} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="lavori-reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="lavori-reset-email"
                        type="email"
                        placeholder="tuo@email.it"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
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
                    className={`w-full h-12 ${BTN_GRADIENT}`}
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
