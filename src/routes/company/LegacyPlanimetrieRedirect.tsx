import { Navigate, useLocation } from "react-router-dom";
import { percorsoPlanimetriaAttuale } from "@/lib/planimetrie/render/percorsi";

export function LegacyPlanimetrieRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={percorsoPlanimetriaAttuale(pathname, search, hash)} replace />;
}
