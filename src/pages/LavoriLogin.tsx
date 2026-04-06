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
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { CAMPO_ROLES } from "@/types/auth";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

type ViewMode = "login" | "forgot" | "2fa";

export default function LavoriLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  // ✅ Già autenticato come operaio/subappaltatore — vai all'area lavori
  if (!isLoading && user && role && CAMPO_ROLES.includes(role as "employee" | "subcontractor")) {
    return <Navigate to="/campo" replace />;
  }

  // 🚫 Autenticato ma ruolo non autorizzato
  if (!isLoading && user && role && !CAMPO_ROLES.includes(role as "employee" | "subcontractor")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 text-center space-y-6 max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-500/20 ring-4 ring-red-500/30 p-5">
              <HardHat className="h-12 w-12 text-red-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Accesso non autorizzato</h1>
            <p className="text-muted-foreground text-sm">
              Questo portale è riservato a <strong>operai</strong> e{" "}
              <strong>subappaltatori</strong>.{" "}
              {role === "customer"
                ? "Se sei un cliente, accedi da clienti.ediliziaincloud.com"
                : "Se hai un account aziendale, accedi da app.ediliziaincloud.com"}
            </p>
          </div>
          <Button
            className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white"
            onClick={async () => { await signOut(); }}
          >
            Torna al login
          </Button>
        </div>
      </div>
    );
  }

  // ⏳ Caricamento auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
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

      // Verifica 2FA
      try {
        const { data: totpStatus } = await supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
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

  // 🔑 View: 2FA
  if (view === "2fa") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
        <TwoFactorVerify
          onSuccess={() => setView("login")}
          onCancel={() => { setView("login"); signOut(); }}
        />
      </div>
    );
  }

  // 📮 View: Password dimenticata
  if (view === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <img src={ediliziaLogo} alt="Edilizia in Cloud" className="h-10 w-auto" />
          </div>
          <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8 space-y-6">
            {resetSent ? (
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <p className="font-semibold text-foreground">Email inviata!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Controlla la tua casella email. Il link scade in 1 ora.
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setView("login"); setResetSent(false); }}>
                  Torna al login
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-foreground">Recupera password</h1>
                  <p className="text-sm text-muted-foreground">
                    Inserisci la tua email per ricevere il link di reset.
                  </p>
                </div>
                {formError && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-forgot">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email-forgot"
                        type="email"
                        placeholder="tuo@email.it"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Invia link di reset
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setView("login"); setFormError(null); }}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Torna al login
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 🏠 View principale: Login
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950 p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex justify-center">
          <img src={ediliziaLogo} alt="Edilizia in Cloud" className="h-10 w-auto" />
        </div>

        {/* Card principale */}
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-8 space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">

          {/* Header + badge ruoli */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground">Area Lavori</h1>
              <p className="text-sm text-muted-foreground">Accedi per gestire i tuoi cantieri</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full px-3 py-1 text-xs font-medium">
                <HardHat className="h-3 w-3" />
                Operaio
              </span>
              <span className="flex items-center gap-1.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-full px-3 py-1 text-xs font-medium">
                <Truck className="h-3 w-3" />
                Subappaltatore
              </span>
            </div>
          </div>

          {/* Errore */}
          {formError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tuo@email.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="email"
                  aria-describedby={formError ? "form-error" : undefined}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setFormError(null); }}
                  className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 hover:underline"
                >
                  Password dimenticata?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Accesso in corso...
                </>
              ) : (
                "Accedi all'area lavori"
              )}
            </Button>
          </form>

          {/* Feature pill — mobile context */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
            {[
              { icon: Hammer, label: "Rapportini" },
              { icon: ClipboardList, label: "SAL" },
              { icon: Calendar, label: "Calendario" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 text-center">
                <Icon className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Link area azienda */}
        <p className="text-center text-xs text-white/50">
          Sei un titolare?{" "}
          <a
            href="https://app.ediliziaincloud.com"
            className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
          >
            Accedi dall'app aziendale
          </a>
        </p>
      </div>
    </div>
  );
}
