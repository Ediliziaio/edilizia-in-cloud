import { Suspense, useEffect, useRef, useState } from "react";
// Alias: tutti i lazy() delle route ritentano l'import con cache-bust se un
// deploy invalida i chunk (vedi lazyWithRetry per la diagnosi completa).
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { trackPixel } from "@/lib/meta/fbcTracker";
// Home is imported eagerly — it's the LCP page and must be in the critical JS bundle

// Extend window type for GA4 gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __EIC_GA_ENABLED?: boolean;
    __EIC_BOOT_OK__?: () => void;
  }
}

// ── Capacitor native-only bootstrap ──────────────────────────────────────────
// On web `isNative` is false → MobileBootstrap is a no-op component and the
// Capacitor-plugin imports (@capacitor/app, status-bar, keyboard…) are NEVER
// loaded, so the web bundle is unaffected.
import { isNative, isMobileAppRuntime } from "@/lib/mobile/platform";
const MobileBootstrap = isNative
  ? lazy(() => import("@/components/mobile/MobileBootstrap"))
  : (() => null) as React.FC;
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIdbPersister, shouldPersistQuerySafe } from "@/lib/queryPersister";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { usePaymentGateStore } from "@/store/paymentGateStore";
import { PaymentGateDialog } from "@/components/billing/PaymentGateDialog";
import { AnalyticsProvider } from "@/contexts/AnalyticsProvider";
import { Force2FAGuard } from "@/components/auth/Force2FAGuard";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { BillingModeProvider } from "@/contexts/BillingModeContext";
import { SubdomainRedirect } from "@/components/auth/SubdomainRedirect";
import ScrollToTop from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute, getCurrentSubdomain } from "@/hooks/useSubdomainRoute";
// Route modules
// v8.6.110/115 — Route containers lazy. Bundle iniziale -300KB+.
const AdminRoutesContainer = lazy(() => import("@/routes/adminRoutes"));
const CompanyRoutesContainer = lazy(() => import("@/routes/companyRoutes"));
const TecnicoRoutesContainer = lazy(() => import("@/routes/tecnicoRoutes"));
const CampoRoutesContainer = lazy(() => import("@/routes/campoRoutes"));
import { customerRoutes, employeeRoutes, salespersonRoutes, partnerRoutes, produttoreRoutes } from "@/routes/portalRoutes";
// 🛠️ 2026-05-22: tecnicoRoutes/campoRoutes ora caricati via lazy containers
// (TecnicoRoutesContainer/CampoRoutesContainer sopra) → rimossi gli import diretti
// che non erano più usati (lint error: 'tecnicoRoutes'/'campoRoutes' defined but never used).
import { userErrorMessage, isTransientTimeoutError } from "@/lib/userErrorMessage";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Suspense fallback — full-screen overlay (fixed inset-0 z-40) per evitare
// che il fallback "piccolo" lasci intravedere la landing/Home sottostante
// durante il bootstrap dei chunks lazy. z-40 sta sotto al FullScreenSpinner
// di SubdomainRedirect (z-50) ma sopra a qualsiasi shell di pagina parziale.
const PageLoader = () => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4_000);
    return () => window.clearTimeout(timer);
  }, []);

  const recover = () => {
    try {
      sessionStorage.removeItem("vite_preload_recovered_v2");
      sessionStorage.removeItem("_chunk_err_reload_v2");
      sessionStorage.removeItem("eic_boot_recovery_v1");
      sessionStorage.removeItem("eic_blank_recovery_v1");
      sessionStorage.removeItem("_sw_rec");
    } catch {
      // Storage non disponibile: il reload resta comunque utile.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("__recovery", Date.now().toString());
    window.location.replace(url.toString());
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
        <p className="mt-4 text-sm font-semibold text-foreground">Caricamento in corso…</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Un attimo, stiamo aprendo la pagina.
        </p>
        {slow && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">
              Il caricamento sta durando troppo. Può essere cache/chunk locale.
            </p>
            <button
              type="button"
              onClick={recover}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              Sblocca e ricarica
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Public & Auth pages
const Login = lazy(() => import("@/pages/Login"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const ClientiLogin = lazy(() => import("@/pages/ClientiLogin"));
const LavoriLogin = lazy(() => import("@/pages/LavoriLogin"));
const ReferralLogin = lazy(() => import("@/pages/ReferralLogin"));
const ProduttoreLogin = lazy(() => import("@/pages/ProduttoreLogin"));
const CommercialistaLogin = lazy(() => import("@/pages/CommercialistaLogin"));

/**
 * LoginRouter — renders the correct login page based on the current subdomain.
 * This ensures clienti.ediliziaincloud.com/login shows ClientiLogin, etc.
 */
function LoginRouter() {
  const sub = getCurrentSubdomain();
  if (sub === "admin") return <AdminLogin />;
  if (sub === "clienti") return <ClientiLogin />;
  if (sub === "lavori") return <LavoriLogin />;
  if (sub === "commercialista") return <Navigate to="/commercialista-login" replace />;
  if (sub === "referral") return <Navigate to="/referral-login" replace />;
  if (sub === "produttore") return <Navigate to="/produttore-login" replace />;
  return <Login />;
}
const NotFound = lazy(() => import("@/pages/NotFound"));
const Demo = lazy(() => import("@/pages/Demo"));
const Funzionalita = lazy(() => import("@/pages/Funzionalita"));
const ChiSiamo = lazy(() => import("@/pages/ChiSiamo"));
const AutoreFlorin = lazy(() => import("@/pages/AutoreFlorin"));
const Prezzi = lazy(() => import("@/pages/Prezzi"));
const OffertaCheckout = lazy(() => import("@/pages/OffertaCheckout"));
const OffertaGrazie = lazy(() => import("@/pages/OffertaGrazie"));
const DemoGrazie = lazy(() => import("@/pages/DemoGrazie"));
const Confronto = lazy(() => import("@/pages/Confronto"));
// Strumenti pubblici (calcolatori gratuiti) — hub + 4 pagine.
const Strumenti = lazy(() => import("@/pages/Strumenti"));
const CalcoloCongruita = lazy(() => import("@/pages/strumenti/CalcoloCongruita"));
const CalcoloCostoOrario = lazy(() => import("@/pages/strumenti/CalcoloCostoOrario"));
const CalcoloRitenuta = lazy(() => import("@/pages/strumenti/CalcoloRitenuta"));
const ChangePassword = lazy(() => import("@/pages/auth/ChangePassword"));
const SelezionaAzienda = lazy(() => import("@/pages/SelezionaAzienda"));
const AccettaPreventivo = lazy(() => import("@/pages/public/AccettaPreventivo"));
const NpsSurvey = lazy(() => import("@/pages/feedback/NpsSurvey"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const PublicBooking = lazy(() => import("@/pages/public/PublicBooking"));
const PublicAppointmentManage = lazy(() => import("./pages/public/PublicAppointmentManage"));
const PublicChatWidgetPage = lazy(() => import("@/pages/widget/PublicChatWidgetPage"));
const PublicReview = lazy(() => import("@/pages/public/PublicReview"));
// Sito pubblico: FAB WhatsApp al posto del widget chat AI (SiteChatWidget) —
// per il target edile WhatsApp converte meglio di una chat bot. Il widget
// chat resta disponibile per i clienti via PublicChatWidgetPage (embed).
const WhatsAppFab = lazy(() => import("@/components/landing/WhatsAppFab"));
const DynamicQrRedirect = lazy(() => import("@/pages/public/DynamicQrRedirect"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));
const SignaturePage = lazy(() => import("@/pages/public/SignaturePage"));
const FirmaOdV = lazy(() => import("@/pages/public/FirmaOdV"));
const FirmaDocumento = lazy(() => import("@/pages/public/FirmaDocumento"));
const FirmaSal = lazy(() => import("@/pages/public/FirmaSal"));
const SerramentiStimaPubblica = lazy(() => import("@/pages/public/SerramentiStimaPubblica"));
const TalentProfilePublic = lazy(() => import("@/pages/public/TalentProfilePublic"));
const CandidaturaPubblica = lazy(() => import("@/pages/public/CandidaturaPubblica"));
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
const DataDeletion = lazy(() => import("@/pages/DataDeletion"));
const MetaOAuthDone = lazy(() => import("@/pages/MetaOAuthDone"));
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
const Geometri = lazy(() => import("@/pages/per/Geometri"));
const Muratori = lazy(() => import("@/pages/per/Muratori"));
const Installatori = lazy(() => import("@/pages/per/Installatori"));
const MovimentoTerra = lazy(() => import("@/pages/per/MovimentoTerra"));
const Cartongessisti = lazy(() => import("@/pages/per/Cartongessisti"));
const CarpenteriaMetallica = lazy(() => import("@/pages/per/CarpenteriaMetallica"));
const PiccoleImprese   = lazy(() => import("@/pages/per/PiccoleImprese"));
const MedieImprese     = lazy(() => import("@/pages/per/MedieImprese"));
const GrandiImprese    = lazy(() => import("@/pages/per/GrandiImprese"));
const CommercialistaEdilizia = lazy(() => import("@/pages/per/CommercialistaEdilizia"));
const ReferralLanding  = lazy(() => import("@/pages/ReferralLanding"));
const DiventaPartner   = lazy(() => import("@/pages/DiventaPartner"));
const PianificaMigrazione = lazy(() => import("@/pages/PianificaMigrazione"));
const Novita = lazy(() => import("@/pages/Novita"));
const LandingAIImprenditoreEdile = lazy(() => import("@/app/landing/ai-imprenditore-edile/page"));
const AiEdilizia = lazy(() => import("@/app/ai-edilizia/page"));
const PartnerPayoutPreview = lazy(() => import("@/pages/partner/PartnerPayoutPreview"));
const ListinoAnteprima = lazy(() => import("@/pages/dev/ListinoAnteprima"));
const AccountantLayout = lazy(() => import("@/pages/accountant/AccountantLayout"));
const AccountantDashboard = lazy(() => import("@/pages/accountant/AccountantDashboard"));
const AccountantCompaniesList = lazy(() => import("@/pages/accountant/AccountantCompaniesList"));
const AccountantCompanyDetail = lazy(() => import("@/pages/accountant/AccountantCompanyDetail"));
const AccountantInbox = lazy(() => import("@/pages/accountant/AccountantInbox"));
const AccountantTeam = lazy(() => import("@/pages/accountant/AccountantTeam"));
const AccountantSettings = lazy(() => import("@/pages/accountant/AccountantSettings"));
const AccountantRequests = lazy(() => import("@/pages/accountant/AccountantRequests"));

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
const GestioneCommesse = lazy(() => import("@/pages/funzionalita/GestioneCommesse"));
const ContabilitaLavori = lazy(() => import("@/pages/funzionalita/ContabilitaLavori"));
const ComputoMetrico = lazy(() => import("@/pages/funzionalita/ComputoMetrico"));
const RapportiniCantiere = lazy(() => import("@/pages/funzionalita/RapportiniCantiere"));
const MezziAttrezzature = lazy(() => import("@/pages/funzionalita/MezziAttrezzature"));
const DirezioneLavori = lazy(() => import("@/pages/funzionalita/DirezioneLavori"));
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

// Strumenti pubblici (lead magnet interattivi)
const CalcolatoreMargineCommessa = lazy(() => import("@/pages/strumenti/CalcolatoreMargineCommessa"));

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
      // Timeout/abort su REFRESH di background: i dati cached restano a schermo,
      // quindi è rumore non azionabile (DB lento/cold/503, es. fetchUserData auth) —
      // non allarmiamo con un toast "Riprova". Gli errori reali (permessi, constraint,
      // rete persa) continuano a essere mostrati. Detection condivisa con userErrorMessage.
      if (query.state.data !== undefined && !silent && !isTransientTimeoutError(error)) {
        // Audit design: niente error.message tecnico all'utente. Messaggio
        // comprensibile in italiano; il dettaglio tecnico resta in Sentry sopra.
        toast.error(userErrorMessage(error, "Aggiornamento dati non riuscito. Riprova."));
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const silent = (mutation.meta as { silent?: boolean } | undefined)?.silent;
      if (silent) return;

      // Crediti finiti o carta mancante: il dialog di ricarica lo ha gia'
      // aperto il fetch del client leggendo la risposta (lib/creditoEsaurito.ts),
      // per ogni strumento e anche fuori dalle mutation. Qui basta non coprirlo
      // con il toast tecnico ne' contarlo come errore: il 402 e' sempre suo, e
      // lo e' anche l'errore arrivato subito dopo che il dialog si e' aperto
      // (il router AI risponde 500 con "Credito insufficiente", non 402).
      const httpStatus = (error as { context?: { status?: number } } | null)?.context?.status;
      const gate = usePaymentGateStore.getState();
      if (httpStatus === 402 || (gate.open && Date.now() - gate.apertoAt < 3000)) return;

      try {
        captureVelocityError("mutation", error, {
          mutationKey: mutation.options.mutationKey
            ? JSON.stringify(mutation.options.mutationKey).slice(0, 200)
            : undefined,
        });
      } catch {
        /* noop */
      }
      // Timeout/abort transitorio (backend lento/503, AbortController su warm-up di
      // background): la "Riprova" generica non aiuta e l'azione si ripete da sé; i
      // flussi utente hanno comunque il proprio onError locale. Niente falso allarme.
      if (isTransientTimeoutError(error)) return;
      toast.error(userErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      // 2026-05-27 (PWA/offline audit): gcTime esteso a 24h per le query
      // persistite su IndexedDB. Senza, dopo il restore il garbage
      // collector le butta subito perché "vecchie".
      gcTime: Math.max(DEFAULT_QUERY_GC_TIME_MS, 24 * 60 * 60 * 1000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
    },
  },
});

// 2026-05-27 (PWA/offline audit): persister IndexedDB per query critiche
// (dashboard, cantieri, clienti, appointments). Senza, F5 senza rete →
// schermata bianca. Con, l'app shell mostra l'ultimo snapshot.
const idbPersister = createIdbPersister();

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
  /^\/(app|admin|azienda|commercialista|cliente|dipendente|venditore|partner|produttore|produttore-login|tecnico|campo|portale|portale-cliente|login|admin-login|clienti-login|lavori-login|referral-login|commercialista-login|auth-callback|reset-password|cambia-password|accetta-preventivo|preventivo|offerta|firma|firma-odv|firma-fea|firma-sal|booking|prenota|appuntamento|nps|feedback|ref|talent-profile|candidatura)(\/|$)/;

const PRIVATE_APP_PREFIXES =
  /^\/(app|admin|azienda|commercialista|cliente|dipendente|venditore|partner|produttore|tecnico|campo|portale|portale-cliente|talent-profile|candidatura)(\/|$)/;

function canTrackMarketingPage(pathname: string) {
  if (typeof window === "undefined") return false;
  return (
    window.__EIC_GA_ENABLED === true &&
    MARKETING_ANALYTICS_HOSTS.has(window.location.hostname) &&
    !PRIVATE_ANALYTICS_PREFIXES.test(pathname || "/")
  );
}

// Pagine ad alto intento → evento Meta Pixel ViewContent (segmentazione Ads).
const PIXEL_VIEW_CONTENT_PAGES: Record<string, { name: string; category: string }> = {
  "/prezzi": { name: "Prezzi", category: "pricing" },
  "/funzionalita": { name: "Funzionalita", category: "product" },
  "/confronto": { name: "Confronto", category: "comparison" },
  "/casi-studio": { name: "CasiStudio", category: "social_proof" },
  "/demo": { name: "Demo", category: "lead_form" },
};

/** Tracks public marketing SPA route changes in Google Analytics 4 + Meta Pixel */
function GARouteTracker() {
  const location = useLocation();
  const firstPixelRun = useRef(true);
  useEffect(() => {
    if (!canTrackMarketingPage(location.pathname)) return;

    // GA4 page_view
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
      });
    }

    // Meta Pixel: il PageView iniziale è già emesso dallo snippet base in
    // index.html → qui lo emettiamo solo dai cambi rotta SPA successivi (skip
    // del primo run) per non contare due volte la landing.
    if (firstPixelRun.current) {
      firstPixelRun.current = false;
    } else {
      trackPixel("PageView");
    }

    // ViewContent sulle pagine ad alto intento (anche al primo caricamento).
    const vc = PIXEL_VIEW_CONTENT_PAGES[location.pathname];
    if (vc) trackPixel("ViewContent", { content_name: vc.name, content_category: vc.category });
  }, [location]);
  return null;
}

// Pagine che un CLIENTE dell'azienda apre dal link ricevuto (firma, accettazione
// preventivo): lì la bolla «Scrivici su WhatsApp» del sito EiC è fuori posto —
// il cliente parlerebbe con noi credendo di parlare con la sua impresa.
const CUSTOMER_FACING_PREFIXES = /^\/(firma|firma-fea|firma-odv|preventivo|accetta-preventivo|prenota)(\/|$)/;

function PublicSiteChatWidgetGate() {
  const { pathname } = useLocation();
  if (isNative) return null;
  if (PRIVATE_APP_PREFIXES.test(pathname || "/")) return null;
  if (CUSTOMER_FACING_PREFIXES.test(pathname || "/")) return null;
  return <WhatsAppFab />;
}

function BootGuardDismiss() {
  useEffect(() => {
    window.__EIC_BOOT_OK__?.();
    // React ha montato e committato: libera i marker di recovery nativi così un
    // prossimo avvio non parte con un flag stale (il watchdog nativo in index.html
    // usa questo flag per non andare in loop di reload).
    try {
      sessionStorage.removeItem("eic_native_boot_reload_v1");
    } catch {
      // sessionStorage non disponibile: nessuna azione necessaria.
    }
  }, []);

  return null;
}

/** v8.6.99 — Monta hook globale che forza logout dopo 45gg dal login. */
function SessionTimeoutGuard() {
  useSessionTimeout();
  return null;
}

// 2026-05-27 (PWA/offline audit): buster invalidates la cache su deploy
// nuovo per evitare di leggere snapshot di una versione UI vecchia con
// schema diverso (es. nuove colonne dopo migration).
const PERSIST_BUSTER = (import.meta as { env: Record<string, string> }).env.VITE_APP_VERSION ?? "v1";

const App = () => (
  <ErrorBoundary title="Errore critico dell'applicazione">
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: idbPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24h max snapshot age
      buster: PERSIST_BUSTER,
      dehydrateOptions: {
        // Persisti solo le query whitelisted (cantieri, clienti, dashboard
        // ecc.). Auth, search live, AI: NO.
        shouldDehydrateQuery: (q) => shouldPersistQuerySafe(q),
      },
    }}
  >
    <TooltipProvider>
     <ConfirmProvider>
      {/* mobileOffset: i toast non coprono la bottom nav mobile (h-16 + safe-area) né il composer chat */}
      <Sonner mobileOffset={{ bottom: 88 }} />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BootGuardDismiss />
        <SubdomainTitleSetter />
        <GARouteTracker />
        <ScrollToTop />
        {/* MobileBootstrap è lazy SOLO su native. Va isolato in un suo Suspense:
            se il suo chunk è lento/non risolve su WKWebView, il fallback={null}
            lascia montare il resto dell'app (auth+routes) invece di bloccare
            l'intero render → evita il "caricamento infinito" su iOS. */}
        <Suspense fallback={null}>
          <MobileBootstrap />
        </Suspense>
        <AuthProvider>
          <PaymentGateDialog />
          <AnalyticsProvider>
          <Force2FAGuard>
          <BillingModeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/demo/" replace />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/demo/grazie" element={<DemoGrazie />} />
              <Route path="/funzionalita" element={<Funzionalita />} />
              <Route path="/chi-siamo" element={<ChiSiamo />} />
              <Route path="/autore/florin-andriciuc" element={<AutoreFlorin />} />
              {/* App Store 3.1.1: la pagina prezzi pubblica (con piani+acquisto) non
                  deve essere raggiungibile nell'app mobile. Redirect alla home. */}
              <Route path="/prezzi" element={isMobileAppRuntime ? <Navigate to="/" replace /> : <Prezzi />} />
              <Route path="/confronto" element={<Confronto />} />
              <Route path="/strumenti" element={<Strumenti />} />
              <Route path="/strumenti/calcolo-congruita-manodopera" element={<CalcoloCongruita />} />
              <Route path="/strumenti/calcolo-costo-orario-operaio" element={<CalcoloCostoOrario />} />
              <Route path="/strumenti/calcolo-ritenuta-garanzia" element={<CalcoloRitenuta />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/categoria/:slug" element={<BlogCategory />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/formazione" element={<Formazione />} />
              <Route path="/casi-studio" element={<CasiStudio />} />
              <Route path="/glossario-edilizia" element={<Glossario />} />
              <Route path="/software-gestionale-edilizia" element={<CityHub />} />
              <Route path="/integrazioni" element={<Integrazioni />} />
              {/* Vecchio URL → canonical: lato server fa 301 (middleware LEGACY_REDIRECTS);
                  qui rispecchiamo il redirect anche per la navigazione client-side. */}
              <Route path="/per/imprese-costruzione" element={<Navigate to="/per/imprese-edili" replace />} />
              <Route path="/per/imprese-edili" element={<ImpreseCostuzione />} />
              <Route path="/per/impiantisti" element={<Impiantisti />} />
              <Route path="/per/ristrutturatori" element={<Ristrutturatori />} />
              <Route path="/per/fotovoltaico" element={<Fotovoltaico />} />
              <Route path="/per/serramentisti" element={<Serramentisti />} />
              <Route path="/per/geometri" element={<Geometri />} />
              <Route path="/per/muratori" element={<Muratori />} />
              <Route path="/per/installatori" element={<Installatori />} />
              <Route path="/per/movimento-terra" element={<MovimentoTerra />} />
              <Route path="/per/cartongessisti" element={<Cartongessisti />} />
              <Route path="/per/carpenteria-metallica" element={<CarpenteriaMetallica />} />
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
              <Route path="/funzionalita/gestione-commesse" element={<GestioneCommesse />} />
              <Route path="/funzionalita/contabilita-lavori" element={<ContabilitaLavori />} />
              <Route path="/funzionalita/computo-metrico" element={<ComputoMetrico />} />
              <Route path="/funzionalita/rapportini-cantiere" element={<RapportiniCantiere />} />
              <Route path="/funzionalita/mezzi-attrezzature" element={<MezziAttrezzature />} />
              <Route path="/funzionalita/direzione-lavori" element={<DirezioneLavori />} />
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

              {/* Strumenti pubblici — calcolatori interattivi (lead magnet) */}
              <Route path="/strumenti/calcolatore-margine-commessa" element={<CalcolatoreMargineCommessa />} />

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
              {/* Checkout pubblico offerte (trattativa): grazie PRIMA di :slug */}
              <Route path="/offerta/grazie" element={<OffertaGrazie />} />
              <Route path="/offerta/:slug" element={<OffertaCheckout />} />
              {/* /data-deletion: obbligatoria Meta App Review + GDPR diritto oblio */}
              <Route path="/data-deletion" element={<DataDeletion />} />
              {/* /meta-oauth-done + /oauth-done: atterraggio popup OAuth (302 dagli
                  edge: supabase.co non può servire HTML eseguibile) — postMessage + close */}
              <Route path="/meta-oauth-done" element={<MetaOAuthDone />} />
              <Route path="/oauth-done" element={<MetaOAuthDone />} />
              <Route path="/cancellazione-dati" element={<DataDeletion />} />
              <Route path="/avviso-legale" element={<AvvisoLegale />} />
              <Route path="/condizioni-utilizzo" element={<CondizioniUtilizzoSito />} />
              <Route path="/dpa" element={<DPA />} />
              <Route path="/login" element={<LoginRouter />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/clienti-login" element={<ClientiLogin />} />
              <Route path="/lavori-login" element={<LavoriLogin />} />
              <Route path="/referral-login" element={<ReferralLogin />} />
              <Route path="/produttore-login" element={<ProduttoreLogin />} />
              <Route path="/commercialista-login" element={<CommercialistaLogin />} />
              <Route path="/cambia-password" element={<ChangePassword />} />
              <Route path="/seleziona-azienda" element={<ProtectedRoute><Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}><Loader2 className="h-6 w-6 animate-spin" /></div>}><SelezionaAzienda /></Suspense></ProtectedRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/prenota/:slug" element={<PublicBooking />} />
              <Route path="/appuntamento/:token" element={<PublicAppointmentManage />} />
              {/* Widget chatbot pubblico embeddable (usato da public/embed.js dentro iframe) */}
              <Route path="/widget" element={<PublicChatWidgetPage />} />
              <Route path="/qr/:token" element={<DynamicQrRedirect />} />
              <Route path="/offerta/:token" element={<QuoteSignPage />} />
              <Route path="/firma/:token" element={<SignaturePage />} />
              <Route path="/firma-odv/:token" element={<FirmaOdV />} />
              <Route path="/firma-fea/:token" element={<FirmaDocumento />} />
              {/* Firma committente del verbale SAL: il PDF linkava già qui,
                  ma la rotta non esisteva — 404 per il cliente. */}
              <Route path="/firma-sal/:token" element={<FirmaSal />} />
              <Route path="/talent-profile/:token" element={<TalentProfilePublic />} />
              <Route path="/candidatura/:token" element={<CandidaturaPubblica />} />
              <Route path="/admin/accept-invite" element={<AcceptInvite />} />
              <Route path="/preventivo/:id" element={<AccettaPreventivo />} />
              {/* I PDF stampati e i QR fin qui puntavano a /accetta-preventivo/:id, rotta mai esistita. */}
              <Route path="/accetta-preventivo/:id" element={<AccettaPreventivo />} />
              <Route path="/feedback/nps" element={<NpsSurvey />} />
              <Route path="/review/:companyId" element={<PublicReview />} />
              {/* Microsito pubblico Serramenti (no login, token-based) */}
              <Route path="/stima/:token" element={<SerramentiStimaPubblica />} />

              {/* Referral public pages */}
              <Route path="/ref/:code" element={<ReferralLanding />} />
              <Route path="/diventa-partner" element={<DiventaPartner />} />
              <Route path="/pianifica-migrazione" element={<PianificaMigrazione />} />
              <Route path="/novita" element={<Novita />} />
              <Route path="/landing/ai-imprenditore-edile" element={<LandingAIImprenditoreEdile />} />
              <Route path="/ai-edilizia" element={<AiEdilizia />} />
              <Route
                path="/dev/partner"
                element={import.meta.env.DEV ? <PartnerPayoutPreview /> : <NotFound />}
              />
              <Route
                path="/dev/partner/:section"
                element={import.meta.env.DEV ? <PartnerPayoutPreview /> : <NotFound />}
              />
              <Route
                path="/dev/listino"
                element={import.meta.env.DEV ? <ListinoAnteprima /> : <NotFound />}
              />
              {/* Portale commercialista — layout + nested routes.
                  Ogni azienda ha la sua pagina dedicata /commercialista/aziende/:companyId. */}
              <Route
                path="/commercialista"
                element={
                  import.meta.env.DEV ? (
                    <AccountantLayout />
                  ) : (
                    <ProtectedRoute allowedRoles={["accountant", "super_admin"]}>
                      <AccountantLayout />
                    </ProtectedRoute>
                  )
                }
              >
                <Route index element={<AccountantDashboard />} />
                <Route path="aziende" element={<AccountantCompaniesList />} />
                <Route path="aziende/:companyId" element={<AccountantCompanyDetail />} />
                <Route path="inbox" element={<AccountantInbox />} />
                <Route path="richieste" element={<AccountantRequests />} />
                <Route path="team" element={<AccountantTeam />} />
                <Route path="profilo" element={<AccountantSettings />} />
              </Route>
              {/* Legacy redirect: vecchie URL /commercialista/azienda/:id */}
              <Route
                path="/commercialista/azienda/:companyId"
                element={<Navigate to="../aziende/:companyId" replace />}
              />
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
              {produttoreRoutes()}
              {/* v8.6.115 — Tecnico/Campo routes ora lazy */}
              <Route
                path="/tecnico/*"
                element={
                  <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <TecnicoRoutesContainer />
                  </Suspense>
                }
              />
              <Route
                path="/campo/*"
                element={
                  <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                    <CampoRoutesContainer />
                  </Suspense>
                }
              />

              {/* Catch-all — also handles city landing pages (React Router v7 does not match mid-segment params) */}
              <Route path="*" element={<CityOrNotFound />} />
            </Routes>
            {/* FAB WhatsApp — in basso a destra su tutte le pagine pubbliche
                (login, landing): canale diretto a minor attrito per i lead. */}
            <PublicSiteChatWidgetGate />
            {/* v8.6.91 — Install PWA prompt (Android/iOS) — disabilitato su
                richiesta utente: era invasivo e copriva i CTA sul mobile.
                Il browser stesso propone "Aggiungi a Home" dal menu condividi. */}
            {/* <InstallPWAPrompt /> */}
            {/* v8.6.99 — Auto-logout dopo 45gg dal login */}
            <SessionTimeoutGuard />
          </Suspense>
          </BillingModeProvider>
          </Force2FAGuard>
          </AnalyticsProvider>
        </AuthProvider>
      </BrowserRouter>
     </ConfirmProvider>
    </TooltipProvider>
  </PersistQueryClientProvider>
  </ErrorBoundary>
);

export default App;
