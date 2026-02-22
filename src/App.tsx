import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";

// Layouts
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";
import { EmployeeLayout } from "@/components/layouts/EmployeeLayout";
import { SalespersonLayout } from "@/components/layouts/SalespersonLayout";

// Pages
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";

// Admin Pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CompaniesList from "@/pages/admin/CompaniesList";
import CreateCompany from "@/pages/admin/CreateCompany";
import CompanyDetail from "@/pages/admin/CompanyDetail";
import GlobalTickets from "@/pages/admin/GlobalTickets";
import AdminSettings from "@/pages/admin/AdminSettings";
import SubscriptionPlans from "@/pages/admin/SubscriptionPlans";
import ReferralDashboard from "@/pages/admin/ReferralDashboard";
import Implementations from "@/pages/admin/Implementations";

// Company Pages  
import CompanyDashboard from "@/pages/azienda/CompanyDashboard";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import SettingsProfile from "@/pages/azienda/settings/SettingsProfile";
import SettingsCatalog from "@/pages/azienda/settings/SettingsCatalog";
import SettingsOrderStatus from "@/pages/azienda/settings/SettingsOrderStatus";
import SettingsPipelines from "@/pages/azienda/settings/SettingsPipelines";
import SettingsSuppliers from "@/pages/azienda/settings/SettingsSuppliers";
import SettingsUsers from "@/pages/azienda/settings/SettingsUsers";
import SettingsSalespeople from "@/pages/azienda/settings/SettingsSalespeople";
import SettingsStaff from "@/pages/azienda/settings/SettingsStaff";
import SettingsSecurity from "@/pages/azienda/settings/SettingsSecurity";
import SettingsActivityLog from "@/pages/azienda/settings/SettingsActivityLog";
import SettingsTags from "@/pages/azienda/settings/SettingsTags";
import SettingsCustomFields from "@/pages/azienda/settings/SettingsCustomFields";
import SettingsMarketingCalendars from "@/pages/azienda/settings/SettingsMarketingCalendars";
import OrdersList from "@/pages/azienda/OrdersList";
import CreateOrder from "@/pages/azienda/CreateOrder";
import OrderDetail from "@/pages/azienda/OrderDetail";
import EditOrder from "@/pages/azienda/EditOrder";
import CustomersList from "@/pages/azienda/CustomersList";
import CreateCustomer from "@/pages/azienda/CreateCustomer";
import CompanyCustomerDetail from "@/pages/azienda/CompanyCustomerDetail";
import CashFlowForecast from "@/pages/azienda/CashFlowForecast";
import Warehouse from "@/pages/azienda/Warehouse";
import CompanyCosts from "@/pages/azienda/CompanyCosts";
import Calendar from "@/pages/azienda/Calendar";


import Tasks from "@/pages/azienda/Tasks";
import GlobalErrors from "@/pages/azienda/GlobalErrors";
import MessagingBeta from "@/pages/azienda/MessagingBeta";
import Automations from "@/pages/azienda/Automations";

// Marketing Pages
import MarketingDashboard from "@/pages/azienda/marketing/MarketingDashboard";
import MarketingContacts from "@/pages/azienda/marketing/MarketingContacts";
import MarketingOpportunities from "@/pages/azienda/marketing/MarketingOpportunities";
import MarketingCalendar from "@/pages/azienda/marketing/MarketingCalendar";
import MarketingAutomations from "@/pages/azienda/marketing/MarketingAutomations";
import MarketingAiAgent from "@/pages/azienda/marketing/MarketingAiAgent";
import MarketingContactDetail from "@/pages/azienda/marketing/MarketingContactDetail";
import MarketingTasks from "@/pages/azienda/marketing/MarketingTasks";

// Customer Pages
import CustomerOrders from "@/pages/cliente/CustomerOrders";
import CustomerOrderDetail from "@/pages/cliente/CustomerOrderDetail";
import CustomerSupport from "@/pages/cliente/CustomerSupport";
import CreateTicket from "@/pages/cliente/CreateTicket";
import CustomerTicketDetail from "@/pages/cliente/CustomerTicketDetail";
import CustomerProfile from "@/pages/cliente/CustomerProfile";

// Employee Pages
import EmployeeDashboard from "@/pages/dipendente/EmployeeDashboard";
import TimeEntry from "@/pages/dipendente/TimeEntry";
import MyWorkLogs from "@/pages/dipendente/MyWorkLogs";
import EmployeeProfile from "@/pages/dipendente/EmployeeProfile";

// Salesperson Pages
import SalespersonDashboard from "@/pages/venditore/SalespersonDashboard";
import MyOrders from "@/pages/venditore/MyOrders";
import MyEarnings from "@/pages/venditore/MyEarnings";
import SalespersonProfile from "@/pages/venditore/SalespersonProfile";

// Company Ticket Pages
import TicketsList from "@/pages/azienda/TicketsList";
import TicketDetail from "@/pages/azienda/TicketDetail";

// Auth Pages
import ChangePassword from "@/pages/auth/ChangePassword";
import ResetPassword from "@/pages/auth/ResetPassword";

const queryClient = new QueryClient({
  // QueryCache: gestisce gli errori dei data fetch
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Mostra toast solo per errori di refresh in background
      // (non per il caricamento iniziale, già gestito dai singoli componenti)
      if (query.state.data !== undefined) {
        toast.error(`Errore di aggiornamento dati: ${error.message}`);
      }
    },
  }),
  // MutationCache: gestisce gli errori delle operazioni di scrittura
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(`Operazione non riuscita: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,                        // Un solo retry automatico prima di mostrare errore
      staleTime: 2 * 60 * 1000,        // Dati considerati freschi per 2 minuti
      refetchOnWindowFocus: false,     // Evita refetch ogni volta che l'utente cambia tab
    },
  },
});

const App = () => (
  <ErrorBoundary title="Errore critico dell'applicazione">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/home" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cambia-password" element={<ChangePassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
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
              <Route path="impostazioni" element={<AdminSettings />} />
              <Route path="piani" element={<SubscriptionPlans />} />
              <Route path="referral" element={<ReferralDashboard />} />
              <Route path="implementazioni" element={<Implementations />} />
            </Route>

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
              <Route path="assistenza/:id" element={<TicketDetail />} />
              <Route path="previsionale" element={<CashFlowForecast />} />
              <Route path="costi" element={<CompanyCosts />} />
              
              <Route path="attivita" element={<Tasks />} />
              <Route path="errori" element={<GlobalErrors />} />
              <Route path="messaggistica-beta" element={<MessagingBeta />} />
              <Route path="automazioni" element={<Automations />} />

              {/* Marketing Routes */}
              <Route path="marketing" element={<MarketingDashboard />} />
              <Route path="marketing/contatti" element={<MarketingContacts />} />
              <Route path="marketing/contatti/:id" element={<MarketingContactDetail />} />
              <Route path="marketing/opportunita" element={<MarketingOpportunities />} />
              <Route path="marketing/attivita" element={<MarketingTasks />} />
              <Route path="marketing/calendario" element={<MarketingCalendar />} />
              <Route path="marketing/automazioni" element={<MarketingAutomations />} />
              <Route path="marketing/agente-ai" element={<MarketingAiAgent />} />
              
              <Route path="impostazioni" element={<SettingsLayout />}>
                <Route index element={<Navigate to="profilo" replace />} />
                <Route path="profilo" element={<SettingsProfile />} />
                <Route path="catalogo" element={<SettingsCatalog />} />
                <Route path="stati-ordine" element={<SettingsOrderStatus />} />
                <Route path="fornitori" element={<SettingsSuppliers />} />
                <Route path="tag" element={<SettingsTags />} />
                <Route path="campi-personalizzati" element={<SettingsCustomFields />} />
                <Route path="sequenze" element={<SettingsPipelines />} />
                <Route path="calendari" element={<SettingsMarketingCalendars />} />
                <Route path="utenti" element={<SettingsUsers />} />
                <Route path="venditori" element={<SettingsSalespeople />} />
                <Route path="staff" element={<SettingsStaff />} />
                <Route path="sicurezza" element={<SettingsSecurity />} />
                <Route path="attivita" element={<SettingsActivityLog />} />
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

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
