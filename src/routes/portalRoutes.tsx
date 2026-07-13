import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
import { PartnerLayout } from "@/components/layouts/PartnerLayout";
import { ProduttoreLayout } from "@/components/layouts/ProduttoreLayout";
import { EMPLOYEE_LEGACY_REDIRECTS } from "@/routes/employeeLegacyRedirects";

// Customer pages
const CustomerOrders = lazy(() => import("@/pages/cliente/CustomerOrders"));
const CustomerOrderDetail = lazy(() => import("@/pages/cliente/CustomerOrderDetail"));
const CustomerSupport = lazy(() => import("@/pages/cliente/CustomerSupport"));
const CreateTicket = lazy(() => import("@/pages/cliente/CreateTicket"));
const CustomerTicketDetail = lazy(() => import("@/pages/cliente/CustomerTicketDetail"));
const CustomerProfile = lazy(() => import("@/pages/cliente/CustomerProfile"));
const CustomerDocuments = lazy(() => import("@/pages/cliente/CustomerDocuments"));
const CustomerInstallments = lazy(() => import("@/pages/cliente/CustomerInstallments"));
const CustomerAppointments = lazy(() => import("@/pages/cliente/CustomerAppointments"));
const CustomerFirma = lazy(() => import("@/pages/cliente/CustomerFirma"));
const CustomerMenu = lazy(() => import("@/pages/cliente/CustomerMenu"));

// Partner pages
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerDashboard"));
const ProduttoreDashboard = lazy(() => import("@/pages/produttore/ProduttoreDashboard"));
const ProduttoreBranding = lazy(() => import("@/pages/produttore/ProduttoreBranding"));
const ProduttoreFatturazione = lazy(() => import("@/pages/produttore/ProduttoreFatturazione"));
const ProduttoreImpostazioni = lazy(() => import("@/pages/produttore/ProduttoreImpostazioni"));
const PartnerLink = lazy(() => import("@/pages/partner/PartnerLink"));
const PartnerReferrals = lazy(() => import("@/pages/partner/PartnerReferrals"));
const PartnerPerformance = lazy(() => import("@/pages/partner/PartnerPerformance"));
const PartnerCommissions = lazy(() => import("@/pages/partner/PartnerCommissions"));
const PartnerPayout = lazy(() => import("@/pages/partner/PartnerPayout"));
const PartnerMaterials = lazy(() => import("@/pages/partner/PartnerMaterials"));
const PartnerProfile = lazy(() => import("@/pages/partner/PartnerProfile"));

export function customerRoutes() {
  return (
    <Route
      path="/cliente"
      element={
        <ProtectedRoute allowedRoles={["customer"]}>
          <ErrorBoundary title="Errore nell'area cliente">
            <CustomerLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<CustomerOrders />} />
      <Route path="ordini/:id" element={<CustomerOrderDetail />} />
      <Route path="documenti" element={<CustomerDocuments />} />
      <Route path="firma" element={<CustomerFirma />} />
      <Route path="rate" element={<CustomerInstallments />} />
      <Route path="appuntamenti" element={<CustomerAppointments />} />
      <Route path="assistenza" element={<CustomerSupport />} />
      <Route path="assistenza/nuovo" element={<CreateTicket />} />
      <Route path="assistenza/:id" element={<CustomerTicketDetail />} />
      <Route path="profilo" element={<CustomerProfile />} />
      <Route path="menu" element={<CustomerMenu />} />
    </Route>
  );
}

export function employeeRoutes() {
  return (
    <Route path="/dipendente">
      <Route index element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.root} replace />} />
      <Route path="ore" element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.ore} replace />} />
      <Route path="rapportini" element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.rapportini} replace />} />
      <Route path="profilo" element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.profilo} replace />} />
      <Route path="ferie" element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.ferie} replace />} />
      <Route path="*" element={<Navigate to={EMPLOYEE_LEGACY_REDIRECTS.fallback} replace />} />
    </Route>
  );
}

// ── Area Venditore ELIMINATA (13/7/2026) ──────────────────────────────
// Il portale dedicato /venditore (dashboard ordini/guadagni) creava una UX
// divergente e sbagliata: il ruolo salesperson entra nell'app azienda normale
// (/azienda) e vede SOLO i moduli attivati nei suoi permessi, come ogni staff.
// Resta il redirect per vecchi link/segnalibri.
export function salespersonRoutes() {
  return <Route path="/venditore/*" element={<Navigate to="/azienda/attivita" replace />} />;
}

export function partnerRoutes() {
  return (
    <Route
      path="/partner"
      element={
        <ProtectedRoute allowedRoles={["referrer", "super_admin"]}>
          <ErrorBoundary title="Errore nel portale partner">
            <PartnerLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<PartnerDashboard />} />
      <Route path="referenze" element={<PartnerReferrals />} />
      <Route path="link" element={<PartnerLink />} />
      <Route path="performance" element={<PartnerPerformance />} />
      <Route path="commissioni" element={<PartnerCommissions />} />
      <Route path="payout" element={<PartnerPayout />} />
      <Route path="materiali" element={<PartnerMaterials />} />
      <Route path="profilo" element={<PartnerProfile />} />
    </Route>
  );
}

export function produttoreRoutes() {
  return (
    <Route
      path="/produttore"
      element={
        <ProtectedRoute allowedRoles={["produttore_admin", "super_admin"]}>
          <ErrorBoundary title="Errore nell'area produttore">
            <ProduttoreLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<ProduttoreDashboard />} />
      <Route path="branding" element={<ProduttoreBranding />} />
      <Route path="fatturazione" element={<ProduttoreFatturazione />} />
      <Route path="impostazioni" element={<ProduttoreImpostazioni />} />
    </Route>
  );
}
