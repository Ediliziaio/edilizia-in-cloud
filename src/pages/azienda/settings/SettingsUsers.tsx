import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { UsersConfig } from "@/components/settings/UsersConfig";

export default function SettingsUsers() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isAdmin = role === "company_admin" || role === "super_admin";

  useEffect(() => {
    if (!isAdmin) {
      toast({
        title: "Accesso negato",
        description: "Non hai i permessi per gestire gli utenti.",
        variant: "destructive",
      });
      navigate("/azienda/impostazioni/profilo", { replace: true });
    }
  }, [isAdmin, navigate, toast]);

  if (!isAdmin) return null;

  return <UsersConfig />;
}
