import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";

// Company pages
const CompanyDashboard = lazy(() => import("@/pages/azienda/CompanyDashboard"));
const CruscottoAziendale = lazy(() => import("@/pages/azienda/CruscottoAziendale"));
const SettingsProfile = lazy(() => import("@/pages/azienda/settings/SettingsProfile"));
const SettingsCatalog = lazy(() => import("@/pages/azienda/settings/SettingsCatalog"));
const SettingsOrderStatus = lazy(() => import("@/pages/azienda/settings/SettingsOrderStatus"));
const SettingsPipelines = lazy(() => import("@/pages/azienda/settings/SettingsPipelines"));
const SettingsSuppliers = lazy(() => import("@/pages/azienda/settings/SettingsSuppliers"));
const SettingsUsers = lazy(() => import("@/pages/azienda/settings/SettingsUsers"));
const SettingsUserDetail = lazy(() => import("@/pages/azienda/settings/SettingsUserDetail"));
const SettingsSalespeople = lazy(() => import("@/pages/azienda/settings/SettingsSalespeople"));
const SettingsStaff = lazy(() => import("@/pages/azienda/settings/SettingsStaff"));
const SettingsTeams = lazy(() => import("@/pages/azienda/settings/SettingsTeams"));
const SettingsSecurity = lazy(() => import("@/pages/azienda/settings/SettingsSecurity"));
const SettingsSecurityDashboard = lazy(() => import("@/pages/azienda/settings/SettingsSecurityDashboard"));
const SettingsActivityLog = lazy(() => import("@/pages/azienda/settings/SettingsActivityLog"));
const SettingsTags = lazy(() => import("@/pages/azienda/settings/SettingsTags"));
const SettingsCustomFields = lazy(() => import("@/pages/azienda/settings/SettingsCustomFields"));
const SettingsMarketingCalendars = lazy(() => import("@/pages/azienda/settings/SettingsMarketingCalendars"));
const SettingsIntegrations = lazy(() => import("@/pages/azienda/settings/SettingsIntegrations"));
const SettingsCostCategories = lazy(() => import("@/pages/azienda/settings/SettingsCostCategories"));
const SettingsFinanceAutomation = lazy(() => import("@/pages/azienda/settings/SettingsFinanceAutomation"));
const SettingsCredits = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));
const SettingsQuoteMaterials = lazy(() => import("@/pages/azienda/settings/SettingsQuoteMaterials"));
const SettingsQuoteTemplates = lazy(() => import("@/pages/azienda/settings/SettingsQuoteTemplates"));
const SettingsApiKeys = lazy(() => import("@/pages/azienda/settings/SettingsApiKeys"));
const SettingsPrivacy = lazy(() => import("@/pages/azienda/settings/SettingsPrivacy"));
const SettingsBranding = lazy(() => import("@/pages/azienda/settings/SettingsBranding"));
const SettingsBilling = lazy(() => import("@/pages/azienda/settings/SettingsBilling"));
const SettingsFormBuilder = lazy(() => import("@/pages/azienda/settings/SettingsFormBuilder"));
const OrdersList = lazy(() => import("@/pages/azienda/OrdersList"));
const CreateOrder = lazy(() => import("@/pages/azienda/CreateOrder"));
const OrderDetail = lazy(() => import("@/pages/azienda/OrderDetail"));
const EditOrder = lazy(() => import("@/pages/azienda/EditOrder"));
const CustomersList = lazy(() => import("@/pages/azienda/CustomersList"));
const CreateCustomer = lazy(() => import("@/pages/azienda/CreateCustomer"));
const CompanyCustomerDetail = lazy(() => import("@/pages/azienda/CompanyCustomerDetail"));
const CashFlowForecast = lazy(() => import("@/pages/azienda/CashFlowForecast"));
const Warehouse = lazy(() => import("@/pages/azienda/Warehouse"));
const CompanyCosts = lazy(() => import("@/pages/azienda/CompanyCosts"));
const Calendar = lazy(() => import("@/pages/azienda/Calendar"));
const Tasks = lazy(() => import("@/pages/azienda/Tasks"));
const GlobalErrors = lazy(() => import("@/pages/azienda/GlobalErrors"));
const MessagingBeta = lazy(() => import("@/pages/azienda/MessagingBeta"));
const Automations = lazy(() => import("@/pages/azienda/Automations"));
const InternalAutomations = lazy(() => import("@/pages/azienda/InternalAutomations"));
const InternalChat = lazy(() => import("@/pages/azienda/InternalChat"));
const Tesoreria = lazy(() => import("@/pages/azienda/Tesoreria"));
const InvoicesList = lazy(() => import("@/pages/azienda/billing/InvoicesList"));
const InvoiceDetail = lazy(() => import("@/pages/azienda/billing/InvoiceDetail"));
const Scadenzario = lazy(() => import("@/pages/azienda/billing/Scadenzario"));
const PrimaNota = lazy(() => import("@/pages/azienda/PrimaNota"));
const PurchaseOrdersList = lazy(() => import("@/pages/azienda/PurchaseOrdersList"));
const PurchaseOrderDetail = lazy(() => import("@/pages/azienda/PurchaseOrderDetail"));
const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const TicketDetail = lazy(() => import("@/pages/azienda/TicketDetail"));
const CreateCompanyTicket = lazy(() => import("@/pages/azienda/CreateCompanyTicket"));

// Marketing
const MarketingDashboard = lazy(() => import("@/pages/azienda/marketing/MarketingDashboard"));
const MarketingContacts = lazy(() => import("@/pages/azienda/marketing/MarketingContacts"));
const MarketingOpportunities = lazy(() => import("@/pages/azienda/marketing/MarketingOpportunities"));
const MarketingCalendar = lazy(() => import("@/pages/azienda/marketing/MarketingCalendar"));
const MarketingAutomations = lazy(() => import("@/pages/azienda/marketing/MarketingAutomations"));
const MarketingAutomationBuilder = lazy(() => import("@/pages/azienda/marketing/MarketingAutomationBuilder"));
const AIAgentsModule = lazy(() => import("@/modules/ai-agents"));
const InternalAIAgentsModule = lazy(() => import("@/modules/ai-agents-internal"));
const MarketingContactDetail = lazy(() => import("@/pages/azienda/marketing/MarketingContactDetail"));
const MarketingTasks = lazy(() => import("@/pages/azienda/marketing/MarketingTasks"));
const EmailMarketing = lazy(() => import("@/pages/azienda/marketing/EmailMarketing"));
const CampaignEditor = lazy(() => import("@/pages/azienda/marketing/CampaignEditor"));
const CampaignSendSettings = lazy(() => import("@/pages/azienda/marketing/CampaignSendSettings"));
const DragDropEmailBuilder = lazy(() => import("@/pages/azienda/marketing/DragDropEmailBuilder"));
const MarketingWhatsApp = lazy(() => import("@/pages/azienda/marketing/MarketingWhatsApp"));
const ReportisticaPage = lazy(() => import("@/pages/azienda/ReportisticaPage"));
const SalesOSDashboard = lazy(() => import("@/pages/azienda/marketing/SalesOSDashboard"));
const FacebookFormsPage = lazy(() => import("@/pages/azienda/marketing/FacebookFormsPage"));
const Preventivi = lazy(() => import("@/pages/azienda/marketing/Preventivi"));
const QuoteBuilder = lazy(() => import("@/pages/azienda/marketing/QuoteBuilder"));
const QuoteDetail = lazy(() => import("@/pages/azienda/marketing/QuoteDetail"));

const COMPANY_ROLES = ["company_admin", "company_staff", "super_admin"] as const;

export function companyRoutes() {
  return (
    <>
      {/* Full-screen Automation Builder routes - OUTSIDE CompanyLayout */}
      <Route
        path="/azienda/marketing/automazioni/nuova"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <MarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/azienda/marketing/automazioni/:id"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <MarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Company Admin and Staff Routes */}
      <Route
        path="/azienda"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nell'area azienda">
              <CompanyLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<CompanyDashboard />} />
        <Route path="cruscotto" element={<CruscottoAziendale />} />
        <Route path="ordini" element={<OrdersList />} />
        <Route path="ordini/nuovo" element={<CreateOrder />} />
        <Route path="ordini/:id" element={<OrderDetail />} />
        <Route path="ordini/:id/modifica" element={<EditOrder />} />
        <Route path="magazzino" element={<Warehouse />} />
        <Route path="calendario" element={<Calendar />} />
        <Route path="clienti" element={<CustomersList />} />
        <Route path="clienti/nuovo" element={<CreateCustomer />} />
        <Route path="clienti/:id" element={<CompanyCustomerDetail />} />
        
        <Route path="assistenza" element={<TicketsList />} />
        <Route path="assistenza/nuovo" element={<CreateCompanyTicket />} />
        <Route path="assistenza/:id" element={<TicketDetail />} />
        <Route path="previsionale" element={<CashFlowForecast />} />
        <Route path="costi" element={<CompanyCosts />} />
        
        <Route path="attivita" element={<Tasks />} />
        <Route path="errori" element={<GlobalErrors />} />
        <Route path="messaggistica-beta" element={<MessagingBeta />} />
        <Route path="chat" element={<InternalChat />} />
        <Route path="tesoreria" element={<Tesoreria />} />
        <Route path="fatturazione" element={<InvoicesList />} />
        <Route path="fatturazione/:id" element={<InvoiceDetail />} />
        <Route path="scadenzario" element={<Scadenzario />} />
        
        <Route path="prima-nota" element={<PrimaNota />} />
        <Route path="ordini-acquisto" element={<PurchaseOrdersList />} />
        <Route path="ordini-acquisto/:odaId" element={<PurchaseOrderDetail />} />
        <Route path="automazioni" element={<InternalAutomations />} />
        <Route path="automazioni/:id" element={<InternalAutomations />} />
        <Route path="automazioni-legacy" element={<Automations />} />

        {/* Marketing Routes */}
        <Route path="marketing" element={<MarketingDashboard />} />
        <Route path="marketing/contatti" element={<MarketingContacts />} />
        <Route path="marketing/contatti/:id" element={<MarketingContactDetail />} />
        <Route path="marketing/opportunita" element={<MarketingOpportunities />} />
        <Route path="marketing/attivita" element={<MarketingTasks />} />
        <Route path="marketing/calendario" element={<MarketingCalendar />} />
        <Route path="marketing/automazioni" element={<MarketingAutomations />} />
        <Route path="marketing/agente-ai/*" element={<AIAgentsModule />} />
        <Route path="agente-interno/*" element={<InternalAIAgentsModule />} />
        <Route path="marketing/email" element={<EmailMarketing />} />
        <Route path="marketing/email/campagna/:id/editor" element={<CampaignEditor />} />
        <Route path="marketing/email/campagna/:id/builder" element={<DragDropEmailBuilder />} />
        <Route path="marketing/email/campagna/:id/impostazioni" element={<CampaignSendSettings />} />
        <Route path="marketing/whatsapp" element={<MarketingWhatsApp />} />
        <Route path="marketing/lead-forms" element={<FacebookFormsPage />} />
        <Route path="marketing/reportistica" element={<ReportisticaPage />} />
        <Route path="marketing/preventivi" element={<Preventivi />} />
        <Route path="marketing/preventivi/nuovo" element={<QuoteBuilder />} />
        <Route path="marketing/preventivi/:id" element={<QuoteDetail />} />
        <Route path="marketing/preventivi/:id/modifica" element={<QuoteBuilder />} />
        
        <Route path="impostazioni" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profilo" replace />} />
          <Route path="profilo" element={<SettingsProfile />} />
          <Route path="catalogo" element={<SettingsCatalog />} />
          <Route path="stati-ordine" element={<SettingsOrderStatus />} />
          <Route path="fornitori" element={<SettingsSuppliers />} />
          <Route path="categorie-costi" element={<SettingsCostCategories />} />
          <Route path="automazioni-finanza" element={<SettingsFinanceAutomation />} />
          <Route path="tag" element={<SettingsTags />} />
          <Route path="campi-personalizzati" element={<SettingsCustomFields />} />
          <Route path="sequenze" element={<SettingsPipelines />} />
          <Route path="calendari" element={<SettingsMarketingCalendars />} />
          <Route path="utenti" element={<SettingsUsers />} />
          <Route path="utenti/:userId" element={<SettingsUserDetail />} />
          <Route path="venditori" element={<SettingsSalespeople />} />
          <Route path="staff" element={<SettingsStaff />} />
          <Route path="team" element={<SettingsTeams />} />
          <Route path="sicurezza" element={<SettingsSecurity />} />
          <Route path="security-dashboard" element={<SettingsSecurityDashboard />} />
          <Route path="attivita" element={<SettingsActivityLog />} />
          <Route path="integrazioni" element={<SettingsIntegrations />} />
          <Route path="crediti" element={<SettingsCredits />} />
          <Route path="api" element={<SettingsApiKeys />} />
          <Route path="privacy" element={<SettingsPrivacy />} />
          <Route path="branding" element={<SettingsBranding />} />
          <Route path="materiali-preventivi" element={<SettingsQuoteMaterials />} />
          <Route path="template-preventivi" element={<SettingsQuoteTemplates />} />
          <Route path="fatturazione" element={<SettingsBilling />} />
          <Route path="form-builder" element={<SettingsFormBuilder />} />
        </Route>
      </Route>
    </>
  );
}
