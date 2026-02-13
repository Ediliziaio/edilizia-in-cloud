import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LoginForm } from "@/components/auth/LoginForm";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, role, isLoading } = useAuth();
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);

  useEffect(() => {
    async function checkPasswordChange() {
      // Only check for company_staff users
      if (role === "company_staff" && user) {
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
    if (role === "company_staff") {
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
      default:
        return <Navigate to="/" replace />;
    }
  }

  return <LoginForm />;
}
