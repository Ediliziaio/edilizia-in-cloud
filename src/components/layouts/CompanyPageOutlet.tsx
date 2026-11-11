import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** Un cambio azienda/utente chiude bozze e popup della precedente sessione. */
export function CompanyPageOutlet() {
  const { user, effectiveCompany } = useAuth();
  return <Outlet key={`${user?.id ?? ""}:${effectiveCompany?.id ?? ""}`} />;
}
