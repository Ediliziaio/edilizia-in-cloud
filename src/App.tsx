import { lazy, Suspense, useEffect } from "react";
// Home is imported eagerly — it's the LCP page and must be in the critical JS bundle

// Extend window type for GA4 gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __EIC_GA_ENABLED?: boolean;
  }
}

// ── Capacitor native-only bootstrap ──────────────────────────────────────────
// On web `isNative` is false → MobileBootstrap is a no-op component and the
// Capacitor-plugin imports (@capacitor/app, status-bar, keyboard…) are NEVER
// loaded, so the web bundle is unaffected.
import { isNative } from "@/lib/mobile/platform";
const MobileBootstrap = isNative
  ? lazy(() => import("@/components/mobile/MobileBootstrap"))
  : (() => null) as React.FC;
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { AnalyticsProvider } from "@/contexts/AnalyticsProvider";
import { Force2FAGuard } from "@/components/auth/Force2FAGuard";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { BillingModeProvider } from "@/contexts/BillingModeContext";
import { SubdomainRedirect } from "@/components/auth/SubdomainRedirect";
import ScrollToTop from "@/components/ScrollToTop";
import { InstallPWAPrompt } from "@/components/ui/InstallPWAPrompt";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute, getCurrentSubdomain } from "@/hooks/useSubdomainRoute";
// Route modules
// v8.6.110 — Route containers lazy: rimossi 226+91KB di route definitions
// dal bundle iniziale. Caricati on-demand quando l'utente naviga.
const AdminRoutesContainer = lazy(() => import("@/routes/adminRoutes"));
const CompanyRoutesContainer = lazy(() => import("@/routes/companyRoutes"));
import { customerRoutes, employeeRoutes, salespersonRoutes, partnerRoutes } from "@/routes/portalRoutes";
import { tecnicoRoutes } from "@/routes/tecnicoRoutes";
import { campoRoutes } from "@/routes/campoRoutes";
import { portaleClienteRoutes } from "@/routes/portaleClienteRoutes";

// Suspense fallback — full-screen overlay (fixed inset-0 z-40) per evitare
// che il fallback "piccolo" lasci intravedere la landing/Home sottostante
// durante il bootstrap dei chunks lazy. z-40 sta sotto al FullScreenSpinner
// di SubdomainRedirect (z-50) ma sopra a qualsiasi shell di pagina parziale.
const PageLoader = () => (
  <div
    className="fixed inset-0 z-40 flex items-center justify-center bg-background"
    role="status"
    aria-live="polite"
  >
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
const PublicChatWidgetPage = lazy(() => import("@/pages/widget/PublicChatWidgetPage"));
const SiteChatWidget = lazy(() =>
  import("@/components/public-chat/SiteChatWidget").then((m) => ({ default: m.SiteChatWidget })),
);
const DynamicQrRedirect = lazy(() => import("@/pages/public/DynamicQrRedirect"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));
const SignaturePage = lazy(() => import("@/pages/public/SignaturePage"));
const FirmaOdV = lazy(() => import("@/pages/public/FirmaOdV"));
const FirmaDocumento = lazy(() => import("@/pages/public/FirmaDocumento"));
const SerramentiStimaPubblica = lazy(() => import("@/pages/public/SerramentiStimaPubblica"));
const AcceptInvite = lazy(() => import("@/pages/admin/AcceptInvite"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const BlogCategory = lazy(() => import("@/pages/BlogCategory"));
const Glossario = lazy(() => import("@/pages/Glossario"));
const CityLanding = lazy(() => import("@/pages/city/CityLanding"));
const CityHub = lazy(() => import("@/pages/city/CityHub"));
const Integrazioni = lazy(() => import("@/pages/Integrazioni"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TerminiServizio = lazy(() => import("@/pages/TerminiServizio"));
const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const AvvisoLegale = lazy(() => import("@/pages/AvvisoLegale"));
const CondizioniUtilizzoSito = lazy(() => import("@/pages/CondizioniUtilizzoSito"));
const DPA = lazy(() => import("@/pages/DPA"));
const Formazione = lazy(() => import("@/pages/Formazione"));
const CasiStudio = lazy(() => import("@/pages/CasiStudio"));
const ImpreseCostuzione = lazy(() => import("@/pages/per/ImpreseCostuzione"));
const Impiantisti = lazy(() => import("@/pages/per/Impiantisti"));
const Ristrutturatori = lazy(() => import("@/pages/per/Ristrutturatori"));
const Fotovoltaico = lazy(() => import("@/pages/per/Fotovoltaico"));
const Serramentisti = lazy(() => import("@/pages/per/Serramentisti"));
const PiccoleImprese   = lazy(() => import("@/pages/per/PiccoleImprese"));
const MedieImprese     = lazy(() => import("@/pages/per/MedieImprese"));
const GrandiImprese    = lazy(() => import("@/pages/per/GrandiImprese"));
const CommercialistaEdilizia = lazy(() => import("@/pages/per/CommercialistaEdilizia"));
const ReferralLanding  = lazy(() => import("@/pages/ReferralLanding"));
const DiventaPartner   = lazy(() => import("@/pages/DiventaPartner"));
const PianificaMigrazione = lazy(() => import("@/pages/PianificaMigrazione"));
const LandingAIImprenditoreEdile = lazy(() => import("@/app/landing/ai-imprenditore-edile/page"));
const AiEdilizia = lazy(() => import("@/app/ai-edilizia/page"));

// Funzionalità sub-pages
const GestioneCantieri       = lazy(() => import("@/pages/funzionalita/GestioneCantieri"));
const FatturazioneElettronica = lazy(() => import("@/pages/funzionalita/FatturazioneElettronica"));
const PreventiviEdilizia     = lazy(() => import("@/pages/funzionalita/PreventiviEdilizia"));
const MarginiCantiere        = lazy(() => import("@/pages/funzionalita/MarginiCantiere"));
const HrPersonale            = lazy(() => import("@/pages/funzionalita/HrPersonale"));
const GestioneSubappalti     = lazy(() => import("@/pages/funzionalita/GestioneSubappalti"));
const RenderInfissi          = lazy(() => import("@/pages/funzionalita/RenderInfissi"));
const RenderBagni            = lazy(() => import("@/pages/funzionalita/render/RenderBagni"));
const RenderTetti            = lazy(() => import("@/pages/funzionalita/render/RenderTetti"));
const RenderPavimenti        = lazy(() => import("@/pages/funzionalita/render/RenderPavimenti"));
const RenderRistrutturazioni = lazy(() => import("@/pages/funzionalita/render/RenderRistrutturazioni"));
const RenderStanza           = lazy(() => import("@/pages/funzionalita/render/RenderStanza"));
const RenderPiscine          = lazy(() => import("@/pages/funzionalita/render/RenderPiscine"));

// Funzionalità sub-pages — TIER 1 (high-impact SEO landing pages)
const CassaCantiere          = lazy(() => import("@/pages/funzionalita/CassaCantiere"));
const AgentiAi               = lazy(() => import("@/pages/funzionalita/AgentiAi"));
const PortaleClienti         = lazy(() => import("@/pages/funzionalita/PortaleClienti"));
const FirmaElettronica       = lazy(() => import("@/pages/funzionalita/FirmaElettronica"));
const WhatsappMarketing      = lazy(() => import("@/pages/funzionalita/WhatsappMarketing"));
const EmailMarketing         = lazy(() => import("@/pages/funzionalita/EmailMarketing"));
const Automazioni            = lazy(() => import("@/pages/funzionalita/Automazioni"));
const CrmEdilizia            = lazy(() => import("@/pages/funzionalita/CrmEdilizia"));
const CruscottoAziendale     = lazy(() => import("@/pages/funzionalita/CruscottoAziendale"));
const GiornaleLavori         = lazy(() => import("@/pages/funzionalita/GiornaleLavori"));
const SicurezzaCantiere      = lazy(() => import("@/pages/funzionalita/SicurezzaCantiere"));
const FotoCantiere           = lazy(() => import("@/pages/funzionalita/FotoCantiere"));

// Funzionalità sub-pages — TIER 2 (financial / fiscal / operational ops)
const CassettoSdi            = lazy(() => import("@/pages/funzionalita/CassettoSdi"));
const ConservaDigitale       = lazy(() => import("@/pages/funzionalita/ConservaDigitale"));
const Scadenzario            = lazy(() => import("@/pages/funzionalita/Scadenzario"));
const PrimaNota              = lazy(() => import("@/pages/funzionalita/PrimaNota"));
const Tesoreria              = lazy(() => import("@/pages/funzionalita/Tesoreria"));
const TimbratureGps          = lazy(() => import("@/pages/funzionalita/TimbratureGps"));
const OrdiniAcquisto         = lazy(() => import("@/pages/funzionalita/OrdiniAcquisto"));
const MagazzinoCantiere      = lazy(() => import("@/pages/funzionalita/MagazzinoCantiere"));
const SmsMarketing           = lazy(() => import("@/pages/funzionalita/SmsMarketing"));
const PipelineVendite        = lazy(() => import("@/pages/funzionalita/PipelineVendite"));

// Funzionalità sub-pages — TIER 3 (vertical / niche / advanced)
const FotovoltaicoFunz       = lazy(() => import("@/pages/funzionalita/Fotovoltaico"));
const ManutenzioneImpianti   = lazy(() => import("@/pages/funzionalita/ManutenzioneImpianti"));
const DdtDigitali            = lazy(() => import("@/pages/funzionalita/DdtDigitali"));
const RitenuteGaranzia       = lazy(() => import("@/pages/funzionalita/RitenuteGaranzia"));
const FinanziamentiCantieri  = lazy(() => import("@/pages/funzionalita/FinanziamentiCantieri"));
const LeadFormFacebook       = lazy(() => import("@/pages/funzionalita/LeadFormFacebook"));
const QuoteBuilderAi         = lazy(() => import("@/pages/funzionalita/QuoteBuilderAi"));
const AppCantiereMobile      = lazy(() => import("@/pages/funzionalita/AppCantiereMobile"));

// Funzionalità sub-pages — TIER 4 (HR / accounting / supporting)
const CedoliniPaga           = lazy(() => import("@/pages/funzionalita/CedoliniPaga"));
const FeriePermessi          = lazy(() => import("@/pages/funzionalita/FeriePermessi"));
const TicketAssistenza       = lazy(() => import("@/pages/funzionalita/TicketAssistenza"));
const ChatInterna            = lazy(() => import("@/pages/funzionalita/ChatInterna"));
const RegistroIva            = lazy(() => import("@/pages/funzionalita/RegistroIva"));
const ContabilitaFiscale     = lazy(() => import("@/pages/funzionalita/ContabilitaFiscale"));
const CalendarioLavori       = lazy(() => import("@/pages/funzionalita/CalendarioLavori"));
const ReportFatturazione     = lazy(() => import("@/pages/funzionalita/ReportFatturazione"));

// Confronto sub-pages
const VsPrimus      = lazy(() => import("@/pages/confronto/VsPrimus"));
const VsEdilnet     = lazy(() => import("@/pages/confronto/VsEdilnet"));
const VsTeamSystem  = lazy(() => import("@/pages/confronto/VsTeamSystem"));
const VsExcel       = lazy(() => import("@/pages/confronto/VsExcel"));
const VsBuildertrend = lazy(() => import("@/pages/confronto/VsBuildertrend"));

const isNonRetriableQueryError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("aborterror") ||
    message.includes("jwt") ||
    message.includes("permission") ||
    message.includes("not authorized") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("404")
  );
};

// v8.6.101 — retry policy meno aggressiva per network glitch mobile/cantiere.
// Prima: 1 solo retry → mobile flaky network → toast errore frequente.
// Dopo: max 2 retry con backoff (gestito da react-query default = exponential).
// Errori non-retriable (auth, 4xx user-fault) sempre saltati.
const shouldRetryQuery = (failureCount: number, error: unknown) => {
  if (isNonRetriableQueryError(error)) return false;
  return failureCount < 2;
};

const DEFAULT_QUERY_STALE_TIME_MS = isNative ? 10 * 60 * 1000 : 5 * 60 * 1000;
const DEFAULT_QUERY_GC_TIME_MS = isNative ? 60 * 60 * 1000 : 30 * 60 * 1000;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Velocity — log ogni query-error in Sentry con contesto minimo ma utile.
      // Se Sentry non è attivo, captureVelocityError fa console.warn in dev (no-op in prod).
      try {
        captureVelocityError("query", error, {
          queryKey: JSON.stringify(query.queryKey).slice(0, 200),
        });
      } catch {
        /* noop — il reporter di errori non deve sollevare errori */
      }

      // Toast solo su background-refresh (avevamo già data) e solo se la query
      // non si è dichiarata silent (vedi useWeatherForecast → meta:{silent:true}).
      const silent = (query.meta as { silent?: boolean } | undefined)?.silent;
      if (query.state.data !== undefined && !silent) {
        toast.error(`Errore di aggiornamento dati: ${error.message}`);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const silent = (mutation.meta as { silent?: boolean } | undefined)?.silent;
      if (silent) return;

      try {
        captureVelocityError("mutation", error, {
          mutationKey: mutation.options.mutationKey
            ? JSON.stringify(mutation.options.mutationKey).slice(0, 200)
            : undefined,
        });
      } catch {
        /* noop */
      }
      toast.error(`Operazione non riuscita: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Performance: i refetchInterval impostati nei singoli hook non
      // girano quando il tab è in background. Risparmia batteria/banda
      // sui mobile + evita storm di refetch quando l'utente torna sulla
      // tab dopo ore. Le query in foreground continuano normalmente.
      refetchIntervalInBackground: false,
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

/**
 * CityOrNotFound — smart catch-all that handles city landing pages.
 * React Router v7 does not support params embedded mid-segment (e.g. /path-:param),
 * so city URLs (/software-gestionale-edilizia-*) fall through to the "*" catch-all.
 * This component intercepts them and renders CityLanding; otherwise renders NotFound.
 */
function CityOrNotFound() {
  const { pathname } = useLocation();
  if (/^\/software-gestionale-edilizia-.+$/.test(pathname)) {
    return <CityLanding />;
  }
  return <NotFound />;
}

const MARKETING_ANALYTICS_HOSTS = new Set(["ediliziaincloud.com", "www.ediliziaincloud.com"]);
const PRIVATE_ANALYTICS_PREFIXES =
  /^\/(app|admin|azienda|cliente|dipendente|venditore|partner|tecnico|campo|portale|portale-cliente|login|admin-login|clienti-login|lavori-login|auth-callback|reset-password|cambia-password|accetta-preventivo|preventivo|offerta|firma|firma-odv|firma-fea|booking|prenota|nps|feedback|ref)(\/|$)/;

const PRIVATE_APP_PREFIXES =
  /^\/(app|admin|azienda|cliente|dipendente|venditore|partner|tecnico|campo|portale|portale-cliente)(\/|$)/;

function canTrackMarketingPage(pathname: string) {
  if (typeof window === "undefined") return false;
  return (
    window.__EIC_GA_ENABLED === true &&
    MARKETING_ANALYTICS_HOSTS.has(window.location.hostname) &&
    !PRIVATE_ANALYTICS_PREFIXES.test(pathname || "/")
  );
}

/** Tracks public marketing SPA route changes in Google Analytics 4 */
function GARouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window.gtag !== "function" || !canTrackMarketingPage(location.pathname)) return;
    window.gtag("event", "page_view", {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
    });
  }, [location]);
  return null;
}

function PublicSiteChatWidgetGate() {
  const { pathname } = useLocation();
  if (isNative) return null;
  if (PRIVATE_APP_PREFIXES.test(pathname || "/")) return null;
  return <SiteChatWidget />;
}

/** v8.6.99 — Monta hook globale che forza logout dopo 45gg dal login. */
function SessionTimeoutGuard() {
  useSessionTimeout();
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
        <MobileBootstrap />
        <AuthProvider>
          <AnalyticsProvider>
          <Force2FAGuard>
          <BillingModeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/demo/" replace />} />
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
              <Route path="/software-gestionale-edilizia" element={<CityHub />} />
              <Route path="/integrazioni" element={<Integrazioni />} />
              <Route path="/per/imprese-costruzione" element={<ImpreseCostuzione />} />
              <Route path="/per/impiantisti" element={<Impiantisti />} />
              <Route path="/per/ristrutturatori" element={<Ristrutturatori />} />
              <Route path="/per/fotovoltaico" element={<Fotovoltaico />} />
              <Route path="/per/serramentisti" element={<Serramentisti />} />
              <Route path="/per/piccole-imprese" element={<PiccoleImprese />} />
              <Route path="/per/medie-imprese" element={<MedieImprese />} />
              <Route path="/per/grandi-imprese" element={<GrandiImprese />} />
              <Route path="/per/commercialista-edilizia" element={<CommercialistaEdilizia />} />
              <Route path="/funzionalita/gestione-cantieri" element={<GestioneCantieri />} />
              <Route path="/funzionalita/fatturazione-elettronica" element={<FatturazioneElettronica />} />
              <Route path="/funzionalita/preventivi-edilizia" element={<PreventiviEdilizia />} />
              <Route path="/funzionalita/margini-cantiere" element={<MarginiCantiere />} />
              <Route path="/funzionalita/hr-personale" element={<HrPersonale />} />
              <Route path="/funzionalita/gestione-subappalti" element={<GestioneSubappalti />} />
              <Route path="/funzionalita/render-infissi" element={<RenderInfissi />} />
              <Route path="/funzionalita/render-bagni" element={<RenderBagni />} />
              <Route path="/funzionalita/render-tetti" element={<RenderTetti />} />
              <Route path="/funzionalita/render-pavimenti" element={<RenderPavimenti />} />
              <Route path="/funzionalita/render-ristrutturazioni" element={<RenderRistrutturazioni />} />
              <Route path="/funzionalita/render-stanza" element={<RenderStanza />} />
              <Route path="/funzionalita/render-piscine" element={<RenderPiscine />} />

              {/* Funzionalità — TIER 1 (high-impact SEO landing pages) */}
              <Route path="/funzionalita/cassa-cantiere" element={<CassaCantiere />} />
              <Route path="/funzionalita/agenti-ai" element={<AgentiAi />} />
              <Route path="/funzionalita/portale-clienti" element={<PortaleClienti />} />
              <Route path="/funzionalita/firma-elettronica" element={<FirmaElettronica />} />
              <Route path="/funzionalita/whatsapp-marketing" element={<WhatsappMarketing />} />
              <Route path="/funzionalita/email-marketing" element={<EmailMarketing />} />
              <Route path="/funzionalita/automazioni" element={<Automazioni />} />
              <Route path="/funzionalita/crm-edilizia" element={<CrmEdilizia />} />
              <Route path="/funzionalita/cruscotto-aziendale" element={<CruscottoAziendale />} />
              <Route path="/funzionalita/giornale-lavori" element={<GiornaleLavori />} />
              <Route path="/funzionalita/sicurezza-cantiere" element={<SicurezzaCantiere />} />
              <Route path="/funzionalita/foto-cantiere" element={<FotoCantiere />} />

              {/* Funzionalità — TIER 2 (financial / fiscal / operational) */}
              <Route path="/funzionalita/cassetto-sdi" element={<CassettoSdi />} />
              <Route path="/funzionalita/conserva-digitale" element={<ConservaDigitale />} />
              <Route path="/funzionalita/scadenzario" element={<Scadenzario />} />
              <Route path="/funzionalita/prima-nota" element={<PrimaNota />} />
              <Route path="/funzionalita/tesoreria" element={<Tesoreria />} />
              <Route path="/funzionalita/timbrature-gps" element={<TimbratureGps />} />
              <Route path="/funzionalita/ordini-acquisto" element={<OrdiniAcquisto />} />
              <Route path="/funzionalita/magazzino-cantiere" element={<MagazzinoCantiere />} />
              <Route path="/funzionalita/sms-marketing" element={<SmsMarketing />} />
              <Route path="/funzionalita/pipeline-vendite" element={<PipelineVendite />} />

              {/* Funzionalità — TIER 3 (vertical / niche / advanced) */}
              <Route path="/funzionalita/fotovoltaico" element={<FotovoltaicoFunz />} />
              <Route path="/funzionalita/manutenzione-impianti" element={<ManutenzioneImpianti />} />
              <Route path="/funzionalita/ddt-digitali" element={<DdtDigitali />} />
              <Route path="/funzionalita/ritenute-garanzia" element={<RitenuteGaranzia />} />
              <Route path="/funzionalita/finanziamenti-cantieri" element={<FinanziamentiCantieri />} />
              <Route path="/funzionalita/lead-form-facebook" element={<LeadFormFacebook />} />
              <Route path="/funzionalita/quote-builder-ai" element={<QuoteBuilderAi />} />
              <Route path="/funzionalita/app-cantiere-mobile" element={<AppCantiereMobile />} />

              {/* Funzionalità — TIER 4 (HR / accounting / supporting) */}
              <Route path="/funzionalita/cedolini-paga" element={<CedoliniPaga />} />
              <Route path="/funzionalita/ferie-permessi" element={<FeriePermessi />} />
              <Route path="/funzionalita/ticket-assistenza" element={<TicketAssistenza />} />
              <Route path="/funzionalita/chat-interna" element={<ChatInterna />} />
              <Route path="/funzionalita/registro-iva" element={<RegistroIva />} />
              <Route path="/funzionalita/contabilita-fiscale" element={<ContabilitaFiscale />} />
              <Route path="/funzionalita/calendario-lavori" element={<CalendarioLavori />} />
              <Route path="/funzionalita/report-fatturazione" element={<ReportFatturazione />} />
              <Route path="/confronto/vs-primus" element={<VsPrimus />} />
              <Route path="/confronto/vs-edilnet" element={<VsEdilnet />} />
              <Route path="/confronto/vs-teamsystem" element={<VsTeamSystem />} />
              <Route path="/confronto/vs-excel" element={<VsExcel />} />
              <Route path="/confronto/vs-buildertrend" element={<VsBuildertrend />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/termini" element={<TerminiServizio />} />
              <Route path="/termini-e-condizioni" element={<TerminiServizio />} />
              <Route path="/cookie" element={<CookiePolicy />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/avviso-legale" element={<AvvisoLegale />} />
              <Route path="/condizioni-utilizzo" element={<CondizioniUtilizzoSito />} />
              <Route path="/dpa" element={<DPA />} />
              <Route path="/login" element={<LoginRouter />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/clienti-login" element={<ClientiLogin />} />
              <Route path="/lavori-login" element={<LavoriLogin />} />
              <Route path="/cambia-password" element={<ChangePassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/prenota/:slug" element={<PublicBooking />} />
              {/* Widget chatbot pubblico embeddable (usato da public/embed.js dentro iframe) */}
              <Route path="/widget" element={<PublicChatWidgetPage />} />
              <Route path="/qr/:token" element={<DynamicQrRedirect />} />
              <Route path="/offerta/:token" element={<QuoteSignPage />} />
              <Route path="/firma/:token" element={<SignaturePage />} />
              <Route path="/firma-odv/:token" element={<FirmaOdV />} />
              <Route path="/firma-fea/:token" element={<FirmaDocumento />} />
              <Route path="/admin/accept-invite" element={<AcceptInvite />} />
              <Route path="/preventivo/:id" element={<AccettaPreventivo />} />
              <Route path="/feedback/nps" element={<NpsSurvey />} />
              {/* Microsito pubblico Serramenti (no login, token-based) */}
              <Route path="/stima/:token" element={<SerramentiStimaPubblica />} />

              {/* Referral public pages */}
              <Route path="/ref/:code" element={<ReferralLanding />} />
              <Route path="/diventa-partner" element={<DiventaPartner />} />
              <Route path="/pianifica-migrazione" element={<PianificaMigrazione />} />
              <Route path="/landing/ai-imprenditore-edile" element={<LandingAIImprenditoreEdile />} />
              <Route path="/ai-edilizia" element={<AiEdilizia />} />

              {/* Root — subdomain-aware redirect */}
              <Route path="/" element={<SubdomainRedirect />} />

              {/* Domain route modules */}
              {/* v8.6.110 — Lazy containers: bundle iniziale -300KB. */}
              <Route
                path="/admin/*"
                element={
                  <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <AdminRoutesContainer />
                  </Suspense>
                }
              />
              <Route
                path="/azienda/*"
                element={
                  <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <CompanyRoutesContainer />
                  </Suspense>
                }
              />
              {customerRoutes()}
              {employeeRoutes()}
              {salespersonRoutes()}
              {partnerRoutes()}
              {tecnicoRoutes()}
              {campoRoutes()}
              {/* Portale Cliente — magic link, no auth required */}
              {portaleClienteRoutes()}

              {/* Catch-all — also handles city landing pages (React Router v7 does not match mid-segment params) */}
              <Route path="*" element={<CityOrNotFound />} />
            </Routes>
            {/* Public chat widget — appare in basso a destra su pagine pubbliche
                (login, landing); auto-nascosto per utenti autenticati che hanno
                già la chat Silvio interna. Usa VITE_PUBLIC_CHAT_TOKEN env var. */}
            <PublicSiteChatWidgetGate />
            {/* v8.6.91 — Install PWA prompt (Android/iOS) con snooze 7gg */}
            <InstallPWAPrompt />
            {/* v8.6.99 — Auto-logout dopo 45gg dal login */}
            <SessionTimeoutGuard />
          </Suspense>
          </BillingModeProvider>
          </Force2FAGuard>
          </AnalyticsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
