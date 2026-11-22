// Le pagine si caricano col ritentativo: dopo un deploy i chunk vecchi non
// esistono più e senza questo la pagina va in errore (vedi lazyWithRetry).
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Navigate, Routes, Route, useLocation, useParams } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { AppRole } from "@/types/auth";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";

const TecnicoLayout = lazy(() => import("@/components/layouts/TecnicoLayout"));
const TecnicoHome = lazy(() => import("@/pages/tecnico/TecnicoHome"));
const TecnicoIntervento = lazy(() => import("@/pages/tecnico/TecnicoIntervento"));
const TecnicoRapportino = lazy(() => import("@/pages/tecnico/TecnicoRapportino"));
const TecnicoFurgone = lazy(() => import("@/pages/tecnico/TecnicoFurgone"));
const TecnicoInterventi = lazy(() => import("@/pages/tecnico/TecnicoInterventi"));
const TecnicoProfilo = lazy(() => import("@/pages/tecnico/TecnicoProfilo"));
const TecnicoPercorso = lazy(() => import("@/pages/tecnico/TecnicoPercorso"));

const TECNICO_ROLES: AppRole[] = ["company_admin", "company_staff", "employee"];

function VaiAllaSchedaCantiere() {
  const { orderId } = useParams<{ orderId: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: percorsoCantiereTecnico(orderId), search, hash }} replace />;
}

/** v8.6.115 — Lazy container (caricato solo su /tecnico/*). */
export default function TecnicoRoutesContainer() {
  return (
    <Routes>
      <Route path="cantieri" element={<VaiAllaSchedaCantiere />} />
      <Route path="cantieri/:orderId" element={<VaiAllaSchedaCantiere />} />
      <Route
        path=""
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
        <Route path="percorso" element={<TecnicoPercorso />} />
      </Route>
    </Routes>
  );
}

// Backward compat
export function tecnicoRoutes() { return <TecnicoRoutesContainer />; }
