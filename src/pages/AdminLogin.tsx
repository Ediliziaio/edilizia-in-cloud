import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { ADMIN_PLATFORM_ROLES, type AppRole } from "@/types/auth";

type ViewMode = "login" | "2fa";

export default function AdminLogin() {
  const { user, role, isLoading, signIn } = useAuth();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  // If already logged in as an admin role, redirect to the panel
  if (!isLoading && user && role && ADMIN_PLATFORM_ROLES.includes(role as AppRole)) {
    return <Navigate to="/admin" replace />;
  }

  // If logged in but without an admin role, show access denied
  if (!isLoading && user && role && !ADMIN_PLATFORM_ROLES.includes(role as AppRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 text-center space-y-6 max-w-sm">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-500/20 ring-4 ring-red-500/30 p-6">
              <Shield className="h-12 w-12 text-red-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Accesso Negato</h1>
            <p className="text-zinc-400">
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

      // Check 2FA — fail closed: if the check errors, require 2FA anyway for safety
      let twoFaEnabled = false;
      try {
        const { data: totpStatus, error: totpError } = await supabase.functions.invoke("manage-totp", {
          body: { action: "status" },
        });
        if (totpError) {
          // Cannot determine 2FA status — sign out and show error
          await supabase.auth.signOut();
          setFormError("Impossibile verificare lo stato 2FA. Riprova.");
          setIsSubmitting(false);
          return;
        }
        twoFaEnabled = !!totpStatus?.enabled;
      } catch {
        // Network/function error — sign out and fail closed
        await supabase.auth.signOut();
        setFormError("Impossibile contattare il servizio di autenticazione. Riprova.");
        setIsSubmitting(false);
        return;
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

        const isAdminRole = roles?.some((r) =>
          ADMIN_PLATFORM_ROLES.includes(r.role as AppRole)
        );
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

  if (view === "2fa") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-indigo-950 p-4">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-md space-y-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-indigo-500/20 ring-4 ring-indigo-500/30 p-5">
                <Shield className="h-10 w-10 text-indigo-400" />
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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left dark panel — desktop only */}
      <div className="hidden lg:flex lg:w-[40%] flex-col items-center justify-center p-12 bg-zinc-900 dark:bg-zinc-950">
        <div className="max-w-xs w-full space-y-10">
          {/* Shield icon with glow ring */}
          <div className="flex justify-center">
            <div className="rounded-full bg-indigo-500/20 ring-4 ring-indigo-500/30 p-6">
              <Shield className="h-12 w-12 text-indigo-400" />
            </div>
          </div>

          {/* Title block */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Admin Panel</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Accesso riservato agli amministratori
            </p>
          </div>

          {/* Security badges */}
          <div className="flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
              <Lock className="h-3 w-3" />
              Connessione cifrata
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
              <Shield className="h-3 w-3" />
              Autenticazione 2FA
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
              <Lock className="h-3 w-3" />
              Audit log attivo
            </span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center min-h-screen lg:min-h-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-indigo-950 lg:bg-none lg:bg-white lg:dark:bg-zinc-900 p-6">
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 w-full max-w-sm">
          {/* Mobile header */}
          <div className="lg:hidden text-center space-y-5 mb-8">
            <div className="flex justify-center">
              <div className="rounded-full bg-indigo-500/20 ring-4 ring-indigo-500/30 p-5">
                <Shield className="h-10 w-10 text-indigo-400" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-sm text-white/60">Accesso riservato agli amministratori</p>
            </div>
          </div>

          {/* Desktop header */}
          <div className="hidden lg:block text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold text-foreground">Accedi</h2>
            <p className="text-sm text-muted-foreground">
              Inserisci le credenziali di amministratore
            </p>
          </div>

          {/* Form card — glassy on mobile, plain on desktop */}
          <div className="lg:bg-transparent bg-white/5 backdrop-blur-xl border border-white/10 lg:border-0 lg:backdrop-blur-none rounded-2xl lg:rounded-none p-6 lg:p-0 space-y-5">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="admin-email"
                  className="text-white/80 lg:text-foreground text-sm font-medium"
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
                  className="h-11 bg-white/10 lg:bg-background border-white/20 lg:border-input text-white lg:text-foreground placeholder:text-white/40 lg:placeholder:text-muted-foreground focus-visible:ring-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="admin-password"
                  className="text-white/80 lg:text-foreground text-sm font-medium"
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
                    className="h-11 pr-10 bg-white/10 lg:bg-background border-white/20 lg:border-input text-white lg:text-foreground placeholder:text-white/40 lg:placeholder:text-muted-foreground focus-visible:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 lg:text-muted-foreground lg:hover:text-foreground transition-colors"
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
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifica in corso...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Accedi al Pannello Admin
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-white/40 lg:text-muted-foreground pt-1">
              Accesso monitorato e registrato nel log di audit
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
