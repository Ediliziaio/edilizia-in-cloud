import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RequireAdminPermission } from "@/components/auth/RequireAdminPermission";
import { RequireSuperAdmin } from "@/components/auth/RequireSuperAdmin";
import { PreserveQueryRedirect } from "@/components/routing/PreserveQueryRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { ADMIN_PLATFORM_ROLES } from "@/types/auth";

// Admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const CompaniesList = lazy(() => import("@/pages/admin/CompaniesList"));
const CreateCompany = lazy(() => import("@/pages/admin/CreateCompany"));
const CompanyDetail = lazy(() => import("@/pages/admin/CompanyDetail"));
// AdminSettingsProfile rimosso: sostituito da AdminMioProfilo (tab Profilo/
// Sicurezza/Calendari/Email/Notifiche). Vecchia route /admin/impostazioni/
// profilo redirige a /mio-profilo per back-compat.
const AdminSettingsPlatform = lazy(() => import("@/pages/admin/settings/AdminSettingsPlatform"));
const AdminSettingsCustomFields = lazy(() => import("@/pages/admin/settings/AdminSettingsCustomFields"));
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
// Hub AI unificato: Operate · Monitor · Config · Memoria in tab in alto.
const AdminAIHub = lazy(() => import("@/pages/admin/ai/AdminAIHub"));
const AdminBulkSchedulesPage = lazy(() => import("@/pages/admin/AdminBulkSchedulesPage"));
const PlanDetail = lazy(() => import("@/pages/admin/PlanDetail"));
const ReferralDashboard = lazy(() => import("@/pages/admin/ReferralDashboard"));
const ProduttoriDashboard = lazy(() => import("@/pages/admin/ProduttoriDashboard"));
const CommercialistiDashboard = lazy(() => import("@/pages/admin/CommercialistiDashboard"));
const FeatureFlags = lazy(() => import("@/pages/admin/FeatureFlags"));
const FeatureBundles = lazy(() => import("@/pages/admin/FeatureBundles"));
const CompanyPacchettoCustom = lazy(() => import("@/pages/admin/CompanyPacchettoCustom"));
const AdminFvModulo = lazy(() => import("@/pages/admin/AdminFvModulo"));
const AdminSettingsSecurity = lazy(() => import("@/pages/admin/settings/AdminSettingsSecurity"));
const Announcements = lazy(() => import("@/pages/admin/Announcements"));
// AdminCSTasks non è più importato qui: vive come tab dentro AdminAttivita.
// La route /admin/cs-tasks redirige al tab per backward-compat.
const AdminAttivita = lazy(() => import("@/pages/admin/AdminAttivita"));
const AdminEmailClientPage = lazy(() => import("@/pages/admin/AdminEmailClientPage"));
const AdminMioProfilo = lazy(() => import("@/pages/admin/impostazioni/AdminMioProfilo"));
const AdminEmailOAuthCallback = lazy(() => import("@/pages/admin/impostazioni/AdminEmailOAuthCallback"));
const AdminTeamChat = lazy(() => import("@/pages/admin/AdminTeamChat"));
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
const AdminLeadScraper = lazy(() => import("@/pages/admin/marketing/AdminLeadScraper"));
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
const AdminRoiSimulator = lazy(() => import("@/pages/admin/marketing/AdminRoiSimulator"));
const AdminPreventivi = lazy(() => import("@/pages/admin/marketing/AdminPreventivi"));
const AdminQuoteBuilder = lazy(() => import("@/pages/admin/marketing/AdminQuoteBuilder"));
const AdminQuoteDetail = lazy(() => import("@/pages/admin/marketing/AdminQuoteDetail"));
// Hub unificato: 5 tab in alto (Revenue · Piani · Fatture · Promo · Dunning).
// Sostituisce 5 voci sidebar separate per ridurre rumore visivo.
const AdminFatturatoHub = lazy(() => import("@/pages/admin/fatturato/AdminFatturatoHub"));
// FE Operations — dashboard super_admin Fatturazione Elettronica (chi usa, volumi, costi, wallet).
const AdminFatturazioneElettronica = lazy(() => import("@/pages/admin/fatturazione/AdminFatturazioneElettronica"));
// Hub CS: Dashboard · Assistenza · Lifecycle · Onboarding · Playbook.
const AdminCustomerSuccessHub = lazy(() => import("@/pages/admin/cs/AdminCustomerSuccessHub"));
// Hub Operazioni: Sync · Alert · Import · Audit · GDPR.
const AdminOperazioniHub = lazy(() => import("@/pages/admin/operazioni/AdminOperazioniHub"));
// Portale Formazione Superadmin — replica del portale aziendale,
// scoped sulla PLATFORM_ADMIN_COMPANY_ID, con bottone "Esporta a clienti".
const AdminPortalePage = lazy(() => import("@/pages/admin/AdminPortalePage"));
// 404 admin-scoped — preserva AdminLayout (sidebar, header, breadcrumb)
// e mostra suggerimenti contestuali admin.
const NotFound = lazy(() => import("@/pages/NotFound"));
const SmsSuperAdminPage = lazy(() => import("@/pages/admin/sms/SmsSuperAdminPage"));
const AdminCRM = lazy(() => import("@/pages/admin/AdminCRM"));
// Campagne AB Test (Feature 7)
const CampaignsPage = lazy(() => import("@/pages/admin/CampaignsPage"));
const CampaignAnalyticsPage = lazy(() => import("@/pages/admin/CampaignAnalyticsPage"));
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
        {/* /admin/ticket → redirect verso tab "assistenza" dentro hub CS (più sotto) */}
        <Route path="impostazioni" element={<Navigate to="/admin/impostazioni/mio-profilo" replace />} />
        <Route path="impostazioni/profilo" element={<Navigate to="/admin/impostazioni/mio-profilo" replace />} />
        <Route path="impostazioni/piattaforma" element={<RequireSuperAdmin><AdminSettingsPlatform /></RequireSuperAdmin>} />
        <Route path="impostazioni/campi-personalizzati" element={<RequireSuperAdmin><AdminSettingsCustomFields /></RequireSuperAdmin>} />
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
        {/* Portale Formazione Superadmin — corsi interni team + template per
            aziende clienti. Riusa PortalePage azienda via PlatformCompanyProvider. */}
        <Route path="portale-formazione" element={<RequireSuperAdmin><AdminPortalePage /></RequireSuperAdmin>} />
        {/* Hub AI unificato — 4 tab in alto (Operate · Monitor · Config · Memoria). */}
        <Route path="ai" element={<RequireSuperAdmin><AdminAIHub /></RequireSuperAdmin>} />
        {/* Route legacy — redirect verso section corrispondente nell'hub
           PRESERVANDO la query string (sub-tab `?tab=approvals` ecc.). */}
        <Route path="ai-operate" element={<PreserveQueryRedirect to="/admin/ai" />} />
        <Route path="ai-monitor" element={<PreserveQueryRedirect to="/admin/ai" addParams="section=monitor" />} />
        <Route path="ai-config" element={<PreserveQueryRedirect to="/admin/ai" addParams="section=config" />} />
        <Route path="ai-memoria" element={<PreserveQueryRedirect to="/admin/ai" addParams="section=memoria" />} />
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
        {/* /admin/piani standalone → ora redirect al tab dentro l'hub Fatturato (vedi sotto). */}
        {/* La pagina singola di un piano (/admin/piani/:id) resta accessibile direttamente. */}
        <Route path="piani/:id" element={<RequireSuperAdmin><PlanDetail /></RequireSuperAdmin>} />
        <Route path="referral" element={<RequireSuperAdmin><ReferralDashboard /></RequireSuperAdmin>} />
        <Route path="produttori" element={<RequireSuperAdmin><ProduttoriDashboard /></RequireSuperAdmin>} />
        <Route path="commercialisti" element={<RequireSuperAdmin><CommercialistiDashboard /></RequireSuperAdmin>} />
        <Route path="feature-flags" element={<RequireSuperAdmin><FeatureFlags /></RequireSuperAdmin>} />
        <Route path="feature-bundles" element={<RequireSuperAdmin><FeatureBundles /></RequireSuperAdmin>} />
        <Route path="companies/:id/pacchetto-custom" element={<RequireSuperAdmin><CompanyPacchettoCustom /></RequireSuperAdmin>} />
        <Route path="implementazioni" element={<Navigate to="/admin/feature-flags" replace />} />
        <Route path="fv-modulo" element={<RequireSuperAdmin><AdminFvModulo /></RequireSuperAdmin>} />
        {/* Hub Customer Success — 5 tab in alto. */}
        <Route path="cs" element={<RequireAdminPermission permission="can_manage_companies"><AdminCustomerSuccessHub /></RequireAdminPermission>} />
        {/* Hub Operazioni — 5 tab in alto. */}
        <Route path="operazioni" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminOperazioniHub /></RequireAdminPermission>} />
        {/* Route legacy CS → redirect verso tab corrispondente. */}
        <Route path="lifecycle" element={<Navigate to="/admin/cs?tab=lifecycle" replace />} />
        <Route path="customer-success" element={<Navigate to="/admin/cs?tab=onboarding" replace />} />
        {/* Route legacy Operazioni → redirect verso tab corrispondente. */}
        <Route path="sync-logs" element={<Navigate to="/admin/operazioni?tab=sync" replace />} />
        <Route path="annunci" element={<RequireAdminPermission permission="can_view_platform_stats"><Announcements /></RequireAdminPermission>} />
        {/* Cruscotto top section: Attività & Chat (replicate dalla sidebar Azienda).
            La gestione completa task vive ora dentro Attività come tab "Tutte le
            attività"; /admin/cs-tasks redirige al tab per non rompere link
            esistenti (mobile menu, lifecycle, breadcrumb, deep link salvati). */}
        <Route path="attivita" element={<RequireAdminPermission permission="can_manage_companies"><AdminAttivita /></RequireAdminPermission>} />
        {/* Email client (con AI Command Center + smart category filters
            integrati nella toolbar) — aperto a tutto il team admin
            (ognuno vede solo le sue caselle via user_id).
            La vecchia /email-triage è rimossa: era una vista duplicata,
            tutto il triage AI è ora dentro il client 3-pane. */}
        <Route path="email" element={<AdminEmailClientPage />} />
        <Route path="email-triage" element={<Navigate to="/admin/email" replace />} />
        <Route path="cs-tasks" element={<Navigate to="/admin/attivita?tab=tutte" replace />} />
        <Route path="chat" element={<RequireAdminPermission permission="can_manage_companies"><AdminTeamChat /></RequireAdminPermission>} />
        <Route path="gdpr" element={<Navigate to="/admin/operazioni?tab=gdpr" replace />} />
        <Route path="marketing" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingDashboard /></RequireAdminPermission>} />
        <Route path="marketing/contatti" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingContacts /></RequireAdminPermission>} />
        <Route path="marketing/contatti/:id" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingContactDetail /></RequireAdminPermission>} />
        <Route path="marketing/lead-scraper" element={<RequireAdminPermission permission="can_manage_marketing"><AdminLeadScraper /></RequireAdminPermission>} />
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
        <Route path="marketing/simulatore-roi" element={<RequireAdminPermission permission="can_manage_marketing"><AdminRoiSimulator /></RequireAdminPermission>} />
        <Route path="marketing/preventivi" element={<RequireAdminPermission permission="can_manage_marketing"><AdminPreventivi /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/nuovo" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteBuilder /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/:id" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteDetail /></RequireAdminPermission>} />
        <Route path="marketing/preventivi/:id/modifica" element={<RequireAdminPermission permission="can_manage_marketing"><AdminQuoteBuilder /></RequireAdminPermission>} />
        <Route path="marketing/agenti-ai/*" element={<RequireAdminPermission permission="can_manage_marketing"><AdminMarketingAgents /></RequireAdminPermission>} />
        {/* Hub Fatturato — 5 tab in alto, sostituisce 5 voci sidebar separate. */}
        <Route path="fatturato" element={<RequireAdminPermission permission="billing_read"><AdminFatturatoHub /></RequireAdminPermission>} />
        {/* FE Operations — Fatturazione Elettronica (usage + costi + wallet openapi). */}
        <Route path="fatturazione-elettronica" element={<RequireSuperAdmin><AdminFatturazioneElettronica /></RequireSuperAdmin>} />
        {/* Route legacy → redirect verso il tab corrispondente nell'hub.
           Manteniamo bookmark/link esterni funzionanti senza esporre 5 voci. */}
        <Route path="revenue" element={<Navigate to="/admin/fatturato?tab=revenue" replace />} />
        <Route path="piani" element={<Navigate to="/admin/fatturato?tab=piani" replace />} />
        <Route path="fatture" element={<Navigate to="/admin/fatturato?tab=fatture" replace />} />
        <Route path="promo-codes" element={<Navigate to="/admin/fatturato?tab=promo" replace />} />
        <Route path="dunning" element={<Navigate to="/admin/fatturato?tab=dunning" replace />} />
        <Route path="cs-dashboard" element={<Navigate to="/admin/cs?tab=dashboard" replace />} />
        <Route path="sms" element={<RequireSuperAdmin><SmsSuperAdminPage /></RequireSuperAdmin>} />
        <Route path="crm" element={<RequireAdminPermission permission="can_view_platform_stats"><AdminCRM /></RequireAdminPermission>} />
        {/* Campagne AB Test — Feature 7 */}
        <Route path="campagne" element={<RequireAdminPermission permission="can_manage_marketing"><CampaignsPage /></RequireAdminPermission>} />
        <Route path="campagne/:id/analytics" element={<RequireAdminPermission permission="can_manage_marketing"><CampaignAnalyticsPage /></RequireAdminPermission>} />
        {/* Playbook Automatici — ora dentro hub CS come tab "playbook". */}
        <Route path="playbooks" element={<Navigate to="/admin/cs?tab=playbook" replace />} />
        {/* Ticket assistenza → tab "assistenza" dentro hub CS. */}
        <Route path="ticket" element={<Navigate to="/admin/cs?tab=assistenza" replace />} />
        {/* Operazioni — redirect verso tab corrispondente nell'hub. */}
        <Route path="csv-import" element={<Navigate to="/admin/operazioni?tab=import" replace />} />
        <Route path="audit-log" element={<Navigate to="/admin/operazioni?tab=audit" replace />} />
        <Route path="failure-alerts" element={<Navigate to="/admin/operazioni?tab=alert" replace />} />
        {/* Cohort Chart — Feature 3 */}
        <Route path="cohort" element={<RequireAdminPermission permission="can_view_platform_stats"><CohortPage /></RequireAdminPermission>} />
        {/* Dunning Templates — Feature 4 */}
        <Route path="dunning-templates" element={<RequireSuperAdmin><DunningTemplatesPage /></RequireSuperAdmin>} />
        {/* Catch-all: route admin sconosciuta → 404 stilizzato dentro AdminLayout.
            Senza questa, <Outlet/> renderizza vuoto e l'utente vede solo
            sidebar+header senza contenuto, senza feedback. */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// Backward compat (non piu' usato dopo refactor lazy, mantenuto per safety)
export function adminRoutes() {
  return <AdminRoutesContainer />;
}
