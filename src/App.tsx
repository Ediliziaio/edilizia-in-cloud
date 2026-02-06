import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";

// Layouts
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { CustomerLayout } from "@/components/layouts/CustomerLayout";

// Pages
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

// Admin Pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CompaniesList from "@/pages/admin/CompaniesList";
import CreateCompany from "@/pages/admin/CreateCompany";

// Company Pages  
import CompanyDashboard from "@/pages/azienda/CompanyDashboard";
import Settings from "@/pages/azienda/Settings";
import OrdersList from "@/pages/azienda/OrdersList";
import CreateOrder from "@/pages/azienda/CreateOrder";
import OrderDetail from "@/pages/azienda/OrderDetail";
import EditOrder from "@/pages/azienda/EditOrder";
import CustomersList from "@/pages/azienda/CustomersList";
import CreateCustomer from "@/pages/azienda/CreateCustomer";

// Customer Pages
import CustomerOrders from "@/pages/cliente/CustomerOrders";
import CustomerOrderDetail from "@/pages/cliente/CustomerOrderDetail";
import CustomerSupport from "@/pages/cliente/CustomerSupport";
import CreateTicket from "@/pages/cliente/CreateTicket";
import CustomerTicketDetail from "@/pages/cliente/CustomerTicketDetail";
import CustomerProfile from "@/pages/cliente/CustomerProfile";

// Company Ticket Pages
import TicketsList from "@/pages/azienda/TicketsList";
import TicketDetail from "@/pages/azienda/TicketDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Role-based Redirect */}
            <Route path="/" element={<RoleBasedRedirect />} />
            
            {/* Super Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["super_admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="aziende" element={<CompaniesList />} />
              <Route path="aziende/nuova" element={<CreateCompany />} />
            </Route>

            {/* Company Admin Routes */}
            <Route
              path="/azienda"
              element={
                <ProtectedRoute allowedRoles={["company_admin", "super_admin"]}>
                  <CompanyLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<CompanyDashboard />} />
              <Route path="ordini" element={<OrdersList />} />
              <Route path="ordini/nuovo" element={<CreateOrder />} />
              <Route path="ordini/:id" element={<OrderDetail />} />
              <Route path="ordini/:id/modifica" element={<EditOrder />} />
              <Route path="clienti" element={<CustomersList />} />
              <Route path="clienti/nuovo" element={<CreateCustomer />} />
              <Route path="assistenza" element={<TicketsList />} />
              <Route path="assistenza/:id" element={<TicketDetail />} />
              <Route path="previsionale" element={<div className="text-muted-foreground">Previsionale Cassa - Coming soon</div>} />
              <Route path="impostazioni" element={<Settings />} />
            </Route>

            {/* Customer Routes */}
            <Route
              path="/cliente"
              element={
                <ProtectedRoute allowedRoles={["customer"]}>
                  <CustomerLayout />
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

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
