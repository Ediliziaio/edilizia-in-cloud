import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Shield, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";

type ViewMode = "login" | "2fa";

export default function AdminLogin() {
  const { user, role, isLoading, signIn } = useAuth();
  const [view, setView] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // If already logged in as super_admin, redirect
  if (!isLoading && user && role === "super_admin") {
    return <Navigate to="/admin" replace />;
  }

  // If logged in but not super_admin, show access denied
  if (!isLoading && user && role && role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Shield className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Accesso Negato</h1>
          <p className="text-muted-foreground">
            Questa pagina è riservata agli amministratori della piattaforma.
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/login"}>
            Torna al login
          </Button>
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
          description: "Credenziali non valide.",
        });
        setIsSubmitting(false);
        return;
      }

      // Check 2FA
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
        // 2FA not configured, continue
      }

      // Verify role after login
      const { data: { user: loggedUser } } = await supabase.auth.getUser();
      if (loggedUser) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", loggedUser.id);

        const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
        if (!isSuperAdmin) {
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Accesso Negato",
            description: "Questa pagina è riservata agli amministratori.",
          });
          setIsSubmitting(false);
          return;
        }
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova.",
      });
    }
    setIsSubmitting(false);
  };

  if (view === "2fa") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <Shield className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Verifica 2FA</h1>
            <p className="text-sm text-muted-foreground">Admin Panel</p>
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Accesso riservato agli amministratori della piattaforma
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ediliziaincloud.it"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <div className="relative">
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            Accedi al Pannello Admin
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Accesso monitorato e registrato nel log di audit
        </p>
      </div>
    </div>
  );
}
