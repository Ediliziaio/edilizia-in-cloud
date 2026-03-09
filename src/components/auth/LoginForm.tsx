import { useState, forwardRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";

type ViewMode = "login" | "forgot";

export const LoginForm = forwardRef<HTMLDivElement>(function LoginForm(_props, ref) {
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Email o password non validi. Riprova.",
        });
      } else {
        toast({ title: "Accesso effettuato", description: "Benvenuto!" });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) {
        toast({
          variant: "destructive",
          title: "Errore",
          description: "Impossibile accedere con Google. Riprova.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
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
      setIsLoading(false);
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center space-y-8">
          <img
            src={ediliziaLogo}
            alt="EdiliziaInCloud"
            className="h-14 mx-auto brightness-0 invert"
          />
          <h1 className="text-3xl font-bold text-primary-foreground">
            La piattaforma per l'edilizia moderna
          </h1>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            Accedi per gestire i tuoi progetti, ordini e molto altro — tutto in un unico posto.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <img
            src={ediliziaLogo}
            alt="EdiliziaInCloud"
            className="h-12 mx-auto"
          />
        </div>

        <div className="w-full max-w-sm space-y-8">
          {view === "login" && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Bentornato</h2>
                <p className="text-muted-foreground">Accedi al tuo account</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="nome@azienda.it"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      autoComplete="email"
                      className="pl-10 h-11"
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
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
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

                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    "Accedi"
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">oppure</span>
                </div>
              </div>

              {/* Google button */}
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                Accedi con Google
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Problemi di accesso? Contatta il tuo amministratore
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
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="nome@azienda.it"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="email"
                        className="pl-10 h-11"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-11" disabled={isLoading}>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
