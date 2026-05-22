import { useEffect, useState, forwardRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LoginForm } from "@/components/auth/LoginForm";
import { Loader2 } from "lucide-react";
import { logger } from "@/utils/logger";
import { ADMIN_PLATFORM_ROLES, type AppRole } from "@/types/auth";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";

const Login = forwardRef<HTMLDivElement>(function Login(_props, _ref) {
  const { user, role, isLoading } = useAuth();
  const { toast } = useToast();
  useSEO({ title: "Login", noindex: true });
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);
  // Evita doppio toast/signOut in presenza di StrictMode / re-render multipli.
  const [accessDeniedHandled, setAccessDeniedHandled] = useState(false);

  // UX fix: se dopo il login risulta user valido ma role === null (es. super_admin
  // rimosso dall'allowlist e nessun ruolo di fallback), informa l'utente e pulisce
  // la sessione. Senza questo, il redirect default rimandava silenziosamente a /login
  // facendo credere "password sbagliata" quando in realtà è "accesso negato".
  useEffect(() => {
    if (!isLoading && user && role === null && !accessDeniedHandled) {
      setAccessDeniedHandled(true);
      logger.warn("[security] Login: role null post-auth, signOut forzato", {
        email: user.email ?? null,
      });
      toast({
        title: "Accesso non autorizzato",
        description:
          "Questo account non ha i permessi per accedere. Contatta l'amministratore.",
        variant: "destructive",
      });
      void supabase.auth.signOut().catch((err) =>
        logger.error("signOut post-accessDenied fallito:", err),
      );
    }
  }, [isLoading, user, role, accessDeniedHandled, toast]);

  useEffect(() => {
    async function checkPasswordChange() {
      // Only check for company_staff users
      if (["company_staff", "salesperson", "call_center"].includes(role || "") && user) {
        setCheckingPassword(true);
        try {
          const { data, error } = await supabase
            .from("staff_permissions")
            .select("must_change_password")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (error) {
            logger.error("Error checking password flag:", error);
            setMustChangePassword(false);
          } else {
            setMustChangePassword(data?.must_change_password ?? false);
          }
        } catch (err) {
          logger.error("Error in checkPasswordChange:", err);
          setMustChangePassword(false);
        } finally {
          setCheckingPassword(false);
        }
      } else if (role && role !== "company_staff") {
        // For other roles, no need to check password
        setMustChangePassword(false);
      }
    }
    
    if (user && role) {
      checkPasswordChange();
    }
  }, [role, user]);

  // Show loading while auth is loading
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

  // If user is logged in, wait for password check to complete before redirecting
  if (user && role) {
    // For staff, wait until password check is complete
    if (["company_staff", "salesperson", "call_center"].includes(role || "")) {
      if (checkingPassword || mustChangePassword === null) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifica in corso...</p>
            </div>
          </div>
        );
      }
      
      // Staff must change password on first login
      if (mustChangePassword === true) {
        return <Navigate to="/cambia-password" replace />;
      }
    }
    
    // Redirect based on role
    if (ADMIN_PLATFORM_ROLES.includes(role as AppRole)) {
      return <Navigate to="/admin" replace />;
    }
    switch (role) {
      case "company_admin":
      case "company_staff":
        return <Navigate to="/azienda" replace />;
      case "customer":
        return <Navigate to="/cliente" replace />;
      case "employee":
      case "subcontractor":
        return <Navigate to="/campo" replace />;
      case "salesperson":
        return <Navigate to="/venditore" replace />;
      case "call_center":
        return <Navigate to="/azienda" replace />;
      default:
        return <Navigate to="/" replace />;
    }
  }

  return <LoginForm />;
});

export default Login;
