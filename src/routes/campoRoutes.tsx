/**
 * Route area campo — operai interni e subappaltatori.
 * Accessibile da lavori.ediliziaincloud.com/campo.
 */
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CAMPO_ROLES } from "@/types/auth";

const CampoLayout         = lazy(() => import("@/components/layouts/CampoLayout"));
const CampoHome           = lazy(() => import("@/pages/campo/CampoHome"));
const CampoCalendario     = lazy(() => import("@/pages/campo/CampoCalendario"));
const CampoLavoroDetail   = lazy(() => import("@/pages/campo/CampoLavoroDetail"));
const CampoRapportino     = lazy(() => import("@/pages/campo/CampoRapportino"));
const CampoTimbratura     = lazy(() => import("@/pages/campo/CampoTimbratura"));
const CampoMagazzino      = lazy(() => import("@/pages/campo/CampoMagazzino"));
const CampoChat           = lazy(() => import("@/pages/campo/CampoChat"));
const CampoDocumenti      = lazy(() => import("@/pages/campo/CampoDocumenti"));
const CampoTesserino      = lazy(() => import("@/pages/campo/CampoTesserino"));
const CampoTicketNuovo    = lazy(() => import("@/pages/campo/CampoTicketNuovo"));
const CampoProfilo        = lazy(() => import("@/pages/campo/CampoProfilo"));
const CampoImpostazioni   = lazy(() => import("@/pages/campo/CampoImpostazioni"));
const CampoChecklistSicurezza = lazy(() => import("@/pages/campo/CampoChecklistSicurezza"));
const CampoRapportinoVoce = lazy(() => import("@/pages/campo/CampoRapportinoVoce"));
const CampoPresenze       = lazy(() => import("@/pages/campo/CampoPresenze"));
const CampoFerie          = lazy(() => import("@/pages/campo/CampoFerie"));
const CampoCedolini       = lazy(() => import("@/pages/campo/CampoCedolini"));
const SubSAL              = lazy(() => import("@/pages/campo/subappaltatore/SubSAL"));
const SubDocumenti        = lazy(() => import("@/pages/campo/subappaltatore/SubDocumenti"));
const CampoMenu           = lazy(() => import("@/pages/campo/CampoMenu"));

export function campoRoutes() {
  return (
    <Route
      path="/campo"
      element={
        <ProtectedRoute allowedRoles={[...CAMPO_ROLES]}>
          <ErrorBoundary title="Errore nell'area campo">
            <CampoLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<CampoHome />} />
      <Route path="calendario" element={<CampoCalendario />} />
      <Route path="lavoro/:orderId" element={<CampoLavoroDetail />} />
      <Route path="lavoro/:orderId/rapportino" element={<CampoRapportino />} />
      <Route path="lavoro/:orderId/rapportino/:rapportinoId" element={<CampoRapportino />} />
      <Route path="sicurezza" element={<CampoChecklistSicurezza />} />
      <Route path="rapportino-vocale" element={<CampoRapportinoVoce />} />
      <Route path="lavoro/:orderId/rapportino-vocale" element={<CampoRapportinoVoce />} />
      <Route path="timbratura" element={<CampoTimbratura />} />
      <Route path="presenze" element={<CampoPresenze />} />
      <Route path="ferie" element={<CampoFerie />} />
      <Route path="cedolini" element={<CampoCedolini />} />
      <Route path="magazzino" element={<CampoMagazzino />} />
      <Route path="chat" element={<CampoChat />} />
      <Route path="chat/:channelId" element={<CampoChat />} />
      <Route path="documenti" element={<CampoDocumenti />} />
      <Route path="tesserino" element={<CampoTesserino />} />
      <Route path="ticket/nuovo" element={<CampoTicketNuovo />} />
      <Route path="ticket/nuovo/:orderId" element={<CampoTicketNuovo />} />
      <Route path="sal" element={<SubSAL />} />
      <Route path="sub/documenti" element={<SubDocumenti />} />
      <Route path="profilo" element={<CampoProfilo />} />
      <Route path="impostazioni" element={<CampoImpostazioni />} />
      <Route path="menu" element={<CampoMenu />} />
      <Route path="*" element={<Navigate to="/campo" replace />} />
    </Route>
  );
}
