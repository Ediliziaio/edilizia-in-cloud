import { lazy, Suspense, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { BillingModeProvider } from "@/contexts/BillingModeContext";
import { SubdomainRedirect } from "@/components/auth/SubdomainRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute, getCurrentSubdomain } from "@/hooks/useSubdomainRoute";

// Route modules
import { adminRoutes } from "@/routes/adminRoutes";
import { companyRoutes } from "@/routes/companyRoutes";
import { customerRoutes, employeeRoutes, salespersonRoutes, partnerRoutes } from "@/routes/portalRoutes";

// Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// Public & Auth pages
const Login = lazy(() => import("@/pages/Login"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const ClientiLogin = lazy(() => import("@/pages/ClientiLogin"));

/**
 * LoginRouter — renders the correct login page based on the current subdomain.
 * This ensures clienti.ediliziaincloud.com/login shows ClientiLogin, etc.
 */
function LoginRouter() {
  const sub = getCurrentSubdomain();
  if (sub === "admin") return <AdminLogin />;
  if (sub === "clienti") return <ClientiLogin />;
  return <Login />;
}
const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("@/pages/Home"));
const ChangePassword = lazy(() => import("@/pages/auth/ChangePassword"));
const AccettaPreventivo = lazy(() => import("@/pages/public/AccettaPreventivo"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const PublicBooking = lazy(() => import("@/pages/public/PublicBooking"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));
const SignaturePage = lazy(() => import("@/pages/public/SignaturePage"));
const FirmaOdV = lazy(() => import("@/pages/public/FirmaOdV"));
const AcceptInvite = lazy(() => import("@/pages/admin/AcceptInvite"));

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
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Sets the document title based on the current subdomain */
function SubdomainTitleSetter() {
  const { title } = useSubdomainRoute();
  useEffect(() => {
    // Only set if not already overridden by domain branding
    if (!document.title || document.title === "Vite App" || document.title === "Edilizia in Cloud") {
      document.title = title;
    }
  }, [title]);
  return null;
}

const App = () => (
  <ErrorBoundary title="Errore critico dell'applicazione">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SubdomainTitleSetter />
        <AuthProvider>
          <BillingModeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/home" element={<Home />} />
              <Route path="/login" element={<LoginRouter />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/clienti-login" element={<ClientiLogin />} />
              <Route path="/cambia-password" element={<ChangePassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/prenota/:slug" element={<PublicBooking />} />
              <Route path="/offerta/:token" element={<QuoteSignPage />} />
              <Route path="/firma/:token" element={<SignaturePage />} />
              <Route path="/firma-odv/:token" element={<FirmaOdV />} />
              <Route path="/admin/accept-invite" element={<AcceptInvite />} />
              <Route path="/preventivo/:id" element={<AccettaPreventivo />} />

              {/* Root — subdomain-aware redirect */}
              <Route path="/" element={<SubdomainRedirect />} />

              {/* Domain route modules */}
              {adminRoutes()}
              {companyRoutes()}
              {customerRoutes()}
              {employeeRoutes()}
              {salespersonRoutes()}
              {partnerRoutes()}

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </BillingModeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
