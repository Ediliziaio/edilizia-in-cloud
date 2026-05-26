import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Shield, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { SSOButtons } from "@/components/auth/SSOButtons";
import { ADMIN_PLATFORM_ROLES, type AppRole } from "@/types/auth";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { useSEO } from "@/hooks/useSEO";

type ViewMode = "login" | "2fa" | "forgot-password";

export default function AdminLogin() {
  const { user, role, isLoading, signIn } = useAuth();
  useSEO({ title: "Admin Login", noindex: true });
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  // If already logged in as an admin role, redirect to the panel
  if (!isLoading && user && role && ADMIN_PLATFORM_ROLES.includes(role as AppRole)) {
    return <Navigate to="/admin" replace />;
  }

  // If logged in but without an admin role, show access denied
  if (!isLoading && user && role && !ADMIN_PLATFORM_ROLES.includes(role as AppRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 text-center space-y-6 max-w-sm">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-500/20 ring-4 ring-red-500/30 p-6">
              <Shield className="h-12 w-12 text-red-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Accesso Negato</h1>
            <p className="text-white/60">
              Questa pagina è riservata agli amministratori della piattaforma.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            onClick={() => (window.location.href = "/login")}
          >
            Torna al login
          </Button>
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
        setFormError("Credenziali non valide. Riprova.");
        setIsSubmitting(false);
        return;
      }

      // Check 2FA — graceful: if edge function unavailable, skip 2FA check.
      // Timeout race 6s: su cold-start free-tier manage-totp può prendere
      // 10-30s, bloccava il login. Fail-open su timeout (= nessun 2FA).
      let twoFaEnabled = false;
      try {
        const totpInvoke = supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        (totpInvoke as Promise<unknown>).catch(() => {});
        const result = await Promise.race([
          totpInvoke,
          new Promise<{ data: null; error: null }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: null }), 6_000),
          ),
        ]);
        const totpStatus = (result as { data: { enabled?: boolean } | null }).data;
        const totpError = (result as { error: unknown }).error;
        if (!totpError) {
          twoFaEnabled = !!totpStatus?.enabled;
        }
      } catch {
        // Edge function unavailable — proceed without 2FA
      }
      if (twoFaEnabled) {
        setView("2fa");
        setIsSubmitting(false);
        return;
      }

      // Verify role after login
      const {
        data: { user: loggedUser },
      } = await supabase.auth.getUser();
      if (loggedUser) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", loggedUser.id);

        // 🛡️  Defense-in-depth: scarta super_admin per email non in allowlist
        // prima di valutare isAdminRole. Così un utente con solo super_admin
        // fraudolento (senza altri platform_*) si vede rifiutato anche qui.
        const effectiveRoles = (roles ?? [])
          .map((r) => r.role as AppRole)
          .filter((r) => {
            if (r === "super_admin" && !isSuperAdminEmailAllowed(loggedUser.email)) {
              return false;
            }
            return true;
          });

        const isAdminRole = effectiveRoles.some((r) => ADMIN_PLATFORM_ROLES.includes(r));
        if (!isAdminRole) {
          await supabase.auth.signOut();
          setFormError("Accesso negato. Questa pagina è riservata agli amministratori.");
          setIsSubmitting(false);
          return;
        }
      }
    } catch {
      setFormError("Si è verificato un errore. Riprova.");
    }
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    try {
      await supabase.functions.invoke("reset-password-branded", {
        body: { email: resetEmail, redirect_to: window.location.origin },
      });
      setResetSent(true);
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile inviare l'email di reset." });
    } finally {
      setIsResetting(false);
    }
  };

  if (view === "forgot-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-md space-y-6 bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#F97415]/20 ring-4 ring-[#F97415]/30 p-5">
                <Lock className="h-10 w-10 text-[#F97415]" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">Recupera Password</h1>
              <p className="text-sm text-white/60">Admin Panel</p>
            </div>
          </div>
          {resetSent ? (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <p className="text-white font-medium">Email inviata!</p>
              <p className="text-sm text-white/60">
                Controlla la tua casella email e clicca il link per reimpostare la password.
              </p>
              <Button
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
                onClick={() => { setView("login"); setResetSent(false); setResetEmail(""); }}
              >
                Torna al login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-white/70 text-sm font-medium">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="admin@ediliziaincloud.it"
                  required
                  autoFocus
                  disabled={isResetting}
                  className="h-11 bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#F97415] focus-visible:border-[#F97415]/50"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-[#F97415] hover:bg-[#F97415]/90 text-white font-semibold"
                disabled={isResetting}
              >
                {isResetting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invio in corso...</>
                ) : (
                  "Invia link di reset"
                )}
              </Button>
              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full text-center text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                Torna al login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (view === "2fa") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-md space-y-6 bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#F97415]/20 ring-4 ring-[#F97415]/30 p-5">
                <Shield className="h-10 w-10 text-[#F97415]" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">Verifica 2FA</h1>
              <p className="text-sm text-white/60">Admin Panel</p>
            </div>
          </div>
          <TwoFactorVerify
            onVerified={() => {
              // After 2FA, the auth state change will trigger redirect
            }}
            onCancel={async () => {
              await supabase.auth.signOut();
              setView("login");
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97415]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0a0a0a]">
      {/* Left dark panel — desktop only */}
      <div className="hidden lg:flex lg:w-[40%] flex-col items-center justify-center p-12 bg-[#0a0a0a] relative overflow-hidden">
        {/* Orange ambient orb */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[250px] bg-[#F97415]/[0.18] blur-[90px] rounded-full pointer-events-none" />

        <div className="max-w-xs w-full space-y-10 relative z-10">
          {/* Shield icon with orange glow ring */}
          <div className="flex justify-center">
            <div className="rounded-full bg-[#F97415]/20 ring-4 ring-[#F97415]/30 p-6">
              <Shield className="h-12 w-12 text-[#F97415]" />
            </div>
          </div>

          {/* Title block */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Pannello di Controllo</h1>
            <p className="text-white/60 text-sm leading-relaxed">
              Accesso riservato agli amministratori della piattaforma
            </p>
          </div>

          {/* Security badges */}
          <div className="flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-xs">
              <Lock className="h-3 w-3" />
              Connessione cifrata
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-xs">
              <Shield className="h-3 w-3" />
              Autenticazione 2FA
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-xs">
              <Lock className="h-3 w-3" />
              Audit log attivo
            </span>
          </div>

          <div className="flex items-center gap-2 justify-center mt-4">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/60 text-xs">Sistema operativo</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center min-h-screen lg:min-h-0 bg-[#0a0a0a] p-6">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm">
          {/* Mobile header */}
          <div className="lg:hidden text-center space-y-5 mb-8">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#F97415]/20 ring-4 ring-[#F97415]/30 p-5">
                <Shield className="h-10 w-10 text-[#F97415]" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-sm text-white/60">Accesso riservato agli amministratori</p>
            </div>
          </div>

          {/* Desktop header */}
          <div className="hidden lg:block text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold text-white">Accesso Amministratori</h2>
            <p className="text-sm text-white/60">
              Solo per il team interno di Edilizia in Cloud
            </p>
          </div>

          {/* Form card — glass dark on mobile, transparent on desktop */}
          <div className="lg:bg-transparent bg-white/[0.04] backdrop-blur-xl border border-white/10 lg:border-0 lg:backdrop-blur-none rounded-2xl lg:rounded-none p-6 lg:p-0 space-y-5">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="admin-email"
                  className="text-white/70 text-sm font-medium"
                >
                  Email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="admin@ediliziaincloud.it"
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-11 bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#F97415] focus-visible:border-[#F97415]/50"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="admin-password"
                  className="text-white/70 text-sm font-medium"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="h-11 pr-10 bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#F97415] focus-visible:border-[#F97415]/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 transition-colors"
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
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-[#F97415] hover:bg-[#F97415]/90 text-white font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifica in corso...
                  </>
                ) : (
                  "Accedi al Pannello"
                )}
              </Button>
            </form>

            {/* SSO Google + Microsoft — il role check post-login filtra chi non è admin */}
            <SSOButtons disabled={isSubmitting} onError={(msg) => setFormError(msg)} />

            <button
              type="button"
              onClick={() => { setView("forgot-password"); setFormError(null); }}
              className="w-full text-center text-sm text-white/50 hover:text-[#F97415] transition-colors"
            >
              Password dimenticata?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
