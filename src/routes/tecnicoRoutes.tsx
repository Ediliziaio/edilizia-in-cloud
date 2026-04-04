import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { AppRole } from "@/types/auth";

const TecnicoLayout = lazy(() => import("@/components/layouts/TecnicoLayout"));
const TecnicoHome = lazy(() => import("@/pages/tecnico/TecnicoHome"));
const TecnicoIntervento = lazy(() => import("@/pages/tecnico/TecnicoIntervento"));
const TecnicoRapportino = lazy(() => import("@/pages/tecnico/TecnicoRapportino"));
const TecnicoFurgone = lazy(() => import("@/pages/tecnico/TecnicoFurgone"));
const TecnicoInterventi = lazy(() => import("@/pages/tecnico/TecnicoInterventi"));
const TecnicoProfilo = lazy(() => import("@/pages/tecnico/TecnicoProfilo"));

const TECNICO_ROLES: AppRole[] = ["company_admin", "company_staff", "employee"];

export function tecnicoRoutes() {
  return (
    <Route
      path="/tecnico"
      element={
        <ProtectedRoute allowedRoles={TECNICO_ROLES}>
          <TecnicoLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<TecnicoHome />} />
      <Route path="interventi" element={<TecnicoInterventi />} />
      <Route path="intervento/:id" element={<TecnicoIntervento />} />
      <Route path="intervento/:id/rapportino" element={<TecnicoRapportino />} />
      <Route path="furgone" element={<TecnicoFurgone />} />
      <Route path="profilo" element={<TecnicoProfilo />} />
    </Route>
  );
}
