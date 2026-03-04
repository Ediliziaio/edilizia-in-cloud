import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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
    async function checkPasswordChange() {
      if (["company_staff", "salesperson", "call_center"].includes(role || "") && user) {
        setCheckingPassword(true);
        try {
          const { data, error } = await supabase
            .from("staff_permissions")
            .select("must_change_password")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (error) {
            console.error("Error checking password flag:", error);
            setMustChangePassword(false);
          } else {
            setMustChangePassword(data?.must_change_password ?? false);
          }
        } catch (err) {
          console.error("Error in checkPasswordChange:", err);
          setMustChangePassword(false);
        } finally {
          setCheckingPassword(false);
        }
      } else if (role && role !== "company_staff") {
        // Non-staff users don't need password check
        setMustChangePassword(false);
      }
    }
    
    if (user && role) {
      checkPasswordChange();
    }
  }, [role, user]);

  // Show loading while auth is loading
  if (isLoading) {
    return <LoadingSpinner text="Caricamento..." />;
  }

  // Redirect to login if no user
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // For staff-type users, wait for password check to complete
  if (["company_staff", "salesperson", "call_center"].includes(role || "")) {
    if (checkingPassword || mustChangePassword === null) {
      return <LoadingSpinner text="Verifica in corso..." />;
    }
    
    if (mustChangePassword === true) {
      return <Navigate to="/cambia-password" replace />;
    }
  }

  // Redirect based on role
  switch (role) {
    case "super_admin":
      return <Navigate to="/admin" replace />;
    case "company_admin":
    case "company_staff":
      return <Navigate to="/azienda" replace />;
    case "customer":
      return <Navigate to="/cliente" replace />;
    case "employee":
      return <Navigate to="/dipendente" replace />;
    case "salesperson":
      return <Navigate to="/venditore" replace />;
    case "call_center":
      return <Navigate to="/azienda" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
