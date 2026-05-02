import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TagsConfig } from "@/components/settings/TagsConfig";

export default function SettingsTags() {
  const { role, isLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate("/azienda", { replace: true });
    }
  }, [isAdmin, isLoading, navigate]);

  if (isLoading || !isAdmin) return null;

  return <TagsConfig />;
}
