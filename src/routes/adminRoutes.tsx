import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RequireAdminPermission } from "@/components/auth/RequireAdminPermission";
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
const AdminChangelog = lazy(() => import("@/pages/admin/AdminChangelog"));
const AdminSettingsEmail = lazy(() => import("@/pages/admin/settings/AdminSettingsEmail"));
const AdminSettingsEmailPreferences = lazy(() => import("@/pages/admin/settings/AdminSettingsEmailPreferences"));
const AdminSettingsEmailDomain = lazy(() => import("@/pages/admin/settings/AdminSettingsEmailDomain"));
const AdminSettingsAI = lazy(() => import("@/pages/admin/settings/AdminSettingsAI"));
// Silvio Superadmin (co-founder AI per Florin)
const SilvioAdminPage = lazy(() => import("@/pages/admin/SilvioAdminPage"));
// AI Test Lab (confronto costi/latency/quality per modello) — usato come tab dentro AIMonitorPage
const AdminAITestLab = lazy(() => import("@/pages/admin/AdminAITestLab"));
// Silvio Hub (approvazioni + queue + policies) — usato come tab dentro AIOperatePage
const SilvioAdminHub = lazy(() => import("@/pages/admin/SilvioAdminHub"));
const SilvioApprovalsPage = lazy(() => import("@/pages/admin/SilvioApprovalsPage"));
// ============================================================================
// REFACTOR Strategia C: nuove 3 pagine AI consolidate
// ============================================================================
const AIConfigPage = lazy(() => import("@/pages/admin/ai/AIConfigPage"));
const AIMonitorPage = lazy(() => import("@/pages/admin/ai/AIMonitorPage"));
const AIOperatePage = lazy(() => import("@/pages/admin/ai/AIOperatePage"));
const AdminAIMemoryPage = lazy(() => import("@/pages/admin/ai/AdminAIMemoryPage"));
const AdminBulkSchedulesPage = lazy(() => import("@/pages/admin/AdminBulkSchedulesPage"));
const SubscriptionPlans = lazy(() => import("@/pages/admin/SubscriptionPlans"));
const PlanDetail = lazy(() => import("@/pages/admin/PlanDetail"));
const ReferralDashboard = lazy(() => import("@/pages/admin/ReferralDashboard"));
const FeatureFlags = lazy(() => import("@/pages/admin/FeatureFlags"));
const FeatureBundles = lazy(() => import("@/pages/admin/FeatureBundles"));
const CompanyPacchettoCustom = lazy(() => import("@/pages/admin/CompanyPacchettoCustom"));
const AdminFvModulo = lazy(() => import("@/pages/admin/AdminFvModulo"));
const AdminSettingsSecurity = lazy(() => import("@/pages/admin/settings/AdminSettingsSecurity"));
const SyncLogs = lazy(() => import("@/pages/admin/SyncLogs"));
const CompanyLifecycle = lazy(() => import("@/pages/admin/CompanyLifecycle"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
const CustomerSuccess = lazy(() => import("@/pages/admin/CustomerSuccess"));
// AdminCSTasks non è più importato qui: vive come tab dentro AdminAttivita.
// La route /admin/cs-tasks redirige al tab per backward-compat.
const AdminAttivita = lazy(() => import("@/pages/admin/AdminAttivita"));
const AdminEmailClientPage = lazy(() => import("@/pages/admin/AdminEmailClientPage"));
const AdminEmailTriagePage = lazy(() => import("@/pages/admin/AdminEmailTriagePage"));
const AdminMioProfilo = lazy(() => import("@/pages/admin/impostazioni/AdminMioProfilo"));
const AdminEmailOAuthCallback = lazy(() => import("@/pages/admin/impostazioni/AdminEmailOAuthCallback"));
const AdminTeamChat = lazy(() => import("@/pages/admin/AdminTeamChat"));
const AdminGDPR = lazy(() => import("@/pages/admin/AdminGDPR"));
const AdminSettingsIPAllowlist = lazy(() => import("@/pages/admin/settings/AdminSettingsIPAllowlist"));
const AdminSettingsIntegrations = lazy(() => import("@/pages/admin/settings/AdminSettingsIntegrations"));
const AdminSettingsMarketingCalendars = lazy(() => import("@/pages/admin/settings/AdminSettingsMarketingCalendars"));
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

import { Routes } from "react-router-dom";

/**
 * v8.6.110 — Lazy container. Vedi commento in companyRoutes.tsx.
 * Caricato on-demand quando l'utente naviga su /admin/*.
 */
export default function AdminRoutesContainer() {
  return (
    <Routes>
      {/* Full-screen Admin Automation Builder routes - OUTSIDE AdminLayout */}
      <Route
        path="marketing/automazioni/nuova"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <RequireAdminPermission permission="can_manage_marketing">
                <AdminMarketingAutomationBuilder />
              </RequireAdminPermission>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="marketing/automazioni/:id"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <RequireAdminPermission permission="can_manage_marketing">
                <AdminMarketingAutomationBuilder />
              </RequireAdminPermission>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Full-screen Admin Campaign Editor routes - OUTSIDE AdminLayout */}
      <Route
        path="marketing/email/campagna/:id/editor"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nell'editor campagna">
              <RequireAdminPermission permission="can_manage_marketing">
                <AdminCampaignEditor />
              </RequireAdminPermission>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="marketing/email/campagna/:id/builder"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel builder email">
              <RequireAdminPermission permission="can_manage_marketing">
                <AdminDragDropEmailBuilder />
              </RequireAdminPermission>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="marketing/email/campagna/:id/impostazioni"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nelle impostazioni campagna">
              <RequireAdminPermission permission="can_manage_marketing">
                <AdminCampaignSendSettings />
              </RequireAdminPermission>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Super Admin Routes */}
      <Route
        path=""
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_PLATFORM_ROLES]}>
            <ErrorBoundary title="Errore nel pannello di amministrazione">
              <AdminLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<RequireAdminPermission permission="can_view_platform_stats"><AdminDashboard /></RequireAdminPermission>} />
        <Route path="menu" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminMobileMenu /></RequireAdminPermission>} />
        <Route path="aziende" element={<RequireSuperAdmin><CompaniesList /></RequireSuperAdmin>} />
        <Route path="aziende/nuova" element={<RequireSuperAdmin><CreateCompany /></RequireSuperAdmin>} />
        <Route path="aziende/:id" element={<RequireSuperAdmin><CompanyDetail /></RequireSuperAdmin>} />
        <Route path="ticket" element={<RequireAdminPermission permission="can_manage_tickets"><GlobalTickets /></RequireAdminPermission>} />
        <Route path="impostazioni" element={<Navigate to="/admin/impostazioni/mio-profilo" replace />} />
        <Route path="impostazioni/profilo" element={<AdminSettingsProfile />} />
        <Route path="impostazioni/piattaforma" element={<RequireSuperAdmin><AdminSettingsPlatform /></RequireSuperAdmin>} />
        <Route path="impostazioni/notifiche" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminSettingsNotifications /></RequireAdminPermission>} />
        <Route path="impostazioni/super-admin" element={<RequireSuperAdmin><AdminSettingsSuperAdmins /></RequireSuperAdmin>} />
        <Route path="impostazioni/audit" element={<RequireSuperAdmin><AdminSettingsAuditLog /></RequireSuperAdmin>} />
        <Route path="changelog" element={<RequireSuperAdmin><AdminChangelog /></RequireSuperAdmin>} />
        <Route path="impostazioni/email" element={<RequireSuperAdmin><AdminSettingsEmail /></RequireSuperAdmin>} />
        <Route path="impostazioni/preferenze-email" element={<RequireSuperAdmin><AdminSettingsEmailPreferences /></RequireSuperAdmin>} />
        <Route path="impostazioni/dominio-email" element={<RequireSuperAdmin><AdminSettingsEmailDomain /></RequireSuperAdmin>} />
        {/* Profilo personale + OAuth callback: aperti a tutti i ruoli admin
            (platform_manager / support / sales / marketing / implementation) —
            ognuno collega la sua casella, isolamento via user_id. */}
        <Route path="impostazioni/mio-profilo" element={<AdminMioProfilo />} />
        <Route path="impostazioni/integrazioni/email-callback" element={<AdminEmailOAuthCallback />} />
        {/* ============================================================
            REFACTOR Strategia C — 3 pagine AI consolidate (nuove)
            ============================================================ */}
        <Route path="ai-config" element={<RequireSuperAdmin><AIConfigPage /></RequireSuperAdmin>} />
        <Route path="ai-monitor" element={<RequireSuperAdmin><AIMonitorPage /></RequireSuperAdmin>} />
        <Route path="ai-operate" element={<RequireSuperAdmin><AIOperatePage /></RequireSuperAdmin>} />
        <Route path="ai-memoria" element={<RequireSuperAdmin><AdminAIMemoryPage /></RequireSuperAdmin>} />
        <Route path="messaggi-programmati" element={<RequireSuperAdmin><AdminBulkSchedulesPage /></RequireSuperAdmin>} />

        {/* Redirect dalle VECCHIE route → nuove pagine (backward-compat bookmark) */}
        <Route path="impostazioni/agenti-ai" element={<Navigate to="/admin/ai-config" replace />} />
        <Route path="ai-test-lab" element={<Navigate to="/admin/ai-monitor?tab=test-lab" replace />} />
        <Route path="silvio-hub" element={<Navigate to="/admin/ai-operate" replace />} />
        <Route path="silvio/approvazioni" element={<Navigate to="/admin/ai-operate?tab=approvals" replace />} />

        {/* Silvio Admin chat (entry point chat dedicata, separata) */}
        <Route path="silvio" element={<RequireSuperAdmin><SilvioAdminPage /></RequireSuperAdmin>} />

        {/* Vecchie pagine ancora montate ma raggiungibili solo via redirect sopra
            (rimangono disponibili come component se servono) */}
        <Route path="legacy/silvio-hub" element={<RequireSuperAdmin><SilvioAdminHub /></RequireSuperAdmin>} />
        <Route path="legacy/agenti-ai" element={<RequireSuperAdmin><AdminSettingsAI /></RequireSuperAdmin>} />
        <Route path="legacy/silvio-approvazioni" element={<RequireSuperAdmin><SilvioApprovalsPage /></RequireSuperAdmin>} />
        <Route path="legacy/ai-test-lab" element={<RequireSuperAdmin><AdminAITestLab /></RequireSuperAdmin>} />
        <Route path="impostazioni/ip-allowlist" element={<RequireSuperAdmin><AdminSettingsIPAllowlist /></RequireSuperAdmin>} />
        <Route path="impostazioni/sicurezza" element={<RequireSuperAdmin><AdminSettingsSecurity /></RequireSuperAdmin>} />
        <Route path="impostazioni/feature-flags" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="impostazioni/integrazioni" element={<RequireSuperAdmin><AdminSettingsIntegrations /></RequireSuperAdmin>} />
        <Route path="impostazioni/calendari" element={<RequireSuperAdmin><AdminSettingsMarketingCalendars /></RequireSuperAdmin>} />
        <Route path="impostazioni/banking" element={<RequireSuperAdmin><AdminSettingsBanking /></RequireSuperAdmin>} />
        <Route path="impostazioni/webhooks" element={<RequireSuperAdmin><AdminSettingsWebhooks /></RequireSuperAdmin>} />
        <Route path="impostazioni/webhook-logs" element={<RequireSuperAdmin><AdminSettingsWebhookLogs /></RequireSuperAdmin>} />
        <Route path="impostazioni/banking-overview" element={<RequireSuperAdmin><AdminSettingsBankingOverview /></RequireSuperAdmin>} />
        {/* Vecchia route ai-usage → redirect alla nuova AI Monitor con tab Usage */}
        <Route path="ai-usage" element={<Navigate to="/admin/ai-monitor?tab=usage" replace />} />
        <Route path="impostazioni/ai-usage" element={<Navigate to="/admin/ai-monitor?tab=usage" replace />} />
        {/* Legacy route della pagina AIUsage standalone, raggiungibile solo via redirect */}
        <Route path="legacy/ai-usage" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminSettingsAIUsage /></RequireAdminPermission>} />
        <Route path="piani" element={<RequireSuperAdmin><SubscriptionPlans /></RequireSuperAdmin>} />
        <Route path="piani/:id" element={<RequireSuperAdmin><PlanDetail /></RequireSuperAdmin>} />
        <Route path="referral" element={<RequireSuperAdmin><ReferralDashboard /></RequireSuperAdmin>} />
        <Route path="feature-flags" element={<RequireSuperAdmin><FeatureFlags /></RequireSuperAdmin>} />
        <Route path="feature-bundles" element={<RequireSuperAdmin><FeatureBundles /></RequireSuperAdmin>} />
        <Route path="companies/:id/pacchetto-custom" element={<RequireSuperAdmin><CompanyPacchettoCustom /></RequireSuperAdmin>} />
        <Route path="implementazioni" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="fv-modulo" element={<RequireSuperAdmin><AdminFvModulo /></RequireSuperAdmin>} />
        <Route path="sync-logs" element={<RequireAdminPermission permission="can_view_platform_stats"><SyncLogs /></RequireAdminPermission>} />
        <Route path="lifecycle" element={<RequireAdminPermission permission="can_manage_companies"><CompanyLifecycle /></RequireAdminPermission>} />
        <Route path="annunci" element={<RequireAdminPermission permission="can_view_platform_stats"><Announcements /></RequireAdminPermission>} />
        <Route path="customer-success" element={<RequireAdminPermission permission="can_manage_companies"><CustomerSuccess /></RequireAdminPermission>} />
        {/* Cruscotto top section: Attività & Chat (replicate dalla sidebar Azienda).
            La gestione completa task vive ora dentro Attività come tab "Tutte le
            attività"; /admin/cs-tasks redirige al tab per non rompere link
            esistenti (mobile menu, lifecycle, breadcrumb, deep link salvati). */}
        <Route path="attivita" element={<RequireAdminPermission permission="can_manage_companies"><AdminAttivita /></RequireAdminPermission>} />
        {/* Email client e triage AI: aperti a tutto il team admin (ognuno
            vede solo le sue caselle via user_id). */}
        <Route path="email" element={<AdminEmailClientPage />} />
        <Route path="email-triage" element={<AdminEmailTriagePage />} />
        <Route path="cs-tasks" element={<Navigate to="/admin/attivita?tab=tutte" replace />} />
        <Route path="chat" element={<RequireAdminPermission permission="can_manage_companies"><AdminTeamChat /></RequireAdminPermission>} />
        <Route path="gdpr" element={<RequireSuperAdmin><AdminGDPR /></RequireSuperAdmin>} />
        <Route path="marketing" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingDashboard /></RequireAdminPermission>} />
        <Route path="marketing/contatti" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingContacts /></RequireAdminPermission>} />
        <Route path="marketing/contatti/:id" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingContactDetail /></RequireAdminPermission>} />
        <Route path="marketing/opportunita" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingOpportunities /></RequireAdminPermission>} />
        <Route path="marketing/calendario" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingCalendar /></RequireAdminPermission>} />
        <Route path="marketing/email" element={<RequireAdminPermission permission="can_manage_marketing"><AdminEmailMarketing /></RequireAdminPermission>} />
        <Route path="marketing/sms" element={<RequireAdminPermission permission="can_manage_marketing"><AdminSmsMarketing /></RequireAdminPermission>} />
        <Route path="marketing/whatsapp" element={<RequireAdminPermission permission="can_manage_marketing"><AdminWhatsApp /></RequireAdminPermission>} />
        <Route path="marketing/automazioni" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingAutomations /></RequireAdminPermission>} />
        {/* MP-CLEANUP: rotta admin marketing/whatsapp rimossa (vecchio dominio messaging). */}
        <Route path="marketing/lead-forms" element={<RequireAdminPermission permission="can_manage_marketing"><AdminFacebookForms /></RequireAdminPermission>} />
        <Route path="marketing/reportistica" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingReportistica /></RequireAdminPermission>} />
        <Route path="marketing/sales-os" element={<RequireAdminPermission permission="can_manage_marketing"><AdminSalesOS /></RequireAdminPermission>} />
        <Route path="marketing/preventivi" element={<RequireAdminPermission permission="can_manage_marketing"><AdminPreventivi /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/nuovo" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteBuilder /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/:id" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteDetail /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/:id/modifica" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteBuilder /></RequireAdminPermission>} />
        <Route path="marketing/agenti-ai/*" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingAgents /></RequireAdminPermission>} />
        <Route path="revenue" element={<RequireAdminPermission permission="billing_read"><AdminRevenueDashboard /></RequireAdminPermission>} />
        <Route path="promo-codes" element={<RequireAdminPermission permission="billing_write"><PromoCodes /></RequireAdminPermission>} />
        <Route path="fatture" element={<RequireAdminPermission permission="billing_read"><AdminInvoiceHistory /></RequireAdminPermission>} />
        <Route path="dunning" element={<RequireSuperAdmin><AdminDunningConfig /></RequireSuperAdmin>} />
        <Route path="cs-dashboard" element={<RequireAdminPermission permission="impersonation"><AdminCSDashboard /></RequireAdminPermission>} />
        <Route path="sms" element={<RequireSuperAdmin><SmsSuperAdminPage /></RequireSuperAdmin>} />
        <Route path="crm" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminCRM /></RequireAdminPermission>} />
        {/* Campagne AB Test — Feature 7 */}
        <Route path="campagne" element={<RequireAdminPermission permission="can_manage_marketing"><CampaignsPage /></RequireAdminPermission>} />
        <Route path="campagne/:id/analytics" element={<RequireAdminPermission permission="can_manage_marketing"><CampaignAnalyticsPage /></RequireAdminPermission>} />
        {/* Playbook Automatici — Feature 8 */}
        <Route path="playbooks" element={<RequireAdminPermission permission="can_manage_companies"><PlaybooksPage /></RequireAdminPermission>} />
        {/* Import CSV Lead — Feature 5 */}
        <Route path="csv-import" element={<RequireAdminPermission permission="can_manage_companies"><CsvImportPage /></RequireAdminPermission>} />
        {/* Audit Log Flag — Feature 9 */}
        <Route path="audit-log" element={<RequireSuperAdmin><AuditLogPage /></RequireSuperAdmin>} />
        {/* Failure Alerts — Feature 11 */}
        <Route path="failure-alerts" element={<RequireAdminPermission permission="can_manage_companies"><FailureAlertsPage /></RequireAdminPermission>} />
        {/* Cohort Chart — Feature 3 */}
        <Route path="cohort" element={<RequireAdminPermission permission="can_view_platform_stats"><CohortPage /></RequireAdminPermission>} />
        {/* Dunning Templates — Feature 4 */}
        <Route path="dunning-templates" element={<RequireSuperAdmin><DunningTemplatesPage /></RequireSuperAdmin>} />
      </Route>
    </Routes>
  );
}

// Backward compat (non piu' usato dopo refactor lazy, mantenuto per safety)
export function adminRoutes() {
  return <AdminRoutesContainer />;
}
