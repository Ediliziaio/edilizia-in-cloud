import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export function RoleBasedRedirect() {
  const { user, role, isLoading } = useAuth();
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);

  useEffect(() => {
    async function checkPasswordChange() {
      if (role === "company_staff" && user) {
        setCheckingPassword(true);
        const { data } = await supabase
          .from("staff_permissions")
          .select("must_change_password")
          .eq("user_id", user.id)
          .maybeSingle();
        
        setMustChangePassword(data?.must_change_password ?? false);
        setCheckingPassword(false);
      }
    }
    
    checkPasswordChange();
  }, [role, user]);

  if (isLoading || checkingPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Staff must change password on first login
  if (role === "company_staff" && mustChangePassword === true) {
    return <Navigate to="/cambia-password" replace />;
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
    default:
      return <Navigate to="/login" replace />;
  }
}
