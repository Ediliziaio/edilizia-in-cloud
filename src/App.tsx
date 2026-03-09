import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Layouts (keep static - they wrap all routes)
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
import { EmployeeLayout } from "@/components/layouts/EmployeeLayout";
import { SalespersonLayout } from "@/components/layouts/SalespersonLayout";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { PartnerLayout } from "@/components/layouts/PartnerLayout";

// Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// --- Lazy Pages ---
const Login = lazy(() => import("@/pages/Login"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("@/pages/Home"));

// Admin
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

// Company
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
const SettingsCredits = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));
const SettingsQuoteMaterials = lazy(() => import("@/pages/azienda/settings/SettingsQuoteMaterials"));
const SettingsQuoteTemplates = lazy(() => import("@/pages/azienda/settings/SettingsQuoteTemplates"));
const SettingsApiKeys = lazy(() => import("@/pages/azienda/settings/SettingsApiKeys"));
const SettingsPrivacy = lazy(() => import("@/pages/azienda/settings/SettingsPrivacy"));
const SettingsBranding = lazy(() => import("@/pages/azienda/settings/SettingsBranding"));
const SettingsBilling = lazy(() => import("@/pages/azienda/settings/SettingsBilling"));
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
const InvoiceEditor = lazy(() => import("@/pages/azienda/billing/InvoiceEditor"));
const Scadenzario = lazy(() => import("@/pages/azienda/billing/Scadenzario"));
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
const FacebookFormsPage = lazy(() => import("@/pages/azienda/marketing/FacebookFormsPage"));
const Preventivi = lazy(() => import("@/pages/azienda/marketing/Preventivi"));
const QuoteBuilder = lazy(() => import("@/pages/azienda/marketing/QuoteBuilder"));
const QuoteDetail = lazy(() => import("@/pages/azienda/marketing/QuoteDetail"));
const PublicBooking = lazy(() => import("@/pages/public/PublicBooking"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));

// Customer
const CustomerOrders = lazy(() => import("@/pages/cliente/CustomerOrders"));
const CustomerOrderDetail = lazy(() => import("@/pages/cliente/CustomerOrderDetail"));
const CustomerSupport = lazy(() => import("@/pages/cliente/CustomerSupport"));
const CreateTicket = lazy(() => import("@/pages/cliente/CreateTicket"));
const CustomerTicketDetail = lazy(() => import("@/pages/cliente/CustomerTicketDetail"));
const CustomerProfile = lazy(() => import("@/pages/cliente/CustomerProfile"));

// Employee
const EmployeeDashboard = lazy(() => import("@/pages/dipendente/EmployeeDashboard"));
const TimeEntry = lazy(() => import("@/pages/dipendente/TimeEntry"));
const MyWorkLogs = lazy(() => import("@/pages/dipendente/MyWorkLogs"));
const EmployeeProfile = lazy(() => import("@/pages/dipendente/EmployeeProfile"));

// Salesperson
const SalespersonDashboard = lazy(() => import("@/pages/venditore/SalespersonDashboard"));
const MyOrders = lazy(() => import("@/pages/venditore/MyOrders"));
const MyEarnings = lazy(() => import("@/pages/venditore/MyEarnings"));
const SalespersonProfile = lazy(() => import("@/pages/venditore/SalespersonProfile"));

// Partner
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerLink = lazy(() => import("@/pages/partner/PartnerLink"));
const PartnerCommissions = lazy(() => import("@/pages/partner/PartnerCommissions"));
const PartnerPayout = lazy(() => import("@/pages/partner/PartnerPayout"));
const PartnerMaterials = lazy(() => import("@/pages/partner/PartnerMaterials"));
const PartnerProfile = lazy(() => import("@/pages/partner/PartnerProfile"));

// Auth
const ChangePassword = lazy(() => import("@/pages/auth/ChangePassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) {
        toast.error(`Errore di aggiornamento dati: ${error.message}`);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(`Operazione non riuscita: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary title="Errore critico dell'applicazione">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/home" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/cambia-password" element={<ChangePassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/prenota/:slug" element={<PublicBooking />} />
              <Route path="/offerta/:token" element={<QuoteSignPage />} />
              
              {/* Role-based Redirect */}
              <Route path="/" element={<RoleBasedRedirect />} />
              
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
              </Route>

              {/* Full-screen Automation Builder routes - OUTSIDE CompanyLayout */}
              <Route
                path="/azienda/marketing/automazioni/nuova"
                element={
                  <ProtectedRoute allowedRoles={["company_admin", "company_staff", "super_admin"]}>
                    <ErrorBoundary title="Errore nel builder automazioni">
                      <MarketingAutomationBuilder />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/azienda/marketing/automazioni/:id"
                element={
                  <ProtectedRoute allowedRoles={["company_admin", "company_staff", "super_admin"]}>
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
                  <ProtectedRoute allowedRoles={["company_admin", "company_staff", "super_admin"]}>
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
                <Route path="fatturazione/nuova" element={<InvoiceEditor />} />
                <Route path="fatturazione/:id" element={<InvoiceEditor />} />
                <Route path="scadenzario" element={<Scadenzario />} />
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
                </Route>
              </Route>

              {/* Customer Routes */}
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
                <Route path="assistenza" element={<CustomerSupport />} />
                <Route path="assistenza/nuovo" element={<CreateTicket />} />
                <Route path="assistenza/:id" element={<CustomerTicketDetail />} />
                <Route path="profilo" element={<CustomerProfile />} />
              </Route>

              {/* Employee Routes */}
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
              </Route>

              {/* Salesperson Routes */}
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

              {/* Partner Routes */}
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

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
