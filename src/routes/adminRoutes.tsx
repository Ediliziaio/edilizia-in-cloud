import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RequireSuperAdmin } from "@/components/auth/RequireSuperAdmin";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { ADMIN_PLATFORM_ROLES } from "@/types/auth";

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
const PlanDetail = lazy(() => import("@/pages/admin/PlanDetail"));
const ReferralDashboard = lazy(() => import("@/pages/admin/ReferralDashboard"));
const FeatureFlags = lazy(() => import("@/pages/admin/FeatureFlags"));
const AdminSettingsSecurity = lazy(() => import("@/pages/admin/settings/AdminSettingsSecurity"));
const SyncLogs = lazy(() => import("@/pages/admin/SyncLogs"));
const CompanyLifecycle = lazy(() => import("@/pages/admin/CompanyLifecycle"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
const CustomerSuccess = lazy(() => import("@/pages/admin/CustomerSuccess"));
// AdminCSTasks non è più importato qui: vive come tab dentro AdminAttivita.
// La route /admin/cs-tasks redirige al tab per backward-compat.
const AdminAttivita = lazy(() => import("@/pages/admin/AdminAttivita"));
const AdminTeamChat = lazy(() => import("@/pages/admin/AdminTeamChat"));
const AdminGDPR = lazy(() => import("@/pages/admin/AdminGDPR"));
const AdminSettingsIPAllowlist = lazy(() => import("@/pages/admin/settings/AdminSettingsIPAllowlist"));
const AdminSettingsIntegrations = lazy(() => import("@/pages/admin/settings/AdminSettingsIntegrations"));
const AdminSettingsBanking = lazy(() => import("@/pages/admin/settings/AdminSettingsBanking"));
const AdminSettingsWebhooks = lazy(() => import("@/pages/admin/settings/AdminSettingsWebhooks"));
const AdminSettingsWebhookLogs = lazy(() => import("@/pages/admin/settings/AdminSettingsWebhookLogs"));
const AdminSettingsBankingOverview = lazy(() => import("@/pages/admin/settings/AdminSettingsBankingOverview"));
const AdminSettingsAIUsage = lazy(() => import("@/pages/admin/settings/AdminSettingsAIUsage"));
const AdminMarketingDashboard = lazy(() => import("@/pages/admin/marketing/AdminMarketingDashboard"));
const AdminMarketingContacts = lazy(() => import("@/pages/admin/marketing/AdminMarketingContacts"));
const AdminMarketingOpportunities = lazy(() => import("@/pages/admin/marketing/AdminMarketingOpportunities"));
const AdminMarketingCalendar = lazy(() => import("@/pages/admin/marketing/AdminMarketingCalendar"));
const AdminEmailMarketing = lazy(() => import("@/pages/admin/marketing/AdminEmailMarketing"));
const AdminSmsMarketing = lazy(() => import("@/pages/admin/marketing/AdminSmsMarketing"));
const AdminWhatsApp = lazy(() => import("@/pages/admin/marketing/AdminWhatsApp"));
const AdminMarketingAutomations = lazy(() => import("@/pages/admin/marketing/AdminMarketingAutomations"));
const AdminMarketingContactDetail = lazy(() => import("@/pages/admin/marketing/AdminMarketingContactDetail"));
// MP-CLEANUP: AdminMarketingWhatsApp rimosso (dominio messaging legacy).
const AdminMarketingAgents = lazy(() => import("@/pages/admin/marketing/AdminMarketingAgents"));
const AdminMarketingAutomationBuilder = lazy(() => import("@/pages/admin/marketing/AdminMarketingAutomationBuilder"));
const AdminCampaignEditor = lazy(() => import("@/pages/admin/marketing/AdminCampaignEditor"));
const AdminDragDropEmailBuilder = lazy(() => import("@/pages/admin/marketing/AdminDragDropEmailBuilder"));
const AdminCampaignSendSettings = lazy(() => import("@/pages/admin/marketing/AdminCampaignSendSettings"));
const AdminFacebookForms = lazy(() => import("@/pages/admin/marketing/AdminFacebookForms"));
const AdminMarketingReportistica = lazy(() => import("@/pages/admin/marketing/AdminMarketingReportistica"));
const AdminSalesOS = lazy(() => import("@/pages/admin/marketing/AdminSalesOS"));
const AdminPreventivi = lazy(() => import("@/pages/admin/marketing/AdminPreventivi"));
const AdminQuoteBuilder = lazy(() => import("@/pages/admin/marketing/AdminQuoteBuilder"));
const AdminQuoteDetail = lazy(() => import("@/pages/admin/marketing/AdminQuoteDetail"));
const AdminRevenueDashboard = lazy(() => import("@/pages/admin/AdminRevenueDashboard"));
const PromoCodes = lazy(() => import("@/pages/admin/PromoCodes"));
const AdminInvoiceHistory = lazy(() => import("@/pages/admin/AdminInvoiceHistory"));
const AdminDunningConfig = lazy(() => import("@/pages/admin/AdminDunningConfig"));
const AdminCSDashboard = lazy(() => import("@/pages/admin/AdminCSDashboard"));
const SmsSuperAdminPage = lazy(() => import("@/pages/admin/sms/SmsSuperAdminPage"));
const AdminCRM = lazy(() => import("@/pages/admin/AdminCRM"));
// Campagne AB Test (Feature 7)
const CampaignsPage = lazy(() => import("@/pages/admin/CampaignsPage"));
const CampaignAnalyticsPage = lazy(() => import("@/pages/admin/CampaignAnalyticsPage"));
// Playbook Automatici (Feature 8)
const PlaybooksPage = lazy(() => import("@/pages/admin/PlaybooksPage"));
// Import CSV Lead (Feature 5)
const CsvImportPage = lazy(() => import("@/pages/admin/CsvImportPage"));
// Audit Log Flag (Feature 9)
const AuditLogPage = lazy(() => import("@/pages/admin/AuditLogPage"));
// Failure Alerts (Feature 11)
const FailureAlertsPage = lazy(() => import("@/pages/admin/FailureAlertsPage"));
// Cohort Chart (Feature 3)
const CohortPage = lazy(() => import("@/pages/admin/CohortPage"));
// Dunning Templates (Feature 4)
const DunningTemplatesPage = lazy(() => import("@/pages/admin/DunningTemplatesPage"));
// Mobile menu
const AdminMobileMenu = lazy(() => import("@/pages/admin/AdminMobileMenu"));

export function adminRoutes() {
  return (
    <>
      {/* Full-screen Admin Automation Builder routes - OUTSIDE AdminLayout */}
      <Route
        path="/admin/marketing/automazioni/nuova"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <AdminMarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/marketing/automazioni/:id"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <AdminMarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Full-screen Admin Campaign Editor routes - OUTSIDE AdminLayout */}
      <Route
        path="/admin/marketing/email/campagna/:id/editor"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nell'editor campagna">
              <AdminCampaignEditor />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/marketing/email/campagna/:id/builder"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder email">
              <AdminDragDropEmailBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/marketing/email/campagna/:id/impostazioni"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nelle impostazioni campagna">
              <AdminCampaignSendSettings />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Super Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel pannello di amministrazione">
              <AdminLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="menu" element={<AdminMobileMenu />} />
        <Route path="aziende" element={<CompaniesList />} />
        <Route path="aziende/nuova" element={<CreateCompany />} />
        <Route path="aziende/:id" element={<CompanyDetail />} />
        <Route path="ticket" element={<GlobalTickets />} />
        <Route path="impostazioni" element={<Navigate to="/admin/impostazioni/profilo" replace />} />
        <Route path="impostazioni/profilo" element={<AdminSettingsProfile />} />
        <Route path="impostazioni/piattaforma" element={<RequireSuperAdmin><AdminSettingsPlatform /></RequireSuperAdmin>} />
        <Route path="impostazioni/notifiche" element={<AdminSettingsNotifications />} />
        <Route path="impostazioni/super-admin" element={<RequireSuperAdmin><AdminSettingsSuperAdmins /></RequireSuperAdmin>} />
        <Route path="impostazioni/audit" element={<RequireSuperAdmin><AdminSettingsAuditLog /></RequireSuperAdmin>} />
        <Route path="impostazioni/email" element={<AdminSettingsEmail />} />
        <Route path="impostazioni/agenti-ai" element={<AdminSettingsAI />} />
        <Route path="impostazioni/ip-allowlist" element={<RequireSuperAdmin><AdminSettingsIPAllowlist /></RequireSuperAdmin>} />
        <Route path="impostazioni/sicurezza" element={<RequireSuperAdmin><AdminSettingsSecurity /></RequireSuperAdmin>} />
        <Route path="impostazioni/feature-flags" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="impostazioni/integrazioni" element={<RequireSuperAdmin><AdminSettingsIntegrations /></RequireSuperAdmin>} />
        <Route path="impostazioni/banking" element={<RequireSuperAdmin><AdminSettingsBanking /></RequireSuperAdmin>} />
        <Route path="impostazioni/webhooks" element={<RequireSuperAdmin><AdminSettingsWebhooks /></RequireSuperAdmin>} />
        <Route path="impostazioni/webhook-logs" element={<RequireSuperAdmin><AdminSettingsWebhookLogs /></RequireSuperAdmin>} />
        <Route path="impostazioni/banking-overview" element={<RequireSuperAdmin><AdminSettingsBankingOverview /></RequireSuperAdmin>} />
        {/* Monitor AI: nuova route nella sidebar principale.
            Vecchio path /admin/impostazioni/ai-usage redirige per backward compat. */}
        <Route path="ai-usage" element={<AdminSettingsAIUsage />} />
        <Route path="impostazioni/ai-usage" element={<Navigate to="/admin/ai-usage" replace />} />
        <Route path="piani" element={<RequireSuperAdmin><SubscriptionPlans /></RequireSuperAdmin>} />
        <Route path="piani/:id" element={<RequireSuperAdmin><PlanDetail /></RequireSuperAdmin>} />
        <Route path="referral" element={<ReferralDashboard />} />
        <Route path="feature-flags" element={<RequireSuperAdmin><FeatureFlags /></RequireSuperAdmin>} />
        <Route path="implementazioni" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="sync-logs" element={<SyncLogs />} />
        <Route path="lifecycle" element={<CompanyLifecycle />} />
        <Route path="annunci" element={<Announcements />} />
        <Route path="customer-success" element={<CustomerSuccess />} />
        {/* Cruscotto top section: Attività & Chat (replicate dalla sidebar Azienda).
            La gestione completa task vive ora dentro Attività come tab "Tutte le
            attività"; /admin/cs-tasks redirige al tab per non rompere link
            esistenti (mobile menu, lifecycle, breadcrumb, deep link salvati). */}
        <Route path="attivita" element={<AdminAttivita />} />
        <Route path="cs-tasks" element={<Navigate to="/admin/attivita?tab=tutte" replace />} />
        <Route path="chat" element={<AdminTeamChat />} />
        <Route path="gdpr" element={<RequireSuperAdmin><AdminGDPR /></RequireSuperAdmin>} />
        <Route path="marketing" element={<AdminMarketingDashboard />} />
        <Route path="marketing/contatti" element={<AdminMarketingContacts />} />
        <Route path="marketing/contatti/:id" element={<AdminMarketingContactDetail />} />
        <Route path="marketing/opportunita" element={<AdminMarketingOpportunities />} />
        <Route path="marketing/calendario" element={<AdminMarketingCalendar />} />
        <Route path="marketing/email" element={<AdminEmailMarketing />} />
        <Route path="marketing/sms" element={<AdminSmsMarketing />} />
        <Route path="marketing/whatsapp" element={<AdminWhatsApp />} />
        <Route path="marketing/automazioni" element={<AdminMarketingAutomations />} />
        {/* MP-CLEANUP: rotta admin marketing/whatsapp rimossa (vecchio dominio messaging). */}
        <Route path="marketing/lead-forms" element={<AdminFacebookForms />} />
        <Route path="marketing/reportistica" element={<AdminMarketingReportistica />} />
        <Route path="marketing/sales-os" element={<AdminSalesOS />} />
        <Route path="marketing/preventivi" element={<AdminPreventivi />} />
        <Route path="marketing/preventivi/nuovo" element={<AdminQuoteBuilder />} />
        <Route path="marketing/preventivi/:id" element={<AdminQuoteDetail />} />
        <Route path="marketing/preventivi/:id/modifica" element={<AdminQuoteBuilder />} />
        <Route path="marketing/agenti-ai/*" element={<AdminMarketingAgents />} />
        <Route path="revenue" element={<AdminRevenueDashboard />} />
        <Route path="promo-codes" element={<PromoCodes />} />
        <Route path="fatture" element={<AdminInvoiceHistory />} />
        <Route path="dunning" element={<RequireSuperAdmin><AdminDunningConfig /></RequireSuperAdmin>} />
        <Route path="cs-dashboard" element={<AdminCSDashboard />} />
        <Route path="sms" element={<SmsSuperAdminPage />} />
        <Route path="crm" element={<AdminCRM />} />
        {/* Campagne AB Test — Feature 7 */}
        <Route path="campagne" element={<CampaignsPage />} />
        <Route path="campagne/:id/analytics" element={<CampaignAnalyticsPage />} />
        {/* Playbook Automatici — Feature 8 */}
        <Route path="playbooks" element={<PlaybooksPage />} />
        {/* Import CSV Lead — Feature 5 */}
        <Route path="csv-import" element={<CsvImportPage />} />
        {/* Audit Log Flag — Feature 9 */}
        <Route path="audit-log" element={<RequireSuperAdmin><AuditLogPage /></RequireSuperAdmin>} />
        {/* Failure Alerts — Feature 11 */}
        <Route path="failure-alerts" element={<FailureAlertsPage />} />
        {/* Cohort Chart — Feature 3 */}
        <Route path="cohort" element={<CohortPage />} />
        {/* Dunning Templates — Feature 4 */}
        <Route path="dunning-templates" element={<RequireSuperAdmin><DunningTemplatesPage /></RequireSuperAdmin>} />
      </Route>
    </>
  );
}
