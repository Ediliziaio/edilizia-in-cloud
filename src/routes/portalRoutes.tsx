import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
import { EmployeeLayout } from "@/components/layouts/EmployeeLayout";
import { SalespersonLayout } from "@/components/layouts/SalespersonLayout";
import { PartnerLayout } from "@/components/layouts/PartnerLayout";

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
const CustomerMessages = lazy(() => import("@/pages/cliente/CustomerMessages"));

// Employee pages
const EmployeeDashboard = lazy(() => import("@/pages/dipendente/EmployeeDashboard"));
const TimeEntry = lazy(() => import("@/pages/dipendente/TimeEntry"));
const MyWorkLogs = lazy(() => import("@/pages/dipendente/MyWorkLogs"));
const EmployeeProfile = lazy(() => import("@/pages/dipendente/EmployeeProfile"));
const LeaveRequests = lazy(() => import("@/pages/dipendente/LeaveRequests"));

// Salesperson pages
const SalespersonDashboard = lazy(() => import("@/pages/venditore/SalespersonDashboard"));
const MyOrders = lazy(() => import("@/pages/venditore/MyOrders"));
const MyEarnings = lazy(() => import("@/pages/venditore/MyEarnings"));
const SalespersonProfile = lazy(() => import("@/pages/venditore/SalespersonProfile"));

// Partner pages
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerLink = lazy(() => import("@/pages/partner/PartnerLink"));
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
      <Route path="rate" element={<CustomerInstallments />} />
      <Route path="appuntamenti" element={<CustomerAppointments />} />
      <Route path="messaggi" element={<CustomerMessages />} />
      <Route path="assistenza" element={<CustomerSupport />} />
      <Route path="assistenza/nuovo" element={<CreateTicket />} />
      <Route path="assistenza/:id" element={<CustomerTicketDetail />} />
      <Route path="profilo" element={<CustomerProfile />} />
    </Route>
  );
}

export function employeeRoutes() {
  return (
    <Route
      path="/dipendente"
      element={
        <ProtectedRoute allowedRoles={["employee"]}>
          <ErrorBoundary title="Errore nell'area dipendente">
            <EmployeeLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<EmployeeDashboard />} />
      <Route path="ore" element={<TimeEntry />} />
      <Route path="rapportini" element={<MyWorkLogs />} />
      <Route path="profilo" element={<EmployeeProfile />} />
      <Route path="ferie" element={<LeaveRequests />} />
    </Route>
  );
}

export function salespersonRoutes() {
  return (
    <Route
      path="/venditore"
      element={
        <ProtectedRoute allowedRoles={["salesperson"]}>
          <ErrorBoundary title="Errore nell'area venditore">
            <SalespersonLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }
    >
      <Route index element={<SalespersonDashboard />} />
      <Route path="ordini" element={<MyOrders />} />
      <Route path="guadagni" element={<MyEarnings />} />
      <Route path="profilo" element={<SalespersonProfile />} />
    </Route>
  );
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
      <Route path="link" element={<PartnerLink />} />
      <Route path="commissioni" element={<PartnerCommissions />} />
      <Route path="payout" element={<PartnerPayout />} />
      <Route path="materiali" element={<PartnerMaterials />} />
      <Route path="profilo" element={<PartnerProfile />} />
    </Route>
  );
}
