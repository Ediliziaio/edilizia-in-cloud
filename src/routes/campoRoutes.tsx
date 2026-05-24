/**
 * Route area campo — operai interni e subappaltatori.
 * Accessibile da lavori.ediliziaincloud.com/campo.
 */
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import CampoLavoroDetail from "@/pages/campo/CampoLavoroDetail";
import { CAMPO_ROLES } from "@/types/auth";

const CampoLayout         = lazy(() => import("@/components/layouts/CampoLayout"));
const CampoHome           = lazy(() => import("@/pages/campo/CampoHome"));
const CampoCalendario     = lazy(() => import("@/pages/campo/CampoCalendario"));
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
const CampoAttivita       = lazy(() => import("@/pages/campo/CampoAttivita"));

/** v8.6.115 — Lazy container. */
export default function CampoRoutesContainer() {
  return (
    <Routes>
      <Route
        path=""
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
        <Route path="lavoro/:orderId/*">
          <Route index element={<CampoLavoroDetail />} />
          <Route path="rapportino" element={<CampoRapportino />} />
          <Route path="rapportino/:rapportinoId" element={<CampoRapportino />} />
          <Route path="rapportino-vocale" element={<CampoRapportinoVoce />} />
        </Route>
        <Route path="sicurezza" element={<CampoChecklistSicurezza />} />
        <Route path="rapportino-vocale" element={<CampoRapportinoVoce />} />
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
        <Route path="attivita" element={<CampoAttivita />} />
        <Route path="menu" element={<CampoMenu />} />
        <Route path="*" element={<Navigate to="/campo" replace />} />
      </Route>
    </Routes>
  );
}
