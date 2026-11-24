/**
 * Route area campo — operai, subappaltatori e tecnici assegnati ai cantieri.
 * Accessibile da lavori.ediliziaincloud.com/campo.
 */
// Le pagine si caricano col ritentativo: dopo un deploy i chunk vecchi non
// esistono più e senza questo la pagina va in errore (vedi lazyWithRetry).
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
// La Home rende disponibili gli invii offline anche alla prima apertura della schermata.
import CampoInvii from "@/pages/campo/CampoInvii";
import CampoLavoroDetail from "@/pages/campo/CampoLavoroDetail";
import { CAMPO_APP_ROLES, CAMPO_ROLES } from "@/types/auth";
import { useIsCampo } from "@/hooks/useIsCampo";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";
import { LinguaCampoProvider } from "@/lib/campo/lingua/LinguaCampo";

const CampoLayout         = lazy(() => import("@/components/layouts/CampoLayout"));
const CampoSchedaCantiere = lazy(() => import("@/pages/campo/CampoSchedaCantiere"));
const ElencoCantieriTecnici = lazy(() => import("@/pages/campo/CampoSchedaCantiere").then(m => ({ default: m.ElencoCantieriTecnici })));
const CampoHome           = lazy(() => import("@/pages/campo/CampoHome"));
const CampoFotoCantiere   = lazy(() => import("@/pages/campo/CampoFotoCantiere"));
const CampoCalendario     = lazy(() => import("@/pages/campo/CampoCalendario"));
const CampoRapportino     = lazy(() => import("@/pages/campo/CampoRapportino"));
const CampoTimbratura     = lazy(() => import("@/pages/campo/CampoTimbratura"));
const CampoSquadra        = lazy(() => import("@/pages/campo/CampoSquadra"));
const CampoVerbale        = lazy(() => import("@/pages/campo/CampoVerbale"));
const CampoMagazzino      = lazy(() => import("@/pages/campo/CampoMagazzino"));
const CampoDDT = lazy(() => import("@/pages/campo/CampoDDT"));
const CampoMerce          = lazy(() => import("@/pages/campo/CampoMerce"));
const CampoArrivoPosizioni = lazy(() => import("@/pages/campo/CampoArrivoPosizioni"));
const CampoChat           = lazy(() => import("@/pages/campo/CampoChat"));
const CampoDocumenti      = lazy(() => import("@/pages/campo/CampoDocumenti"));
const CampoTesserino      = lazy(() => import("@/pages/campo/CampoTesserino"));
const CampoTicketNuovo    = lazy(() => import("@/pages/campo/CampoTicketNuovo"));
const CampoSegnalaSicurezza = lazy(() => import("@/pages/campo/CampoSegnalaSicurezza"));
const CampoBuoniPasto = lazy(() => import("@/pages/campo/CampoBuoniPasto"));
const CampoProfilo        = lazy(() => import("@/pages/campo/CampoProfilo"));
const CampoImpostazioni   = lazy(() => import("@/pages/campo/CampoImpostazioni"));
const PreferenzeNotifiche = lazy(() => import("@/pages/azienda/impostazioni/SettingsNotifiche"));
const CampoChecklistSicurezza = lazy(() => import("@/pages/campo/CampoChecklistSicurezza"));
const CampoRapportinoVoce = lazy(() => import("@/pages/campo/CampoRapportinoVoce"));
const CampoPresenze       = lazy(() => import("@/pages/campo/CampoPresenze"));
const CampoFerie          = lazy(() => import("@/pages/campo/CampoFerie"));
const CampoSpese          = lazy(() => import("@/pages/campo/CampoSpese"));
const CampoCedolini       = lazy(() => import("@/pages/campo/CampoCedolini"));
const CampoAvanzamento    = lazy(() => import("@/pages/campo/CampoAvanzamento"));
const CampoMenu           = lazy(() => import("@/pages/campo/CampoMenu"));
const CampoAttivita       = lazy(() => import("@/pages/campo/CampoAttivita"));
const CampoSopralluoghi = lazy(() => import("@/pages/campo/CampoSopralluoghi"));
const CampoSopralluogo = lazy(() => import("@/pages/campo/CampoSopralluogo"));
const CampoMezzi          = lazy(() => import("@/pages/campo/CampoMezzi"));
const CampoAttrezzo       = lazy(() => import("@/pages/campo/CampoAttrezzo"));

function IngressoCampo() {
  const { isTecnico } = useIsCampo();
  return isTecnico ? <Navigate to={percorsoCantiereTecnico()} replace /> : <CampoHome />;
}

/** v8.6.115 — Lazy container. */
export default function CampoRoutesContainer() {
  return (
    <Routes>
      <Route
        path=""
        element={
          <ProtectedRoute allowedRoles={CAMPO_APP_ROLES}>
            {/* Lingua dell'operaio (23/11/2026): tutto ciò che sta sotto usa useT(); l'italiano resta la base. */}
            <LinguaCampoProvider>
              <ErrorBoundary title="Errore nell'area campo">
                <CampoLayout />
              </ErrorBoundary>
            </LinguaCampoProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<IngressoCampo />} />
        <Route path="cantieri" element={<ElencoCantieriTecnici />} />
        <Route path="cantieri/:orderId" element={<CampoSchedaCantiere />} />
        <Route path="invii" element={<CampoInvii />} />
        <Route path="impostazioni/notifiche" element={<PreferenzeNotifiche soloPersonali />} />
        <Route element={<ProtectedRoute allowedRoles={CAMPO_ROLES}><Outlet /></ProtectedRoute>}>
          <Route path="calendario" element={<CampoCalendario />} />
          <Route path="lavoro/:orderId/*">
            <Route index element={<CampoLavoroDetail />} />
            <Route path="rapportino" element={<CampoRapportino />} />
            <Route path="rapporto-fine-lavori" element={<CampoRapportino tipo="client" />} />
            <Route path="verbale" element={<CampoVerbale />} />
            <Route path="foto" element={<CampoFotoCantiere />} />
            {/* La route "rapportino/:rapportinoId" NON è una modifica: il
                componente ignorava l'id e CREAVA un secondo rapportino. Redirect
                al form nuovo finché una vera modifica non esiste. */}
            <Route path="rapportino/:rapportinoId" element={<Navigate to=".." replace />} />
            <Route path="rapportino-vocale" element={<CampoRapportinoVoce />} />
          </Route>
          <Route path="sicurezza" element={<CampoChecklistSicurezza />} />
          <Route path="rapportino-vocale" element={<CampoRapportinoVoce />} />
          <Route path="timbratura" element={<CampoTimbratura />} />

          <Route path="squadra/:orderId" element={<CampoSquadra />} />
          <Route path="presenze" element={<CampoPresenze />} />
          <Route path="ferie" element={<CampoFerie />} />
          <Route path="spese" element={<CampoSpese />} />
          <Route path="cedolini" element={<CampoCedolini />} />
          <Route path="magazzino" element={<CampoMagazzino />} />
          <Route path="ddt" element={<CampoDDT />} />
          <Route path="merce" element={<CampoMerce />} />
          <Route path="merce/arrivo/:odaId" element={<CampoArrivoPosizioni />} />
          <Route path="mezzi" element={<CampoMezzi />} />
          {/* L'attrezzo appena inquadrato col QR: dove sta, e cosa se ne fa. */}
          <Route path="mezzi/scansione/:codice" element={<CampoAttrezzo />} />
          <Route path="chat" element={<CampoChat />} />
          <Route path="chat/:channelId" element={<CampoChat />} />
          <Route path="documenti" element={<CampoDocumenti />} />
          <Route path="tesserino" element={<CampoTesserino />} />
          <Route path="ticket/nuovo" element={<CampoTicketNuovo />} />
          <Route path="ticket/nuovo/:orderId" element={<CampoTicketNuovo />} />
          {/* Infortuni, quasi-incidenti e situazioni pericolose (23/11/2026). */}
          <Route path="sicurezza/segnala" element={<CampoSegnalaSicurezza />} />
          <Route path="sicurezza/segnala/:orderId" element={<CampoSegnalaSicurezza />} />
          <Route path="buoni-pasto" element={<CampoBuoniPasto />} />
          <Route path="avanzamento" element={<CampoAvanzamento />} />
          {/* Legacy: la vecchia pagina "SAL" era costruita sugli importi (e non ha
              mai funzionato: FK e colonne sbagliate). In cantiere serve segnare le
              fasi fatte, non la contabilità → redirect all'avanzamento. */}
          <Route path="sal" element={<Navigate to="/campo/avanzamento" replace />} />
          {/* Legacy: link/bookmark esistenti. Rende CampoDocumenti (che delega per
              ruolo) e non SubDocumenti diretto, così un operaio che ci arriva non
              finisce sulla pagina documenti del subappaltatore. */}
          <Route path="sub/documenti" element={<CampoDocumenti />} />
          <Route path="profilo" element={<CampoProfilo />} />
          <Route path="impostazioni" element={<CampoImpostazioni />} />
          <Route path="attivita" element={<CampoAttivita />} />
          <Route path="sopralluoghi" element={<CampoSopralluoghi />} />
          <Route path="sopralluoghi/:id" element={<CampoSopralluogo />} />
          <Route path="menu" element={<CampoMenu />} />
        </Route>
        <Route path="*" element={<Navigate to="/campo" replace />} />
      </Route>
    </Routes>
  );
}
