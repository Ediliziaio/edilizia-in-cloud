import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { AdminLayout } from "@/components/layouts/AdminLayout";

// Admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const CompaniesList = lazy(() => import("@/pages/admin/CompaniesList"));
const CreateCompany = lazy(() => import("@/pages/admin/CreateCompany"));
const CompanyDetail = lazy(() => import("@/pages/admin/CompanyDetail"));
const GlobalTickets = lazy(() => import("@/pages/admin/GlobalTickets"));
const AdminSettingsProfile = lazy(() => import("@/pages/admin/settings/AdminSettingsProfile"));
const AdminSettingsPlatform = lazy(() => import("@/pages/admin/settings/AdminSettingsPlatform"));
const AdminSettingsNotifications = lazy(() => import("@/pages/admin/settings/AdminSettingsNotifications"));
const AdminSettingsSuperAdmins = lazy(() => import("@/pages/admin/settings/AdminSettingsSuperAdmins"));
const AdminSettingsAuditLog = lazy(() => import("@/pages/admin/settings/AdminSettingsAuditLog"));
const AdminSettingsEmail = lazy(() => import("@/pages/admin/settings/AdminSettingsEmail"));
const AdminSettingsAI = lazy(() => import("@/pages/admin/settings/AdminSettingsAI"));
const SubscriptionPlans = lazy(() => import("@/pages/admin/SubscriptionPlans"));
const ReferralDashboard = lazy(() => import("@/pages/admin/ReferralDashboard"));
const FeatureFlags = lazy(() => import("@/pages/admin/FeatureFlags"));
const SyncLogs = lazy(() => import("@/pages/admin/SyncLogs"));
const CompanyLifecycle = lazy(() => import("@/pages/admin/CompanyLifecycle"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
const CustomerSuccess = lazy(() => import("@/pages/admin/CustomerSuccess"));
const AdminCSTasks = lazy(() => import("@/pages/admin/AdminCSTasks"));
const AdminGDPR = lazy(() => import("@/pages/admin/AdminGDPR"));
const AdminSettingsIPAllowlist = lazy(() => import("@/pages/admin/settings/AdminSettingsIPAllowlist"));
const AdminMarketingDashboard = lazy(() => import("@/pages/admin/marketing/AdminMarketingDashboard"));
const AdminMarketingContacts = lazy(() => import("@/pages/admin/marketing/AdminMarketingContacts"));
const AdminMarketingOpportunities = lazy(() => import("@/pages/admin/marketing/AdminMarketingOpportunities"));
const AdminMarketingCalendar = lazy(() => import("@/pages/admin/marketing/AdminMarketingCalendar"));
const AdminEmailMarketing = lazy(() => import("@/pages/admin/marketing/AdminEmailMarketing"));
const AdminMarketingAutomations = lazy(() => import("@/pages/admin/marketing/AdminMarketingAutomations"));
const AdminMarketingContactDetail = lazy(() => import("@/pages/admin/marketing/AdminMarketingContactDetail"));
const AdminMarketingWhatsApp = lazy(() => import("@/pages/admin/marketing/AdminMarketingWhatsApp"));
const AdminMarketingAgents = lazy(() => import("@/pages/admin/marketing/AdminMarketingAgents"));
const AdminMarketingAutomationBuilder = lazy(() => import("@/pages/admin/marketing/AdminMarketingAutomationBuilder"));

export function adminRoutes() {
  return (
    <>
      {/* Full-screen Admin Automation Builder routes - OUTSIDE AdminLayout */}
      <Route
        path="/admin/marketing/automazioni/nuova"
        element={
          <ProtectedRoute allowedRoles={["super_admin"]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <AdminMarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/marketing/automazioni/:id"
        element={
          <ProtectedRoute allowedRoles={["super_admin"]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <AdminMarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Super Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["super_admin"]}>
            <ErrorBoundary title="Errore nel pannello di amministrazione">
              <AdminLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="aziende" element={<CompaniesList />} />
        <Route path="aziende/nuova" element={<CreateCompany />} />
        <Route path="aziende/:id" element={<CompanyDetail />} />
        <Route path="ticket" element={<GlobalTickets />} />
        <Route path="impostazioni" element={<Navigate to="/admin/impostazioni/profilo" replace />} />
        <Route path="impostazioni/profilo" element={<AdminSettingsProfile />} />
        <Route path="impostazioni/piattaforma" element={<AdminSettingsPlatform />} />
        <Route path="impostazioni/notifiche" element={<AdminSettingsNotifications />} />
        <Route path="impostazioni/super-admin" element={<AdminSettingsSuperAdmins />} />
        <Route path="impostazioni/audit" element={<AdminSettingsAuditLog />} />
        <Route path="impostazioni/email" element={<AdminSettingsEmail />} />
        <Route path="impostazioni/agenti-ai" element={<AdminSettingsAI />} />
        <Route path="impostazioni/ip-allowlist" element={<AdminSettingsIPAllowlist />} />
        <Route path="piani" element={<SubscriptionPlans />} />
        <Route path="referral" element={<ReferralDashboard />} />
        <Route path="feature-flags" element={<FeatureFlags />} />
        <Route path="implementazioni" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="sync-logs" element={<SyncLogs />} />
        <Route path="lifecycle" element={<CompanyLifecycle />} />
        <Route path="annunci" element={<Announcements />} />
        <Route path="customer-success" element={<CustomerSuccess />} />
        <Route path="cs-tasks" element={<AdminCSTasks />} />
        <Route path="gdpr" element={<AdminGDPR />} />
        <Route path="marketing" element={<AdminMarketingDashboard />} />
        <Route path="marketing/contatti" element={<AdminMarketingContacts />} />
        <Route path="marketing/contatti/:id" element={<AdminMarketingContactDetail />} />
        <Route path="marketing/opportunita" element={<AdminMarketingOpportunities />} />
        <Route path="marketing/calendario" element={<AdminMarketingCalendar />} />
        <Route path="marketing/email" element={<AdminEmailMarketing />} />
        <Route path="marketing/automazioni" element={<AdminMarketingAutomations />} />
        <Route path="marketing/whatsapp" element={<AdminMarketingWhatsApp />} />
        <Route path="marketing/agenti-ai/*" element={<AdminMarketingAgents />} />
      </Route>
    </>
  );
}
