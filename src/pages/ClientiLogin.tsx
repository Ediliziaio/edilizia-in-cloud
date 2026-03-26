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
  ArrowLeft,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";

type ViewMode = "login" | "forgot" | "2fa";

export default function ClientiLogin() {
  const { user, role, isLoading, signIn, signOut } = useAuth();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  // Already authenticated as customer — redirect to portal
  if (!isLoading && user && role === "customer") {
    return <Navigate to="/cliente" replace />;
  }

  // Already authenticated but wrong role — block access
  if (!isLoading && user && role && role !== "customer") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <Building2 className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Accesso Negato</h1>
          <p className="text-muted-foreground">
            Accesso riservato ai clienti. Contatta l&apos;azienda per assistenza.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
            }}
          >
            Esci e torna al login
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Email o password non validi. Riprova.",
        });
        setIsSubmitting(false);
        return;
      }

      // Check 2FA status
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
        // If TOTP check fails, proceed normally
      }

      // Verify that the logged-in user is actually a customer
      const { data: { user: loggedUser } } = await supabase.auth.getUser();
      if (loggedUser) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", loggedUser.id);

        const isCustomer = roles?.some((r) => r.role === "customer");
        if (!isCustomer) {
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Accesso Negato",
            description:
              "Accesso riservato ai clienti. Contatta l'azienda per assistenza.",
          });
          setIsSubmitting(false);
          return;
        }
      }

      toast({ title: "Accesso effettuato", description: "Benvenuto nel portale clienti!" });
    } catch {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({
          variant: "destructive",
          title: "Errore",
          description: "Impossibile inviare l'email di reset. Riprova.",
        });
      } else {
        setResetSent(true);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchToForgot = () => {
    setView("forgot");
    setResetSent(false);
    setPassword("");
  };

  const switchToLogin = () => {
    setView("login");
    setResetSent(false);
  };

  const handle2FAVerified = () => {
    toast({ title: "Accesso effettuato", description: "Benvenuto nel portale clienti!" });
    window.location.reload();
  };

  const handle2FACancel = async () => {
    await supabase.auth.signOut();
    setView("login");
    toast({ title: "Accesso annullato", description: "Verifica 2FA richiesta." });
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left branding panel — blue/teal gradient */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12 bg-gradient-to-br from-blue-600 via-blue-500 to-teal-500">
        <div className="max-w-md text-center space-y-8">
          <img
            src={ediliziaLogo}
            alt="Edilizia in Cloud"
            className="h-14 mx-auto object-contain brightness-0 invert"
          />
          <div className="space-y-2">
            <p className="text-white/80 text-sm font-semibold uppercase tracking-widest">
              Portale Clienti
            </p>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Benvenuto nel portale clienti
            </h1>
          </div>
          <p className="text-white/70 text-lg leading-relaxed">
            Accedi per visualizzare i tuoi ordini, documenti e appuntamenti.
          </p>

          {/* Decorative icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-white/10 p-6">
              <Building2 className="h-16 w-16 text-white/90" />
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 text-center space-y-2">
          <img
            src={ediliziaLogo}
            alt="Edilizia in Cloud"
            className="h-12 mx-auto object-contain"
          />
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest">
            Portale Clienti
          </p>
        </div>

        <div className="w-full max-w-sm space-y-8">
          {view === "2fa" && (
            <TwoFactorVerify onVerified={handle2FAVerified} onCancel={handle2FACancel} />
          )}

          {view === "login" && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Accedi</h2>
                <p className="text-muted-foreground">
                  Inserisci le tue credenziali per accedere al portale
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
                      placeholder="nome@esempio.it"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                      autoComplete="email"
                      className="pl-10 h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="clienti-password">Password</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-blue-600 hover:underline font-medium"
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
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      className="pl-10 pr-10 h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
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

              <p className="text-center text-xs text-muted-foreground">
                Problemi di accesso? Contatta l&apos;azienda per assistenza.
              </p>
            </>
          )}

          {view === "forgot" && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Recupera password</h2>
                <p className="text-muted-foreground">
                  Inserisci la tua email per ricevere il link di reset
                </p>
              </div>

              {resetSent ? (
                <div className="text-center space-y-4 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-foreground font-medium">Email inviata!</p>
                  <p className="text-sm text-muted-foreground">
                    Controlla la tua casella di posta e clicca sul link per reimpostare la password.
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
                        placeholder="nome@esempio.it"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isSubmitting}
                        autoComplete="email"
                        className="pl-10 h-11"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
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

              <Button variant="ghost" className="w-full" onClick={switchToLogin}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna al login
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
