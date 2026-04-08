import { lazy, Suspense, useEffect } from "react";
// Home is imported eagerly — it's the LCP page and must be in the critical JS bundle
import Home from "@/pages/Home";

// Extend window type for GA4 gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { BillingModeProvider } from "@/contexts/BillingModeContext";
import { SubdomainRedirect } from "@/components/auth/SubdomainRedirect";
import ScrollToTop from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute, getCurrentSubdomain } from "@/hooks/useSubdomainRoute";

// Route modules
import { adminRoutes } from "@/routes/adminRoutes";
import { companyRoutes } from "@/routes/companyRoutes";
import { customerRoutes, employeeRoutes, salespersonRoutes, partnerRoutes } from "@/routes/portalRoutes";
import { tecnicoRoutes } from "@/routes/tecnicoRoutes";
import { campoRoutes } from "@/routes/campoRoutes";
import { portaleClienteRoutes } from "@/routes/portaleClienteRoutes";

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
const LavoriLogin = lazy(() => import("@/pages/LavoriLogin"));

/**
 * LoginRouter — renders the correct login page based on the current subdomain.
 * This ensures clienti.ediliziaincloud.com/login shows ClientiLogin, etc.
 */
function LoginRouter() {
  const sub = getCurrentSubdomain();
  if (sub === "admin") return <AdminLogin />;
  if (sub === "clienti") return <ClientiLogin />;
  if (sub === "lavori") return <LavoriLogin />;
  return <Login />;
}
const NotFound = lazy(() => import("@/pages/NotFound"));
const Demo = lazy(() => import("@/pages/Demo"));
const Funzionalita = lazy(() => import("@/pages/Funzionalita"));
const ChiSiamo = lazy(() => import("@/pages/ChiSiamo"));
const Prezzi = lazy(() => import("@/pages/Prezzi"));
const Confronto = lazy(() => import("@/pages/Confronto"));
const ChangePassword = lazy(() => import("@/pages/auth/ChangePassword"));
const AccettaPreventivo = lazy(() => import("@/pages/public/AccettaPreventivo"));
const NpsSurvey = lazy(() => import("@/pages/feedback/NpsSurvey"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const PublicBooking = lazy(() => import("@/pages/public/PublicBooking"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));
const SignaturePage = lazy(() => import("@/pages/public/SignaturePage"));
const FirmaOdV = lazy(() => import("@/pages/public/FirmaOdV"));
const FirmaDocumento = lazy(() => import("@/pages/public/FirmaDocumento"));
const AcceptInvite = lazy(() => import("@/pages/admin/AcceptInvite"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const BlogCategory = lazy(() => import("@/pages/BlogCategory"));
const Glossario = lazy(() => import("@/pages/Glossario"));
const CityLanding = lazy(() => import("@/pages/city/CityLanding"));
const Integrazioni = lazy(() => import("@/pages/Integrazioni"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TerminiServizio = lazy(() => import("@/pages/TerminiServizio"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const Formazione = lazy(() => import("@/pages/Formazione"));
const CasiStudio = lazy(() => import("@/pages/CasiStudio"));
const ImpreseCostuzione = lazy(() => import("@/pages/per/ImpreseCostuzione"));
const Impiantisti = lazy(() => import("@/pages/per/Impiantisti"));
const Ristrutturatori = lazy(() => import("@/pages/per/Ristrutturatori"));
const Fotovoltaico = lazy(() => import("@/pages/per/Fotovoltaico"));
const Serramentisti = lazy(() => import("@/pages/per/Serramentisti"));
const PiccoleImprese   = lazy(() => import("@/pages/per/PiccoleImprese"));
const ReferralLanding  = lazy(() => import("@/pages/ReferralLanding"));
const DiventaPartner   = lazy(() => import("@/pages/DiventaPartner"));

// Funzionalità sub-pages
const GestioneCantieri       = lazy(() => import("@/pages/funzionalita/GestioneCantieri"));
const FatturazioneElettronica = lazy(() => import("@/pages/funzionalita/FatturazioneElettronica"));
const PreventiviEdilizia     = lazy(() => import("@/pages/funzionalita/PreventiviEdilizia"));
const MarginiCantiere        = lazy(() => import("@/pages/funzionalita/MarginiCantiere"));

// Confronto sub-pages
const VsPrimus      = lazy(() => import("@/pages/confronto/VsPrimus"));
const VsEdilnet     = lazy(() => import("@/pages/confronto/VsEdilnet"));
const VsTeamSystem  = lazy(() => import("@/pages/confronto/VsTeamSystem"));
const VsExcel       = lazy(() => import("@/pages/confronto/VsExcel"));

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

/** Tracks SPA route changes in Google Analytics 4 */
function GARouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }
  }, [location]);
  return null;
}

const App = () => (
  <ErrorBoundary title="Errore critico dell'applicazione">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SubdomainTitleSetter />
        <GARouteTracker />
        <ScrollToTop />
        <AuthProvider>
          <BillingModeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/funzionalita" element={<Funzionalita />} />
              <Route path="/chi-siamo" element={<ChiSiamo />} />
              <Route path="/prezzi" element={<Prezzi />} />
              <Route path="/confronto" element={<Confronto />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/categoria/:slug" element={<BlogCategory />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/formazione" element={<Formazione />} />
              <Route path="/casi-studio" element={<CasiStudio />} />
              <Route path="/glossario-edilizia" element={<Glossario />} />
              <Route path="/software-gestionale-edilizia-:city" element={<CityLanding />} />
              <Route path="/integrazioni" element={<Integrazioni />} />
              <Route path="/per/imprese-costruzione" element={<ImpreseCostuzione />} />
              <Route path="/per/impiantisti" element={<Impiantisti />} />
              <Route path="/per/ristrutturatori" element={<Ristrutturatori />} />
              <Route path="/per/fotovoltaico" element={<Fotovoltaico />} />
              <Route path="/per/serramentisti" element={<Serramentisti />} />
              <Route path="/per/piccole-imprese" element={<PiccoleImprese />} />
              <Route path="/funzionalita/gestione-cantieri" element={<GestioneCantieri />} />
              <Route path="/funzionalita/fatturazione-elettronica" element={<FatturazioneElettronica />} />
              <Route path="/funzionalita/preventivi-edilizia" element={<PreventiviEdilizia />} />
              <Route path="/funzionalita/margini-cantiere" element={<MarginiCantiere />} />
              <Route path="/confronto/vs-primus" element={<VsPrimus />} />
              <Route path="/confronto/vs-edilnet" element={<VsEdilnet />} />
              <Route path="/confronto/vs-teamsystem" element={<VsTeamSystem />} />
              <Route path="/confronto/vs-excel" element={<VsExcel />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/termini" element={<TerminiServizio />} />
              <Route path="/cookie" element={<CookiePolicy />} />
              <Route path="/login" element={<LoginRouter />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/clienti-login" element={<ClientiLogin />} />
              <Route path="/lavori-login" element={<LavoriLogin />} />
              <Route path="/cambia-password" element={<ChangePassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/prenota/:slug" element={<PublicBooking />} />
              <Route path="/offerta/:token" element={<QuoteSignPage />} />
              <Route path="/firma/:token" element={<SignaturePage />} />
              <Route path="/firma-odv/:token" element={<FirmaOdV />} />
              <Route path="/firma-fea/:token" element={<FirmaDocumento />} />
              <Route path="/admin/accept-invite" element={<AcceptInvite />} />
              <Route path="/preventivo/:id" element={<AccettaPreventivo />} />
              <Route path="/feedback/nps" element={<NpsSurvey />} />

              {/* Referral public pages */}
              <Route path="/ref/:code" element={<ReferralLanding />} />
              <Route path="/diventa-partner" element={<DiventaPartner />} />

              {/* Root — subdomain-aware redirect */}
              <Route path="/" element={<SubdomainRedirect />} />

              {/* Domain route modules */}
              {adminRoutes()}
              {companyRoutes()}
              {customerRoutes()}
              {employeeRoutes()}
              {salespersonRoutes()}
              {partnerRoutes()}
              {tecnicoRoutes()}
              {campoRoutes()}
              {/* Portale Cliente — magic link, no auth required */}
              {portaleClienteRoutes()}

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
