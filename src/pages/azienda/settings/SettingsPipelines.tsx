import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PipelinesConfig } from "@/components/settings/PipelinesConfig";

export default function SettingsPipelines() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  useEffect(() => {
    if (!isAdmin) {
      navigate("/azienda", { replace: true });
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;

  return <PipelinesConfig />;
}
