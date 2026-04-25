import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { Loader2 } from "lucide-react";
import { getCurrentSubdomain } from "@/hooks/useSubdomainRoute";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

export function RoleBasedRedirect() {
  const { user, role, isLoading } = useAuth();
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);

  useEffect(() => {
    // Cancel flag: evita setState dopo cleanup se role cambia (view-as/impersonation).
    let cancelled = false;

    async function checkPasswordChange() {
      // Multi-company user incluso: anche loro hanno una riga staff_permissions
      // (la baseline usata quando l'access_role corrente è non-admin) e un
      // possibile flag must_change_password al primo login dopo il reset.
      if (["company_staff", "salesperson", "call_center", "employee", "subcontractor", "multi_company_user"].includes(role || "") && user) {
        setCheckingPassword(true);
        try {
          const { data, error } = await supabase
            .from("staff_permissions")
            .select("must_change_password")
            .eq("user_id", user.id)
            .maybeSingle();

          if (cancelled) return;

          if (error) {
            logger.error("Error checking password flag:", error);
            setMustChangePassword(false);
          } else {
            setMustChangePassword(data?.must_change_password ?? false);
          }
        } catch (err) {
          if (cancelled) return;
          logger.error("Error in checkPasswordChange:", err);
          setMustChangePassword(false);
        } finally {
          if (!cancelled) setCheckingPassword(false);
        }
      } else {
        // Fallback esplicito per ogni altro role (evita mustChangePassword=null
        // residuo che lascerebbe lo spinner "Verifica in corso" infinito).
        setMustChangePassword(false);
      }
    }

    if (user && role) {
      checkPasswordChange();
    }

    return () => { cancelled = true; };
  }, [role, user]);

  // Show loading while auth is loading
  if (isLoading) {
    return <LoadingSpinner text="Caricamento..." />;
  }

  // Redirect to the correct login page based on the subdomain when there is no user
  if (!user) {
    const subdomain = getCurrentSubdomain();
    if (subdomain === "admin") {
      return <Navigate to="/admin-login" replace />;
    }
    if (subdomain === "clienti") {
      return <Navigate to="/clienti-login" replace />;
    }
    if (subdomain === "lavori") {
      return <Navigate to="/lavori-login" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  // For staff-type users, wait for password check to complete
  if (["company_staff", "salesperson", "call_center", "employee", "subcontractor"].includes(role || "")) {
    if (checkingPassword || mustChangePassword === null) {
      return <LoadingSpinner text="Verifica in corso..." />;
    }
    
    if (mustChangePassword === true) {
      return <Navigate to="/cambia-password" replace />;
    }
  }

  // 🛡️  Defense-in-depth: blocca dispatch a /admin se qualcuno arriva con
  // super_admin ma email non in allowlist (cache stale, race condition, tampering).
  if (role === "super_admin" && !isSuperAdminEmailAllowed(user.email)) {
    logger.warn("[security] RoleBasedRedirect: super_admin bloccato, dispatch a /azienda");
    return <Navigate to="/azienda" replace />;
  }

  // Redirect based on role
  switch (role) {
    case "super_admin":
    case "platform_manager":
    case "platform_sales":
    case "platform_support":
    case "platform_marketing":
    case "platform_implementation":
      return <Navigate to="/admin" replace />;
    case "company_admin":
      return <Navigate to="/azienda" replace />;
    case "company_staff":
      return <Navigate to="/azienda/attivita" replace />;
    case "customer":
      return <Navigate to="/cliente" replace />;
    case "employee":
    case "subcontractor":
      return <Navigate to="/campo" replace />;
    case "salesperson":
      return <Navigate to="/venditore" replace />;
    case "call_center":
      return <Navigate to="/azienda" replace />;
    case "referrer":
      return <Navigate to="/partner" replace />;
    case "multi_company_user":
      return <Navigate to="/azienda" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
