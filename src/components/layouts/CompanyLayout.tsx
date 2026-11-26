import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { useSidebarOpenArea } from "@/hooks/useSidebarOpenArea";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { CompanyPageOutlet } from "./CompanyPageOutlet";
import { RichiestaPushNativa } from "@/components/notifications/RichiestaPushNativa";
import { DelegatedCompanyContent } from "@/components/accountant/DelegatedCompanyContent";
import { SoftphoneProvider } from "@/components/telephony/SoftphoneProvider";
import { navigateToSubdomain } from "@/utils/subdomainNav";
// Apple Guideline 3.1.1 — su iOS nativo nascondiamo voci che linkano a checkout Stripe
import { isIOS as isIOSNativePlatform } from "@/lib/mobile/platform";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { rottaDelGuscio } from "@/components/preventivatore/rotte";
import { useAuth } from "@/contexts/AuthContext";
import { etichettaRuoloAzienda, puoScegliereSettore } from "@/lib/auth/ruoloAzienda";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { isConfirmedModulePreview } from "@/lib/sidebarPreview";
import { useSchedeManodopera } from "@/hooks/useSchedeManodopera";
import { useBranding } from "@/hooks/useBranding";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { applyBrandTheme, clearBrandTheme } from "@/lib/brandTheme";
import { applyBrandFavicon } from "@/lib/brandFavicon";
import { useCustomCSS } from "@/hooks/useCustomCSS";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { SchedaPassaggioChiamata } from "@/components/telephony/SchedaPassaggioChiamata";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { useImpersonationClientView, setImpersonationClientView } from "@/hooks/useImpersonationView";
import { AvvisoAziendaServer } from "@/components/layouts/AvvisoAziendaServer";
import { 
  HeadphonesIcon,
  Settings,
  LogOut,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Shield,
  FileStack,
  Search,
  ClipboardList,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import ediliziaLogoSmall from "@/assets/edilizia-in-cloud-logo-small.webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CompanyContextSwitcher } from "@/components/layouts/CompanyContextSwitcher";
import { AreaSwitcher } from "@/components/layouts/AreaSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { buildSettingsGroups, type SettingsNavGroup } from "@/lib/impostazioni/navigazioneImpostazioni";
import { filtraGruppiDelMenu } from "@/lib/impostazioni/indiceImpostazioni";
import { useVociImpostazioni } from "@/hooks/useVociImpostazioni";
import { useIsMobile } from "@/hooks/use-mobile";
import { Suspense, useMemo, useState, useEffect, useRef, useCallback, memo } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useUnreadSupportCount } from "@/hooks/useUnreadSupportCount";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { ViewAsDropdown } from "@/components/admin/ViewAsDropdown";
import { SuperAdminCompanySwitcher } from "@/components/admin/SuperAdminCompanySwitcher";
import { AnnouncementBanner } from "@/components/company/AnnouncementBanner";

import { SilvioBellPopover } from "@/components/silvio/SilvioBellPopover";
import { MobileChatTeamButton } from "@/components/layouts/MobileChatTeamButton";
import { MobileBrandSwitcher } from "@/components/layouts/MobileBrandSwitcher";
// MP-AIE-03: badge realtime con conteggio proposte azione AI pending
import { ActionProposalsBadge } from "@/components/ai/ActionProposals/ActionProposalsBadge";
import { ChangelogDrawer } from "@/components/changelog/ChangelogDrawer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGarePilot } from "@/modules/gare-appalti/useGarePilot";
import { macroAreas, type NavItem, type MacroArea } from "@/lib/sidebarConfig";
import { getSmartCruscottoPath } from "@/lib/dashboardRouting";
import { canAccessMediaLibrary } from "@/lib/mediaLibrary";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { NotificationsBellPopover } from "@/components/notifications/NotificationsBellPopover";
// 2026-05-27 (perf fix): subscription realtime montata 1x qui invece che
// dentro useNotifications() che era chiamato in 3 componenti diversi.
import { NotificationsRealtime } from "@/hooks/useNotifications";
import { useMyTaskCount } from "@/hooks/useMyTaskCount";
import { useUnreadEmailCount } from "@/hooks/useUnreadEmailCount";
import { useInternalChatUnreadTotal } from "@/hooks/useInternalChatUnreadTotal";
import { useConversazioniNonLette } from "@/hooks/useConversazioniNonLette";

import { TimbraHeaderButton } from "@/components/layouts/TimbraHeaderButton";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PWAInstallBanner } from "@/components/ui/PWAInstallBanner";
import { useAuditAccountantPageView } from "@/hooks/accountant/useAccountantAudit";
import { useAccountantRevocationWatch } from "@/hooks/accountant/useAccountantRevocationWatch";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";
import { accountingHome, isCompanyPathAvailable } from "@/lib/companyManagementMode";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Voci del menu laterale (25/11/2026): righe da 28px, testo 11,5px, icone 14px, per
 *  far stare più voci senza scorrere. Passata al SidebarMenuButton, che la fonde con
 *  tailwind-merge sopra h-8/text-sm/size-4 di base: sul NavLink figlio non basterebbe,
 *  perché lo Slot concatena le classi e h-8 resterebbe. */
const VOCE_MENU_COMPATTA = "h-7 text-[11.5px] [&>svg]:size-3.5";

const SupportChatSheet = lazyWithRetry(() => import("./SupportChatSheet"));
const SupportChannelDialog = lazyWithRetry(() => import("./SupportChannelDialog"));
const CommandPalette = lazyWithRetry(() => import("@/components/CommandPalette"));
const NpsModal = lazyWithRetry(() => import("@/components/onboarding/NpsModal"));
const SilvioFAB = lazyWithRetry(() => import("@/components/silvio/SilvioFAB"));

function AperturaPannello() {
  const t = useT();
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto w-fit rounded-lg border bg-background px-4 py-2 text-sm shadow">
      {t("Apertura in corso…")}
    </div>
  );
}

/** Attiva i servizi accessori dopo il primo contenuto della pagina e il suo effetto di lettura. */
function DopoPrimaPagina({ onReady }: { onReady: () => void }): null {
  useEffect(() => {
    if (window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(onReady, { timeout: 1_200 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(onReady, 700);
    return () => window.clearTimeout(timer);
  }, [onReady]);
  return null;
}

function AssistenteAzienda({ mostraPulsante }: { mostraPulsante: boolean }) {
  const t = useT();
  const [pulsanteCaricato, setPulsanteCaricato] = useState(false);
  const [richiestaChat, setRichiestaChat] = useState<{ draft?: string } | null>(null);
  useEffect(() => {
    if (mostraPulsante) setPulsanteCaricato(true);
  }, [mostraPulsante]);
  useEffect(() => {
    const apri = (evento: Event) => {
      const dettaglio = (evento as CustomEvent<{ draft?: string }>).detail;
      setRichiestaChat({ draft: dettaglio?.draft });
    };
    window.addEventListener("silvio:open-chat", apri);
    return () => window.removeEventListener("silvio:open-chat", apri);
  }, []);

  if (!pulsanteCaricato && !richiestaChat) return null;
  return (
    <ErrorBoundary title={t("Silvio non è al momento disponibile")}>
      <Suspense fallback={richiestaChat ? <AperturaPannello /> : null}>
        <SilvioFAB richiestaChat={richiestaChat} />
      </Suspense>
    </ErrorBoundary>
  );
}

const CompanyBrandHeader = memo(function CompanyBrandHeader({
  isCollapsed,
  logoUrl,
  platformName,
  homeTo = COMPANY_APP_HOME,
}: {
  isCollapsed: boolean;
  logoUrl?: string | null;
  platformName?: string | null;
  homeTo?: string;
}) {
  const t = useT();
  const logoSrc = logoUrl ?? (isCollapsed ? ediliziaLogoSmall : ediliziaLogo);
  const logoAlt = logoUrl ? (platformName ?? t("Logo piattaforma")) : "EdiliziaInCloud";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={homeTo}
          className={cn(
            "flex min-w-0 items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60",
            isCollapsed ? "h-11 w-11 justify-center p-1.5" : "h-10 w-full justify-start px-1",
          )}
          aria-label={platformName ?? "EdiliziaInCloud"}
        >
          <img
            src={logoSrc}
            alt={logoAlt}
            className={cn(
              "object-contain",
              isCollapsed ? "max-h-8 max-w-8" : "h-9 max-w-[190px]",
            )}
          />
        </Link>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right">
          {platformName ?? "EdiliziaInCloud"}
        </TooltipContent>
      )}
    </Tooltip>
  );
});

const ImpersonationBanner = memo(function ImpersonationBanner() {
  const { isImpersonating, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  if (!isImpersonating) return null;

  const handleExit = async () => {
    await exitImpersonation();
    // 10/09/2026 — qui c'era un logout "locale" su app.*, per non toccare la
    // sessione del pannello admin. Con la sessione in un cookie di dominio
    // (authStorage) la sessione e' UNA SOLA: quel logout butterebbe fuori anche
    // l'admin. E finche' erano separate, era il motivo per cui il giorno dopo
    // app.* chiedeva di nuovo l'accesso. Uscire da un'azienda e' un cambio di
    // contesto, non un cambio di identita': la sessione resta.
    navigateToSubdomain("/admin/aziende", "admin", navigate);
  };

  return (
    // Barra fissa (sticky, sopra il main-scroller → resta sempre in alto): il
    // super admin salta tra aziende senza scrollare. Lo SWITCHER ⇅ è l'elemento
    // primario a sinistra — mostra l'azienda corrente E permette di cambiarla in
    // 1 tap (dinamico), quindi niente più nome duplicato accanto.
    <div className="sticky top-0 z-50 bg-warning text-warning-foreground px-3 py-2 flex items-center justify-between gap-2 shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="hidden shrink-0 text-sm font-medium sm:inline">{t("Stai visualizzando:")}</span>
        <SuperAdminCompanySwitcher />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ImpersonationViewToggle />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExit}
        >
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t("Torna a Admin")}</span>
        </Button>
      </div>
    </div>
  );
});

// Toggle "Vista cliente / Vista completa" nel banner impersonation.
// Vista cliente (default) = piano+feature applicati come per il cliente vero;
// Vista completa = bypass super admin (supporto dentro piani parziali).
const ImpersonationViewToggle = memo(function ImpersonationViewToggle() {
  const clientView = useImpersonationClientView();
  const t = useT();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setImpersonationClientView(!clientView)}
      title={
        clientView
          ? t("Stai vedendo ciò che vede il cliente (piano e funzioni applicati). Clicca per la vista completa super admin.")
          : t("Vista completa super admin: tutti i moduli aperti. Clicca per vedere ciò che vede il cliente.")
      }
    >
      {clientView ? <Eye className="h-4 w-4 sm:mr-2" /> : <EyeOff className="h-4 w-4 sm:mr-2" />}
      <span className="hidden sm:inline">{clientView ? t("Vista cliente") : t("Vista completa")}</span>
    </Button>
  );
});

const CommercialistaModeBanner = memo(function CommercialistaModeBanner({
  companyName,
  returnTo,
}: {
  companyName?: string | null;
  returnTo: string;
}) {
  const t = useT();
  const resolvedCompanyName = companyName ?? t("azienda selezionata");

  return (
    <div className="border-b-2 border-blue-300 bg-gradient-to-r from-blue-100 to-blue-50 px-3 py-3 text-blue-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
              {t("Modalità Commercialista — stai operando per")}
            </p>
            <p dir="auto" className="truncate text-sm font-bold text-blue-950">
              {resolvedCompanyName}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-9 shrink-0 border-blue-300 bg-white font-medium hover:bg-blue-50">
          <Link to={returnTo}>← {t("Torna allo studio")}</Link>
        </Button>
      </div>
    </div>
  );
});

// Macro-area collapsible section component
const SCOPRI_LOCKED_ROUTES = [
  "/azienda/fatturazione",
  "/azienda/documenti",
  "/azienda/tesoreria",
  "/azienda/scadenzario",
  "/azienda/previsionale",
  "/azienda/marketing",
  "/azienda/sms",
  "/azienda/personale",
  "/azienda/magazzino",
  "/azienda/giornale-lavori",
  "/azienda/subappaltatori",
  "/azienda/manodopera",
  "/azienda/sicurezza-cantiere",
  "/azienda/render",
  "/azienda/planimetrie",
  "/azienda/agenti-ai",
  "/azienda/automazioni",
];

// Aree permesse in vista commercialista: tutto tranne Marketing, Automazioni
// e Contenuti (richiesta utente — il commercialista vede ciò che serve allo
// studio per consulenza/controllo, non gli strumenti di vendita).
const COMMERCIALISTA_ALLOWED_AREA_IDS = new Set([
  "area_cruscotto",
  "area_controllo_gestione",
  "area_cantieri",
  "area_finanza",
  "area_persone",
]);

const COMMERCIALISTA_ALLOWED_URLS = new Set([
  // Cruscotto
  "/azienda",
  "/azienda/cruscotto",
  // Controllo gestione
  "/azienda/controllo-gestione",
  // Cantieri & Lavori
  "/azienda/ordini",
  "/azienda/magazzino",
  "/azienda/clienti",
  "/azienda/subappaltatori",
  // Manodopera e Mezzi: al commercialista resta la sola scheda Subappaltatori
  // (operai e mezzi sono spenti nei suoi permessi).
  "/azienda/manodopera",
  // "/azienda/firma-elettronica" rimosso — richiede ora canViewFirmaElettronica (non per il commercialista).
  "/azienda/assistenza",
  "/azienda/manutenzione",
  "/azienda/calendario",
  "/azienda/sicurezza-cantiere",
  "/azienda/giornale-lavori",
  // Finanza
  "/azienda/documenti",
  "/azienda/fatturazione",
  "/azienda/scadenzario",
  "/azienda/prima-nota",
  "/azienda/contabilita-generale",
  "/azienda/tesoreria",
  "/azienda/costi",
  "/azienda/previsionale",
  // Persone & HR
  "/azienda/personale",
  // NB: "/azienda/personale/portale" rimosso — la gestione Portale corsi richiede
  // ora canManagePortal (il commercialista esterno non deve gestirla).
]);

const COMMERCIALISTA_EXTRA_CANTIERI_ITEMS: NavItem[] = [
  {
    title: "Giornale Lavori",
    url: "/azienda/giornale-lavori",
    icon: ClipboardList,
    permissionKey: "canViewGiornaleLavori",
    featureKey: "cantieri_avanzati",
    groupLabel: "Controllo",
  },
];

function appendSearchToAziendaUrl(url: string, search: string) {
  if (!search || !url.startsWith("/azienda")) return url;
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${normalizedSearch}`;
}

// Tutti gli URL di navigazione (config statica completa), usati per la logica
// "esiste una voce più specifica?" in isActive. Va valutata CROSS-AREA, non solo
// dentro l'area corrente: es. "Portale" (/azienda/personale/portale) vive in
// "Formazione" ma è annidato sotto l'URL di "Personale & HR" (/azienda/personale).
// Senza questo, su /azienda/personale/portale si accendeva ANCHE Personale & HR.
const ALL_NAV_URLS: string[] = macroAreas.flatMap(a => a.items.map(i => i.url));

function MacroAreaCollapsible({ area, visibleItems, pathname, open, onOpenChange, isScopriPlan = false, isFeaturePreview, isModuleDemo, toHref = (url) => url }: {
  area: MacroArea;
  visibleItems: NavItem[];
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isScopriPlan?: boolean;
  /** v8.6.82 — usato per mostrare badge "Demo" sulle voci feature in preview. */
  isFeaturePreview?: (key: string) => boolean;
  /** v8.6.83 — usato per mostrare badge "Demo" sulle voci moduleKey non incluse. */
  isModuleDemo?: (moduleKey: string) => boolean;
  toHref?: (url: string) => string;
}) {
  // Helper: è una voce in modalità DEMO (l'utente la vede ma non può agire)?
  const isDemoItem = (item: NavItem): boolean => {
    // Una voce `hideWhenLocked` non fa mai da teaser DEMO: o il modulo è incluso
    // (voce piena) o la voce è già filtrata via da filterNavItems. Mai badge Demo.
    if (item.hideWhenLocked) return false;
    if (item.featureKey) {
      if (item.featureKey === "billing_external" || item.featureKey === "billing_native") return false;
      if (isFeaturePreview?.(item.featureKey)) return true;
    }
    if (item.moduleKey && isModuleDemo?.(item.moduleKey)) return true;
    return false;
  };
  const t = useT();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !(prev[label] ?? true) }));
  };

  const isGroupOpen = (label: string) => {
    if (label in openGroups) return openGroups[label];
    return true; // default open
  };
  const { state, isMobile: sidebarAPannello } = useSidebar();
  // Nel pannello a scomparsa (tablet) le voci sono sempre per esteso.
  const collapsed = state === "collapsed" && !sidebarAPannello;

  const isActive = (url: string) => {
    if (url === "/azienda") return pathname === "/azienda";
    if (url === "/azienda/marketing") return pathname === "/azienda/marketing";
    // "Fatture" è l'hub unico della fatturazione nativa: documenti, rubrica,
    // incassi, SDI e fiscalità vivono come tab interne.
    // Ma se la rotta ha una voce propria (es. /azienda/documenti/fatture-ricevute),
    // la voce propria è l'unica accesa.
    if (url === "/azienda/documenti") {
      if (pathname === url) return true;
      if (!pathname.startsWith(url + "/")) return false;
      return !ALL_NAV_URLS.some(
        otherUrl => otherUrl !== url && otherUrl.startsWith(url + "/") &&
          (pathname === otherUrl || pathname.startsWith(otherUrl + "/"))
      );
    }
    if (pathname === url) return true;
    if (pathname.startsWith(url + "/")) {
      // Cerca una voce più specifica in TUTTA la nav (cross-area), non solo in
      // questa area: altrimenti un URL-genitore in un'area (es. Personale & HR
      // /azienda/personale) si accende su una route figlia che appartiene a una
      // voce di un'altra area (es. Portale /azienda/personale/portale).
      const hasMoreSpecific = ALL_NAV_URLS.some(
        otherUrl => otherUrl !== url && otherUrl.startsWith(url + "/") &&
          (pathname === otherUrl || pathname.startsWith(otherUrl + "/"))
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  const hasActiveChild = visibleItems.some(item => isActive(item.url));
  const AreaIcon = area.icon;

  // ── Single-link mode: macroArea con 1 solo item senza groupLabel ────────
  // Renderizza come voce diretta (no collapse, no doppione visivo).
  // Fix per "Controllo di Gestione" che era nascosto dentro "Direzione & Bilancio"
  // → ora cliccando una volta apri direttamente la pagina.
  if (visibleItems.length === 1 && !visibleItems[0].groupLabel) {
    const item = visibleItems[0];
    const ItemIcon = item.icon;
    const active = isActive(item.url);

    if (collapsed) {
      return (
        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to={toHref(item.url)}
                  className={cn(
                    "flex items-center justify-center transition-colors",
                    active ? "bg-sidebar-primary/10 text-sidebar-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90",
                  )}
                  title={t(item.title)}
                >
                  <ItemIcon className="h-4 w-4" />
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      );
    }

    return (
      <SidebarGroup className="py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className={VOCE_MENU_COMPATTA}>
              <NavLink
                to={toHref(item.url)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg mx-1.5 px-3 py-1.5 text-[11.5px] transition-colors",
                  active
                    ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                )}
              >
                <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(item.title)}</span>
                {item.isBeta && (
                  <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-accent text-accent-foreground border-border">
                    BETA
                  </Badge>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  // Collapsed mode: show icon with hover flyout
  if (collapsed) {
    return (
      <SidebarGroup className="py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <HoverCard openDelay={100} closeDelay={150}>
              <HoverCardTrigger asChild>
                <SidebarMenuButton
                  className={cn(
                    "flex items-center justify-center transition-colors",
                    hasActiveChild ? "bg-sidebar-primary/10 text-sidebar-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90"
                  )}
                >
                  <AreaIcon className="h-4 w-4" />
                </SidebarMenuButton>
              </HoverCardTrigger>
              <HoverCardContent
                side="right"
                align="start"
                sideOffset={8}
                className="z-50 w-52 p-1.5 bg-sidebar border border-sidebar-border shadow-lg rounded-lg"
              >
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-normal text-sidebar-foreground/50 truncate">
                  {t(area.title)}
                </p>
                <div className="flex flex-col gap-0.5">
                  {(() => {
                    const groupedItems: Array<{ label: string | null; items: NavItem[] }> = [];
                    let currentGroup: { label: string | null; items: NavItem[] } = { label: null, items: [] };
                    for (const item of visibleItems) {
                      if (item.groupLabel && item.groupLabel !== currentGroup.label) {
                        if (currentGroup.items.length > 0) groupedItems.push(currentGroup);
                        currentGroup = { label: item.groupLabel, items: [item] };
                      } else {
                        currentGroup.items.push(item);
                      }
                    }
                    if (currentGroup.items.length > 0) groupedItems.push(currentGroup);

                    const renderItems = (items: NavItem[]) => items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isActive(item.url);
                      const isDemo = isDemoItem(item);
                      return (
                        <NavLink
                          key={item.url}
                          to={toHref(item.url)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11.5px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary",
                            isDemo && "opacity-70"
                          )}
                        >
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{t(item.title)}</span>
                          {isDemo ? (
                            <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-amber-100 text-amber-800 border-amber-300">DEMO</Badge>
                          ) : item.isBeta && (
                            <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-accent text-accent-foreground border-border">BETA</Badge>
                          )}
                        </NavLink>
                      );
                    });

                    return groupedItems.map((group, gi) => (
                      <div key={group.label ?? `g${gi}`}>
                        {group.label ? (
                          <SidebarSubcategory
                            label={group.label}
                            badge={group.items.length}
                            isOpen={isGroupOpen(group.label)}
                            onToggle={() => toggleGroup(group.label!)}
                          >
                            {renderItems(group.items)}
                          </SidebarSubcategory>
                        ) : (
                          renderItems(group.items)
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </HoverCardContent>
            </HoverCard>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  // Expanded mode: collapsible section
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <SidebarGroup className={cn(
        "py-0 rounded-lg mx-1.5 transition-colors duration-200",
        open ? "bg-sidebar-accent/50" : "hover:bg-sidebar-accent/40"
      )}>
        <CollapsibleTrigger className={cn(
          "flex w-full items-center justify-between px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide transition-all duration-150 group",
          (open || hasActiveChild)
            ? "text-sidebar-primary/80"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90"
        )}>
          <span className="flex items-center gap-2.5 min-w-0">
            <AreaIcon className={cn("h-3.5 w-3.5 shrink-0 transition-colors duration-150", (open || hasActiveChild) && "text-sidebar-primary")} />
            <span className="truncate">{t(area.title)}</span>
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-60 group-hover:opacity-100", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-visible data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {(() => {
                const groupedItems: Array<{ label: string | null; items: NavItem[] }> = [];
                let currentGroup: { label: string | null; items: NavItem[] } = { label: null, items: [] };
                for (const item of visibleItems) {
                  if (item.groupLabel && item.groupLabel !== currentGroup.label) {
                    if (currentGroup.items.length > 0) groupedItems.push(currentGroup);
                    currentGroup = { label: item.groupLabel, items: [item] };
                  } else {
                    currentGroup.items.push(item);
                  }
                }
                if (currentGroup.items.length > 0) groupedItems.push(currentGroup);

                const renderExpandedItems = (items: NavItem[]) => items.map((item) => {
                  const ItemIcon = item.icon;
                  const active = isActive(item.url);
                  const isLocked = isScopriPlan && SCOPRI_LOCKED_ROUTES.some(r => item.url.startsWith(r));
                  const isDemo = isDemoItem(item);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild className={VOCE_MENU_COMPATTA}>
                        <NavLink
                          to={toHref(item.url)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11.5px] text-sidebar-foreground/75 transition-all duration-150 hover:bg-muted hover:text-sidebar-foreground border-l-2 border-l-transparent",
                            active && "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary",
                            isLocked && "opacity-50",
                            isDemo && !active && "opacity-75"
                          )}
                        >
                          <ItemIcon className="h-3.5 w-3.5" />
                          <span>{t(item.title)}</span>
                          {isLocked ? (
                            <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                          ) : isDemo ? (
                            <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">DEMO</Badge>
                          ) : item.isBeta && (
                            <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-accent text-accent-foreground border-border">BETA</Badge>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                });

                return groupedItems.map((group, gi) => (
                  <div key={group.label ?? `g${gi}`}>
                    {group.label ? (
                      <SidebarSubcategory
                        label={group.label}
                        isOpen={isGroupOpen(group.label)}
                        onToggle={() => toggleGroup(group.label!)}
                      >
                        {renderExpandedItems(group.items)}
                      </SidebarSubcategory>
                    ) : (
                      renderExpandedItems(group.items)
                    )}
                  </div>
                ));
              })()}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function CruscottoNavItems({ filterNavItems, badgePronti }: {
  filterNavItems: (items: NavItem[]) => NavItem[];
  badgePronti: boolean;
}) {
  const items = filterNavItems(macroAreas.find(a => a.id === "area_cruscotto")?.items ?? []);
  const leggiChat = badgePronti && items.some(item => item.url === "/azienda/chat");
  const { data: taskCounts } = useMyTaskCount(badgePronti && items.some(item => item.url === "/azienda/attivita"));
  const { data: emailCounts } = useUnreadEmailCount(badgePronti && items.some(item => item.url === "/azienda/email"));
  // Due conteggi per la voce «Chat»: la chat interna del team e le conversazioni
  // esterne (WhatsApp/email/IG…). Due badge di colore diverso nella sidebar.
  const internalChatUnread = useInternalChatUnreadTotal(leggiChat);
  const conversazioniUnread = useConversazioniNonLette(leggiChat);
  const permissions = usePermissions();
  const { role } = useAuth();
  const t = useT();

  return (
    <SidebarGroup className="py-2">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isTaskItem = item.url === "/azienda/attivita";
            const isEmailItem = item.url === "/azienda/email";
            const isChatItem = item.url === "/azienda/chat";
            const itemUrl =
              item.url === "/azienda/cruscotto"
                ? (permissions.isLoading ? item.url : getSmartCruscottoPath(permissions, role))
                : item.url;

            // Badge calcolato in modo coerente con la voce: tasks o email.
            //   - Tasks: total con tono rosso se overdue, ambra se due today, altrimenti grigio.
            //   - Email: unread con tono rosso se ci sono urgent (priorità alta), altrimenti grigio.
            // Titolo tooltip arricchito per dare contesto al numero del badge.
            const badgeCount = isTaskItem
              ? (taskCounts?.total ?? 0)
              : isEmailItem
                ? (emailCounts?.unread ?? 0)
                : 0;
            const badgeVariant = isTaskItem
              ? (taskCounts?.overdue ? "destructive" : taskCounts?.dueToday ? "warning" : "secondary")
              : isEmailItem
                ? ((emailCounts?.urgent ?? 0) > 0 ? "destructive" : "secondary")
                : "secondary";
            const showBadge = (isTaskItem || isEmailItem) && badgeCount > 0;
            const voce = t(item.title);
            const tooltip = isEmailItem && emailCounts
              ? (emailCounts.urgent
                ? t("{voce} — {n} da leggere, {urgenti} urgenti", { voce, n: emailCounts.unread, urgenti: emailCounts.urgent })
                : t("{voce} — {n} da leggere", { voce, n: emailCounts.unread }))
              : isTaskItem && taskCounts && taskCounts.total > 0
                ? (taskCounts.overdue
                  ? t("{voce} — {n} attività ({scadute} scadute)", { voce, n: taskCounts.total, scadute: taskCounts.overdue })
                  : t("{voce} — {n} attività", { voce, n: taskCounts.total }))
                : voce;

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild tooltip={tooltip} className={VOCE_MENU_COMPATTA}>
                  <NavLink
                    to={itemUrl}
                    end={itemUrl === "/azienda" || itemUrl === "/azienda/marketing"}
                    className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11.5px] text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent"
                    activeClassName="bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary"
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    <span className="font-medium">{voce}</span>
                    {/* «Chat»: due badge di colore diverso, entrambi dai token del tema.
                        - Team interno → navy (secondary): identico ai conteggi di Email/Attività.
                        - Conversazioni esterne (WhatsApp/email/IG…) → verde (success): il canale coi clienti. */}
                    {isChatItem && (internalChatUnread > 0 || conversazioniUnread > 0) && (
                      <span className="ml-auto flex items-center gap-1">
                        {internalChatUnread > 0 && (
                          <Badge
                            variant="secondary"
                            className="h-[18px] min-w-[18px] px-1.5 text-[10px] font-bold"
                            title={t("{n} messaggi del team da leggere", { n: internalChatUnread })}
                          >
                            {internalChatUnread > 99 ? "99+" : internalChatUnread}
                          </Badge>
                        )}
                        {conversazioniUnread > 0 && (
                          <Badge
                            className="h-[18px] min-w-[18px] border-transparent bg-success px-1.5 text-[10px] font-bold text-success-foreground hover:bg-success/80"
                            title={t("{n} conversazioni con messaggi da leggere", { n: conversazioniUnread })}
                          >
                            {conversazioniUnread > 99 ? "99+" : conversazioniUnread}
                          </Badge>
                        )}
                      </span>
                    )}
                    {showBadge && (
                      <Badge
                        variant={badgeVariant === "destructive" ? "destructive" : "secondary"}
                        className={cn(
                          "ml-auto h-[18px] min-w-[18px] px-1.5 text-[10px] font-bold",
                          badgeVariant === "warning" && "bg-warning/15 text-warning border-warning/30"
                        )}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </Badge>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

}

/** Sidebar impostazioni: 9 gruppi + barra di ricerca fuzzy */
const SettingsSidebarContent = memo(function SettingsSidebarContent({
  isAdmin,
  permissions,
  navigate,
}: {
  isAdmin: boolean;
  permissions: Permissions;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [query, setQuery] = useState("");
  const t = useT();
  const { pathname } = useLocation();
  const { stato: piano } = useStatoPiano();
  const isMobile = useIsMobile();

  const { effectiveCompany } = useAuth();
  const managementMode = effectiveCompany?.management_mode;
  const allGroups = useMemo(
    () => buildSettingsGroups(isAdmin, permissions, piano, isMobile),
    [isAdmin, permissions, piano, isMobile]
  );

  // Il campo cerca con lo stesso indice e lo stesso motore del ⌘K delle impostazioni: «prezzo» o «iban» accendono
  // la voce del menu che contiene la funzione, non solo quelle che hanno la parola nel nome.
  const { voci } = useVociImpostazioni(query.trim() !== "");

  // Filtra gruppi per ricerca: se query vuota mostra tutto, altrimenti solo le voci che rispondono.
  const filteredGroups = useMemo<SettingsNavGroup[]>(() => {
    const visibleGroups = allGroups.map(g => ({
      ...g,
      items: g.items.filter(item => item.visible && isCompanyPathAvailable(managementMode, item.to)),
    })).filter(g => g.items.length > 0);

    return filtraGruppiDelMenu(visibleGroups, voci, query);
  }, [allGroups, query, voci, managementMode]);

  const navLinkClass =
    // 25/11/2026: stessa scala del menu principale (VOCE_MENU_COMPATTA): testo 11,5px, icone 14px.
    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11.5px] text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent [&>svg]:!h-3.5 [&>svg]:!w-3.5";
  const navLinkActive =
    "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary";

  return (
    <div className="settings-sidebar">
      {/* Bottone Torna indietro */}
      <div className="px-3 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 mb-1.5 h-7 px-2 text-xs text-muted-foreground hover:text-foreground w-full"
          // Uscendo dalle impostazioni si torna sempre ad Attività (richiesta del 25/11/2026):
          // «/azienda» portava al cruscotto o a pagine diverse secondo il ruolo.
          onClick={() => navigate("/azienda/attivita")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("Torna indietro")}
        </Button>
        <h2 className="text-base font-semibold px-2 mb-2">{t("Impostazioni")}</h2>

        {/* Barra di ricerca fuzzy */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("Cerca impostazioni…")}
            className="pl-8 h-8 text-xs bg-muted/40 border-0 focus-visible:ring-1"
            aria-label={t("Cerca nelle impostazioni")}
          />
        </div>
      </div>


      {/* Gruppi filtrati */}
      {filteredGroups.map(group => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(item => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.to}
                      className={cn(navLinkClass, item.attivoSu?.(pathname) && navLinkActive)}
                      activeClassName={navLinkActive}
                    >
                      {item.icon}
                      <span>{t(item.label)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}

      {/* Empty state ricerca */}
      {filteredGroups.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          {t("Nessun risultato per \"{testo}\"", { testo: query })}
        </div>
      )}
    </div>
  );
});

const CompanySidebar = memo(function CompanySidebar({ badgePronti }: { badgePronti: boolean }) {
  const isMobile = useIsMobile();
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation, role, userRoles, multiCompanyAccesses } = useAuth();
  const hasMultipleCompanies = (multiCompanyAccesses?.length ?? 0) > 1;
  // usePermissions è già "viewAs-aware": quando `viewAsRole` è attivo
  // restituisce i permessi REALI dell'utente target (letti da staff_permissions),
  // così la sidebar riflette esattamente quello che vedrebbe quell'utente.
  const permissions = usePermissions();
  const { schede: schedeManodopera } = useSchedeManodopera();
  const t = useT();
  // Le regole del piano (super admin, azienda demo, piano completo o limitato)
  // stanno in useStatoPiano: le stesse valgono per le impostazioni.
  const {
    isModuleEnabled,
    isScopriPlan,
    currentPlan,
    limitsLoading,
    isFeaturePreview,
    getFeatureAccessLevel,
    flagsLoading,
    isSuperAdminViewer,
    isDemoBaseline,
    isLimitedPlan,
  } = useStatoPiano();

  /** L'assenza del piano (anche dopo un errore) non conferma un'anteprima. */
  const isModuleDemo = (moduleKey: string): boolean => {
    return isConfirmedModulePreview({
      planResolved: !!currentPlan,
      loading: limitsLoading,
      limitedPlan: isLimitedPlan,
      moduleIncluded: isModuleEnabled(moduleKey as never),
      bypass: isSuperAdminViewer || isDemoBaseline,
    });
  };
  // Mostriamo skeleton finché plan + feature flags non sono risolti: con
  // `isModuleEnabled` fail-closed, altrimenti la sidebar flickererebbe a vuoto.
  const gatingLoading = limitsLoading || flagsLoading;
  const menuLoadingFallback = useLoadingTimeout(gatingLoading, 1500);
  const { branding } = useBranding();
  const { effectiveBrand } = useBrandSettings();
  const { mode: billingMode } = useBillingMode();
  const navigate = useNavigate();
  const location = useLocation();
  const commercialistaParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  // Modalità commercialista forzata se:
  //   1) URL ha ?commercialistaMode=1 (ingresso esplicito dal portale studio), OPPURE
  //   2) l'utente loggato ha role='accountant' (per sicurezza: anche se entra
  //      dal company switcher in alto, non gli mostriamo mai la UI admin completa)
  const isCommercialistaMode =
    commercialistaParams.get("commercialistaMode") === "1" || role === "accountant";
  const commercialistaCompanyId =
    commercialistaParams.get("commercialistaCompany") ?? effectiveCompany?.id ?? "";
  const commercialistaCompanyName =
    commercialistaParams.get("commercialistaCompanyName") ??
    effectiveCompany?.name ??
    "azienda selezionata";
  const commercialistaReturnTo = commercialistaParams.get("returnTo") || "/commercialista";
  const commercialistaSearch = useMemo(() => {
    if (!isCommercialistaMode) return "";
    const params = new URLSearchParams({
      commercialistaMode: "1",
      commercialistaCompany: commercialistaCompanyId,
      commercialistaCompanyName,
      returnTo: commercialistaReturnTo,
    });
    return params.toString();
  }, [commercialistaCompanyId, commercialistaCompanyName, commercialistaReturnTo, isCommercialistaMode]);
  const withCommercialistaSearch = useCallback(
    (url: string) => appendSearchToAziendaUrl(url, commercialistaSearch),
    [commercialistaSearch],
  );
  const isSettingsRoute = location.pathname.startsWith("/azienda/impostazioni");
  // Amministratore dell'azienda su cui si lavora (anche via accesso
  // multi-azienda) o super admin: lo decide usePermissions. Il ruolo grezzo
  // sbagliava in due sensi: toglieva le voci a chi è admin solo nell'azienda
  // scelta, e le dava a chi è admin nella propria ma staff in quella scelta.
  const isAdmin = permissions.isAdmin;
  const showDriveLink =
    !isCommercialistaMode &&
    (permissions.isLoading || gatingLoading || canAccessMediaLibrary(permissions));
  const isDriveRoute = location.pathname.startsWith("/azienda/contenuti-multimediali");
  const { setOpenMobile } = useSidebar();

  // Close mobile sidebar on every navigation
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  // Exclusive accordion: only one macro-area open at a time
  const findActiveAreaId = useCallback((path: string): string | null => {
    if (isCommercialistaMode && path.startsWith("/azienda/giornale-lavori")) {
      return "area_cantieri";
    }
    let bestAreaId: string | null = null;
    let bestUrlLength = 0;
    for (const area of macroAreas) {
      if (area.id === "area_cruscotto") continue;
      if (isCommercialistaMode && !COMMERCIALISTA_ALLOWED_AREA_IDS.has(area.id)) continue;
      for (const item of area.items) {
        if (path === item.url || path.startsWith(item.url + "/")) {
          if (item.url.length > bestUrlLength) {
            bestUrlLength = item.url.length;
            bestAreaId = area.id;
          }
        }
      }
    }
    return bestAreaId;
  }, [isCommercialistaMode]);

  const [openAreaId, setOpenAreaId] = useSidebarOpenArea(
    location.pathname, findActiveAreaId(location.pathname),
  );

  // Applica i colori brand al design system (--primary, --accent, sidebar)
  useEffect(() => {
    const restoreFavicon = applyBrandFavicon(effectiveBrand.isWhiteLabel ? effectiveBrand.faviconUrl : null);
    if (effectiveBrand.isWhiteLabel) {
      applyBrandTheme({
        primaryColor: effectiveBrand.primaryColor,
        accentColor: effectiveBrand.accentColor,
        textOnPrimary: effectiveBrand.textOnPrimary,
      });
      if (effectiveBrand.platformName) {
        document.title = effectiveBrand.platformName;
      }
    } else {
      clearBrandTheme();
    }
    return () => { clearBrandTheme(); restoreFavicon(); };
  }, [effectiveBrand]);
  
  const handleLogoutOrExit = useCallback(async () => {
    if (isImpersonating) {
      // Come sopra: si torna al pannello admin senza chiudere la sessione.
      await exitImpersonation();
      navigateToSubdomain("/admin/aziende", "admin", navigate);
    } else {
      signOut();
    }
  }, [isImpersonating, exitImpersonation, navigate, signOut]);

  // La partita doppia si vede solo con «Contabilità generale in casa» accesa.
  const showGarePilot = !!useGarePilot().role;
  const filterNavItems = useCallback((items: NavItem[]) => {
    const visible = items.filter(item => !item.garePilotOnly || showGarePilot);
    // v8.6.83 — Demo Mode policy:
    //   - featureKey con access_level=preview → visibile con badge DEMO
    //   - featureKey con access_level=disabled → nascosta
    //   - moduleKey non incluso + piano limited → visibile con badge DEMO
    //   - moduleKey non incluso + piano full → nascosta
    //   - billing_external/billing_native restano 1:1 al billingMode
    //   - le voci senza gate restano visibili come prima

    const passesFeatureGate = (key: string): "enabled" | "preview" | "hidden" => {
      // billing_* seguono il billingMode MA rispettano anche il flag di piano
      // (fatturazione/documenti): il Piano Marketing li spegne e la voce deve
      // sparire come la route (FeatureRoute usa gli stessi flag).
      if (key === "billing_external") {
        if (billingMode !== "external") return "hidden";
        return getFeatureAccessLevel("fatturazione") === "disabled" ? "hidden" : "enabled";
      }
      if (key === "billing_native") {
        if (billingMode !== "native") return "hidden";
        return getFeatureAccessLevel("documenti") === "disabled" ? "hidden" : "enabled";
      }
      const lvl = getFeatureAccessLevel(key);
      if (lvl === "enabled") return "enabled";
      if (lvl === "preview") return "preview";
      return "hidden";
    };

    const applyCommercialistaScope = (visibleItems: NavItem[]) => {
      const scoped = visibleItems.filter(item => isCompanyPathAvailable(effectiveCompany?.management_mode, item.url));
      if (!isCommercialistaMode) return scoped;
      return scoped.filter((item) => COMMERCIALISTA_ALLOWED_URLS.has(item.url));
    };

    if (permissions.isLoading || gatingLoading) {
      return applyCommercialistaScope(visible.filter((item) => {
        if (item.url === "/azienda/contenuti-multimediali") return true;
        if (item.demoCompanyOnly && !isDemoBaseline) return false;
        if (item.multiCompanyOnly && !hasMultipleCompanies) return false;
        if (!item.featureKey) return true;
        if (item.featureKey === "billing_external" || item.featureKey === "billing_native") {
          return passesFeatureGate(item.featureKey) !== "hidden";
        }
        return true;
      }));
    }
    return applyCommercialistaScope(visible.filter((item) => {
      if (item.url === "/azienda/contenuti-multimediali" && !canAccessMediaLibrary(permissions)) {
        return false;
      }
      if (item.demoCompanyOnly && !isDemoBaseline) return false;
      if (item.multiCompanyOnly && !hasMultipleCompanies) return false;
      // Voci con `hideWhenLocked` (es. Assistenza, moduleKey "tickets"): quando
      // il modulo NON è incluso nel piano, la voce si nasconde del tutto — niente
      // teaser DEMO — su qualunque piano con un piano risolto (limited O full),
      // ma resta sulla vetrina Demo Azienda. Deve stare PRIMA delle regole
      // speciali qui sotto (/azienda/assistenza esce col solo permesso e
      // salterebbe il module gate). Il bypass super-admin passa: isModuleEnabled
      // ritorna true e la condizione non entra. Senza piano risolto → fail-open
      // come il module gate più sotto (non nascondiamo al buio).
      if (
        item.hideWhenLocked &&
        item.moduleKey &&
        !isModuleEnabled(item.moduleKey) &&
        !isDemoBaseline &&
        !limitsLoading &&
        currentPlan
      ) {
        return false;
      }
      // Manodopera e Mezzi: tre schede, ognuna col suo permesso e la sua parte
      // di piano; la voce c'è se almeno una scheda è disponibile.
      if (item.url === "/azienda/manodopera") return schedeManodopera.length > 0;
      // Assistenza aggrega Richieste e Manutenzione: la voce c'è se si può
      // vedere almeno una delle due (26/09/2026).
      if (item.url === "/azienda/assistenza") {
        return permissions.canViewTickets === true || permissions.canViewManutenzione === true;
      }
      if (item.url === "/azienda/cruscotto") {
        if (
          !permissions.canViewCruscotto &&
          !permissions.canViewDashboard &&
          !permissions.canViewMarketingDashboard &&
          !permissions.canViewCallcenterDashboard
        ) {
          return false;
        }
      } else if (
        item.permissionKey &&
        permissions[item.permissionKey as keyof typeof permissions] !== true &&
        !(item.orPermissionKey && permissions[item.orPermissionKey as keyof typeof permissions] === true)
      ) {
        return false;
      }
      // Gate inverso: nascondi la voce a chi HA questo permesso (evita doppioni tra
      // superfici destinate a persone diverse — es. "La mia formazione" per il
      // dipendente puro vs "Portale" per chi lo gestisce).
      if (item.hideIfPermissionKey && permissions[item.hideIfPermissionKey as keyof typeof permissions] === true) {
        return false;
      }
      // Module gate (v8.6.95 — fail-open per evitare flickering)
      if (item.moduleKey) {
        if (!isModuleEnabled(item.moduleKey)) {
          // 5 casi fail-open:
          //   - isDemoBaseline: Demo Azienda = vetrina, mostra tutto sempre
          //   - limitsLoading: query in volo → tieni visibile
          //   - !currentPlan: azienda senza piano (es. trial appena creato,
          //     super_admin loggato come sé stesso) → tieni visibile
          //   - isLimitedPlan: piano limited → mostra come DEMO
          //   - full plan + modulo non incluso → nascondi davvero
          if (!isDemoBaseline && !isLimitedPlan && !limitsLoading && currentPlan) return false;
        }
      }
      // Feature gate
      if (item.featureKey) {
        const state = passesFeatureGate(item.featureKey);
        if (state === "hidden") return false;
      }
      return true;
    }));
  }, [showGarePilot, permissions, gatingLoading, isModuleEnabled, billingMode, getFeatureAccessLevel, isLimitedPlan, isDemoBaseline, limitsLoading, currentPlan, isCommercialistaMode, hasMultipleCompanies, schedeManodopera, effectiveCompany?.management_mode]);

  const { state: sidebarState, toggleSidebar, isMobile: sidebarAPannello } = useSidebar();
  const isCollapsed = sidebarState === "collapsed" && !sidebarAPannello;
  const showMenuSkeleton = gatingLoading && !menuLoadingFallback;

  // Su mobile la navigazione è gestita dalla bottom nav + App Grid — niente sidebar
  if (isMobile) return null;

  return (
    <Sidebar className="border-r" collapsible="icon">
      {/* Header logo: sfondo sempre neutro — il colore brand resta su bottoni,
          link e voci attive, non su questa zona. */}
      <div
        className={cn(
          "border-b border-sidebar-border overflow-hidden bg-sidebar-accent/40",
          isCollapsed ? "flex flex-col items-center gap-2.5 px-2 py-3" : "space-y-2 px-3 py-3",
        )}
      >
        <CompanyBrandHeader
          isCollapsed={isCollapsed}
          logoUrl={branding?.logo_url}
          platformName={effectiveBrand.platformName}
          homeTo={isCommercialistaMode ? withCommercialistaSearch("/azienda/controllo-gestione") : COMPANY_APP_HOME}
        />
        <CompanyContextSwitcher isCollapsed={isCollapsed} />
        {/* Solo per chi lavora anche in cantiere: un click e passa di là. */}
        <AreaSwitcher isCollapsed={isCollapsed} className="mt-2" />
      </div>
      <SidebarContent>
        {isSettingsRoute ? (
          <SettingsSidebarContent
            isAdmin={isAdmin}
            permissions={permissions}
            navigate={navigate}
          />
        ) : (
          <>
            {isCommercialistaMode && (
              <div className="mx-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950">
                <Badge variant="outline" className="mb-2 border-blue-200 bg-white text-blue-700">
                  {t("Vista commercialista")}
                </Badge>
                <p dir="auto" className="text-sm font-semibold leading-tight">{commercialistaCompanyName}</p>
                <p className="mt-1 text-xs text-blue-800">
                  {t("Menu limitato a cantieri, magazzino, controllo gestione e finanza.")}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 h-8 w-full bg-white">
                  <Link to={commercialistaReturnTo}>{t("Torna allo studio")}</Link>
                </Button>
              </div>
            )}
            {/* Cruscotto — standalone items */}
            {!isCommercialistaMode && <CruscottoNavItems filterNavItems={filterNavItems} badgePronti={badgePronti} />}

            {/* Separator: divide top-level items from collapsible sections */}
            {!isCommercialistaMode && <div className="mx-4 border-t border-sidebar-border/60" />}

            {/* Collapsible macro-areas — exclusive accordion.
                Durante il loading di plan/feature-flags mostriamo skeleton
                rows invece di nascondere voci (evita flicker e mancanza
                momentanea di sezioni a pagamento). */}
            {showMenuSkeleton ? (
              <div className="px-3 py-2 space-y-2" aria-label={t("Caricamento menu")}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : (
              macroAreas
                .filter(a => a.id !== "area_cruscotto" && a.id !== "area_contenuti")
                .filter(a => !isCommercialistaMode || COMMERCIALISTA_ALLOWED_AREA_IDS.has(a.id))
                .map(area => {
                  const sourceItems =
                    isCommercialistaMode && area.id === "area_cantieri"
                      ? [...area.items, ...COMMERCIALISTA_EXTRA_CANTIERI_ITEMS]
                      : area.items;
                  const visibleItems = filterNavItems(sourceItems);
                  if (visibleItems.length === 0) return null;
                  return (
                    <MacroAreaCollapsible
                      key={area.id}
                      area={area}
                      visibleItems={visibleItems}
                      pathname={location.pathname}
                      open={openAreaId === area.id}
                      isScopriPlan={isScopriPlan}
                      isFeaturePreview={isSuperAdminViewer ? undefined : isFeaturePreview}
                      isModuleDemo={isModuleDemo}
                      toHref={withCommercialistaSearch}
                      onOpenChange={(isOpen) => {
                        const newId = isOpen ? area.id : null;
                        setOpenAreaId(newId);
                      }}
                    />
                  );
                })
            )}
            
            <div className="mt-auto border-t border-sidebar-border">
              <div className={cn("p-3", isCollapsed && "p-2 flex flex-col items-center gap-2")}>
                {isCollapsed ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={toggleSidebar}
                          aria-label={t("Espandi menu")}
                        >
                          <PanelLeft className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{t("Espandi menu")}</TooltipContent>
                    </Tooltip>
                    {showDriveLink && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to="/azienda/contenuti-multimediali"
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                              isDriveRoute && "bg-sidebar-accent text-sidebar-primary",
                            )}
                            aria-label="EiC Drive"
                          >
                            <FileStack className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">EiC Drive</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={
                            isCommercialistaMode
                              ? commercialistaReturnTo
                              : "/azienda/impostazioni/mio-profilo"
                          }
                        >
                          <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-sidebar-border hover:ring-sidebar-primary transition-colors">
                            <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
                            <AvatarFallback className="bg-sidebar-primary/10 text-sidebar-primary text-xs font-semibold">
                              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {isCommercialistaMode
                          ? t("Torna allo studio")
                          : t("{nome} — Il mio profilo", { nome: `${profile?.first_name} ${profile?.last_name}` })}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleLogoutOrExit}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {isImpersonating ? t("Torna a Admin") : t("Esci")}
                      </TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="h-8 w-8 ring-2 ring-sidebar-border">
                        <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
                        <AvatarFallback className="bg-sidebar-primary/10 text-sidebar-primary text-xs font-semibold">
                          {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p dir="auto" className="text-sm font-medium truncate">
                          {profile?.first_name} {profile?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t(etichettaRuoloAzienda(role, userRoles, { isImpersonating }))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleSidebar}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                        aria-label={sidebarAPannello ? t("Chiudi menu") : t("Comprimi menu a icone")}
                        title={sidebarAPannello ? t("Chiudi menu") : t("Comprimi a icone")}
                      >
                        <PanelLeftClose className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {showDriveLink && (
                        <Link to="/azienda/contenuti-multimediali">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "w-full justify-start gap-2.5 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                              isDriveRoute && "bg-sidebar-accent text-sidebar-primary",
                            )}
                          >
                            <FileStack className="h-3.5 w-3.5" />
                            EiC Drive
                          </Button>
                        </Link>
                      )}
                      {!isCommercialistaMode && (
                        <Link to="/azienda/impostazioni/mio-profilo">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2.5 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            {t("Impostazioni")}
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2.5 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                        onClick={handleLogoutOrExit}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {isImpersonating ? t("Torna a Admin") : t("Esci")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
});

export function CompanyLayout() {
  const {
    user,
    effectiveCompany,
    isImpersonating,
    multiCompanyAccesses,
    selectedMultiCompanyId,
    switchMultiCompany,
    role,
    userRoles,
  } = useAuth();
  const permissions = usePermissions();
  const t = useT();
  const { isModuleEnabled } = useSubscriptionLimits({ includeUsageCounts: false });
  const isMobile = useIsMobile();
  const showSupport = permissions.canViewTickets && isModuleEnabled("tickets");
  useCustomCSS();
  const navigate = useNavigate();
  // null indica che l'utente non ha ancora aperto il pannello. Dopo il primo
  // utilizzo restano montati per conservare i dati locali e il focus dei dialog.
  const [supportOpen, setSupportOpen] = useState<boolean | null>(null);
  const [channelDialogOpen, setChannelDialogOpen] = useState<boolean | null>(null);
  const [commandOpen, setCommandOpen] = useState<boolean | null>(null);
  const [deferredRealtimeReady, setDeferredRealtimeReady] = useState(false);
  const attivaServiziSecondari = useCallback(() => setDeferredRealtimeReady(true), []);
  const { unreadCount, markAsRead } = useUnreadSupportCount({ enabled: deferredRealtimeReady && !isMobile && showSupport });
  const { area, areaIcon: AreaIcon, page, pageUrl } = useBreadcrumb();
  const location = useLocation();
  const commercialistaParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  // Modalità commercialista FORZATA se role='accountant', anche se l'utente
  // è entrato dal company switcher senza i query param. Garantisce sidebar
  // filtrata + banner blu + pulsante "Torna allo studio" sempre presenti.
  const isCommercialistaMode =
    commercialistaParams.get("commercialistaMode") === "1" || role === "accountant";
  const commercialistaCompanyId =
    commercialistaParams.get("commercialistaCompany") ?? effectiveCompany?.id ?? null;
  const commercialistaCompanyName =
    commercialistaParams.get("commercialistaCompanyName") ??
    effectiveCompany?.name ??
    null;
  const commercialistaReturnTo = commercialistaParams.get("returnTo") || "/commercialista";

  const verificareDelega = isCommercialistaMode && (role === "accountant" || userRoles?.includes("accountant"));

  // AUTO-SWITCH: se l'URL contiene commercialistaMode=1 + commercialistaCompany=X,
  // assicuriamoci che effectiveCompany sia X (non l'azienda di sessione del commercialista).
  // Senza questo, il cruscotto mostra i dati sbagliati.
  //
  // EDGE CASE: se l'utente cambia azienda via CompanyContextSwitcher mentre è
  // in commercialistaMode, selectedMultiCompanyId diventa Y ≠ URL.X. Per evitare
  // loop di switch (URL forza X, switcher forza Y, ping-pong), aggiorniamo
  // l'URL alla nuova azienda invece di forzare lo switch indietro.
  // Distingue i due eventi che rendono selected ≠ URL:
  //  - l'URL è cambiato (click "Accedi" su una nuova azienda dal cruscotto
  //    studio) → l'URL è autorevole, si switcha all'azienda dell'URL;
  //  - l'URL è fermo ma selected è cambiato (switcher in alto) → si segue la
  //    scelta, riscrivendo l'URL.
  // Senza il ref, entrare in una seconda azienda dopo la prima veniva scambiato
  // per "switch via switcher" e riportava sull'azienda vecchia.
  const lastUrlCommercialistaCompany = useRef<string | null>(null);
  useEffect(() => {
    if (!isCommercialistaMode || !commercialistaCompanyId) return;
    if (selectedMultiCompanyId === commercialistaCompanyId) {
      lastUrlCommercialistaCompany.current = commercialistaCompanyId;
      return;
    }
    const hasAccessUrl = multiCompanyAccesses.some(
      (a) => a.company_id === commercialistaCompanyId && (!verificareDelega || a.access_role === "accountant"),
    );
    // Aspetta il caricamento degli accessi SENZA aggiornare il ref: altrimenti
    // al giro con accessi vuoti segneremmo l'URL come "già visto" e il giro
    // buono lo scambierebbe per uno switch via switcher.
    if (!hasAccessUrl) return;
    const urlChanged =
      lastUrlCommercialistaCompany.current !== commercialistaCompanyId;
    lastUrlCommercialistaCompany.current = commercialistaCompanyId;

    // URL fermo + selected diverso = l'utente ha cambiato via switcher.
    if (!urlChanged && selectedMultiCompanyId) {
      const userSwitched = multiCompanyAccesses.find(
        (a) =>
          a.company_id === selectedMultiCompanyId &&
          a.access_role === "accountant",
      );
      if (userSwitched) {
        // sincronizza URL con la scelta dell'utente (no switch indietro)
        const params = new URLSearchParams(location.search);
        params.set("commercialistaCompany", selectedMultiCompanyId);
        params.set(
          "commercialistaCompanyName",
          userSwitched.company?.name ?? "azienda selezionata",
        );
        navigate(`${location.pathname}?${params.toString()}`, { replace: true });
        return;
      }
    }

    // URL cambiato (o primo ingresso) → l'azienda dell'URL vince.
    switchMultiCompany(commercialistaCompanyId);
  }, [
    isCommercialistaMode,
    verificareDelega,
    commercialistaCompanyId,
    selectedMultiCompanyId,
    multiCompanyAccesses,
    switchMultiCompany,
    location.search,
    location.pathname,
    navigate,
  ]);

  // Audit log: traccia page view del commercialista per compliance
  useAuditAccountantPageView(
    isCommercialistaMode ? commercialistaCompanyId : null,
    location.pathname,
  );

  // Real-time: se l'azienda revoca/sospende l'accesso mentre il
  // commercialista è dentro, esce immediatamente con toast informativo.
  useAccountantRevocationWatch(commercialistaCompanyId, isCommercialistaMode);

  // Guard URL non-permessi in commercialistaMode: se l'utente digita
  // direttamente /azienda/marketing o /azienda/impostazioni (non in
  // COMMERCIALISTA_ALLOWED_URLS), redirect al cruscotto cliente.
  useEffect(() => {
    if (!isCommercialistaMode) return;
    const path = location.pathname;
    // Match esatto sull'URL principale (ignora query string + sotto-segmenti
    // appartenenti alla stessa pagina)
    const baseUrl = path.split("?")[0];
    const isAllowed =
      COMMERCIALISTA_ALLOWED_URLS.has(baseUrl) ||
      // Sotto-pagine consentite (es. /azienda/ordini/123 → ok perché /azienda/ordini è in lista)
      Array.from(COMMERCIALISTA_ALLOWED_URLS).some(
        (allowed) => baseUrl.startsWith(allowed + "/") && allowed !== "/azienda",
      );
    if (!isAllowed) {
      // commercialistaSearch è ricalcolato via useMemo: usiamo il valore
      // corrente leggendo da location.search direttamente per evitare
      // false-positive double-fire del useEffect.
      const currentSearch = location.search.startsWith("?")
        ? location.search.slice(1)
        : location.search;
      navigate(
        appendSearchToAziendaUrl("/azienda/cruscotto", currentSearch),
        { replace: true },
      );
    }
  }, [isCommercialistaMode, location.pathname, location.search, navigate]);

  // True only when the current path goes deeper than the matched nav item (sub-page)
  const isSubPage = !!pageUrl && location.pathname !== pageUrl;

  // Update document title
  useEffect(() => {
    const companyName = effectiveCompany?.name;
    if (page) {
      document.title = `${t(page)} · ${companyName || "Edilizia in Cloud"}`;
    } else if (area) {
      document.title = `${t(area)} · ${companyName || "Edilizia in Cloud"}`;
    } else {
      document.title = companyName || "Edilizia in Cloud";
    }
  }, [page, area, effectiveCompany?.name, t]);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Nelle impostazioni la scorciatoia appartiene alla ricerca locale.
        if (/^\/azienda\/impostazioni(?:\/|$)/.test(window.location.pathname)) return;
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Preventivatore Verticalizzato — FASE 1.4
  // Gate onboarding vertical: se l'azienda corrente non ha ancora completato la
  // scelta del settore (onboarding_vertical_completed=false) forziamo il redirect
  // a /azienda/onboarding/vertical. Escludiamo:
  // - impersonation super_admin: il super_admin non deve subire onboarding del tenant;
  // - chi non è amministratore: il settore lo sceglie il titolare. Il 14/09 una
  //   call center di BeMade è stata mandata qui al primo accesso e l'ha scelto;
  // - la pagina di onboarding stessa (evita loop).
  const onboardingVerticalDone =
    (effectiveCompany as unknown as { onboarding_vertical_completed?: boolean } | null)
      ?.onboarding_vertical_completed;
  useEffect(() => {
    if (isImpersonating) return;
    if (!effectiveCompany) return;
    if (!puoScegliereSettore(role, userRoles)) return;
    if (onboardingVerticalDone !== false) return;
    if (location.pathname === "/azienda/onboarding/vertical") return;
    navigate("/azienda/onboarding/vertical", { replace: true });
  }, [isImpersonating, effectiveCompany, role, userRoles, onboardingVerticalDone, location.pathname, navigate]);

  const [npsOpen, setNpsOpen] = useState(false);

  // Il preventivatore ha un'anteprima sticky: serve un vero scrollport nel main,
  // non un antenato overflow:auto di altezza illimitata che scorre col body.
  const isClassicQuoteEditor = /^\/azienda\/marketing\/preventivi\/(nuovo|[^/]+\/modifica)\/?$/.test(location.pathname);
  // A bounded scrolling main keeps template navigation and PDF preview sticky.
  // Anche la chat (Conversazioni / Team) e la scheda contatto, che ha la sua
  // chat al centro: con l'altezza libera la pagina intera
  // scorreva coi messaggi, la barra per scrivere finiva in fondo e l'ultimo
  // messaggio andava cercato (25/09/2026). Bloccata, ogni colonna scorre da sé.
  // I preventivatori col guscio comune (barra delle fasi, anteprima a destra e
  // piede fissi): con l'altezza libera scorre il documento intero e nessuna barra
  // resta ferma da computer. L'elenco dei moduli è in `components/preventivatore/rotte`.
  const isGuscioPreventivatore = rottaDelGuscio(location.pathname);
  const isViewportEditor = isClassicQuoteEditor
    || isGuscioPreventivatore
    || /^\/azienda\/impostazioni\/template-preventivi\/?$/.test(location.pathname)
    || /^\/azienda\/chat\/?$/.test(location.pathname)
    || /^\/azienda\/marketing\/contatti\/[^/]+\/?$/.test(location.pathname);
  // Chat: altezza bloccata allo schermo e, da desktop, senza margini. Senza il
  // blocco un filo lungo (Silvio) allungava <main> a 2.400px e il campo di
  // scrittura finiva sotto la piega; il margine di 24px era spazio vuoto.
  const isChatSchermoIntero = /^\/azienda\/chat\/?$/.test(location.pathname);
  // Silvio AI: come la chat, e su mobile da bordo a bordo con il campo di
  // scrittura appena sopra la barra flottante (80px + area sicura), non 112px.
  const isSilvioSchermoIntero = /^\/azienda\/silvio-ai/.test(location.pathname);
  // Email: da tablet come la chat, a tutta pagina e ad altezza bloccata. Col
  // margine di 24px e l'altezza fissa di 100vh-4rem i bottoni di risposta
  // finivano sotto la piega e scorreva la pagina insieme ai riquadri.
  const isEmailSchermoIntero = /^\/azienda\/email\/?$/.test(location.pathname);
  const altezzaBloccata = isViewportEditor || isChatSchermoIntero || isSilvioSchermoIntero || isEmailSchermoIntero;
  const paddingMain = isChatSchermoIntero || isEmailSchermoIntero
    ? "p-3 md:p-0 pb-28 md:pb-0"
    : isSilvioSchermoIntero
      ? "p-0 pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0"
      : "p-3 md:p-4 xl:p-6 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-4 xl:pb-6";

  const handleOpenChat = () => {
    markAsRead();
    setSupportOpen(true);
  };
  const contenutoAzienda = effectiveCompany?.management_mode === "accounting" && !isCompanyPathAvailable("accounting", location.pathname)
    ? <Navigate to={verificareDelega ? appendSearchToAziendaUrl(accountingHome(permissions), location.search) : accountingHome(permissions)} replace />
    : <CompanyPageOutlet />;
  
  return (
    <>
    {/* Sui tablet anche in orizzontale il menu si apre sopra il contenuto. */}
    <SidebarProvider pannelloSotto={1280}>
      {/* Da tablet in su la pagina scorre con la finestra, non dentro <main>: con
          `overflow: hidden/auto` qui e su <main> il browser prendeva loro come
          riferimento per gli elementi «sticky», e quelli non si incollavano mai
          (le schede della commessa sparivano scorrendo). `overflow-x: clip`
          continua a tagliare di lato senza creare un contenitore di scorrimento;
          `hidden` creerebbe di nuovo il problema, e `visible` su un asse solo
          diventa `auto` da specifica. Su telefono resta tutto com'era: lì <main>
          scorre davvero, e lo sticky funzionava già. */}
      <div className={`md:min-h-screen flex w-full ${altezzaBloccata ? "md:h-dvh" : "md:h-auto"} h-[calc(100dvh-env(safe-area-inset-top))] overflow-hidden ${altezzaBloccata ? "" : "md:overflow-x-clip md:overflow-y-visible"}`}>
        <CompanySidebar badgePronti={deferredRealtimeReady} />
        {/* NIENTE pt-safe qui: il top safe-area è già riservato UNA volta dal
            padding-top del body (html.capacitor body). Aggiungerlo qui lo
            raddoppierebbe → grande spazio bianco in alto su notch/Dynamic Island.
            Il root sopra usa h-[calc(100dvh - env(top))] così non straborda sotto
            (la bottom-nav resta visibile sopra l'home indicator). */}
        {/* relative: ancora la bottom-nav pillola (absolute) al fondo del
            container — overlay sul contenuto, niente fascia di layout. */}
        {/* Stessa ragione del contenitore sopra: `overflow-hidden` qui faceva da
            contenitore di scorrimento e rompeva gli «sticky» dentro la pagina. */}
        <div className={`relative flex-1 flex flex-col min-w-0 overflow-hidden ${altezzaBloccata ? "" : "md:overflow-x-clip md:overflow-y-visible"}`}>
          {/* Skip to main content — keyboard / screen-reader accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:bg-background focus:text-foreground focus:border focus:rounded focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
          >
            {t("Vai al contenuto principale")}
          </a>
          <QuickLoginReturnBanner />
          <AvvisoAziendaServer commercialista={isCommercialistaMode} />
          <ImpersonationBanner />
          <ViewAsBanner />
          {isCommercialistaMode && (
            <CommercialistaModeBanner
              companyName={commercialistaCompanyName}
              returnTo={commercialistaReturnTo}
            />
          )}
          <AnnouncementBanner />
          {/* Apple Guideline 3.1.1 — SubscriptionBanner contiene CTA upgrade Stripe, nascosto su iOS native */}
          {!isIOSNativePlatform && <SubscriptionBanner />}
          <header data-app-header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-background px-2 md:gap-2 md:px-3 xl:gap-4">
            {/* Mobile: back arrow on sub-pages (no hamburger — bottom nav "App" replaces sidebar) */}
            {isSubPage && (
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 -ml-1 shrink-0" onClick={() => navigate(-1)} aria-label={t("Torna indietro")}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            {/* Desktop: sidebar trigger */}
            <SidebarTrigger className="hidden md:flex" />

            {/* Mobile: brand stack (logo EiC + nome azienda) + company switcher
                v8.6.72 — Sostituisce il vecchio span page/area/companyName.
                Se l'utente è collegato a più aziende, tap apre il selector. */}
            <MobileBrandSwitcher />

            {/* Desktop: breadcrumb */}
            {area && (
              <nav aria-label={t("Percorso della pagina")} className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex">
                {AreaIcon && <AreaIcon aria-hidden="true" className="size-3.5 shrink-0" />}
                <span className="min-w-0 truncate text-xs font-medium">{t(area)}</span>
                {page && (
                  <>
                    <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
                    <span className="min-w-0 truncate text-xs font-medium text-foreground" aria-current="page">{t(page)}</span>
                  </>
                )}
              </nav>
            )}

            <div className="hidden min-w-0 flex-1 md:block" />
            {/* ViewAsDropdown — visibile SOLO durante impersonazione super_admin */}
            <ViewAsDropdown />
            {/* Timbra: entrata/uscita/pausa da ovunque, con le ore di oggi e i
                link a timbrature e ferie. Solo chi ha un profilo HR lo vede. */}
            <TimbraHeaderButton />
            {/* v8.6.72 — Search Command Palette nascosta su mobile: spazio header limitato,
                la ricerca dentro l'App grid + le ricerche per-pagina coprono i casi mobile. */}
            {!/^\/azienda\/impostazioni(?:\/|$)/.test(location.pathname) && <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 hidden md:inline-flex" onClick={() => setCommandOpen(true)} title={t("Cerca (⌘K)")} aria-label={t("Cerca (⌘K)")}>
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>}
            {/* 29/10/2026 — La rotellina Impostazioni non e' piu' qui.
                L'intestazione del telefono aveva sette elementi in 375px
                (indietro, logo, timbra, rotellina, cervello, chat, campanella)
                e i nomi dell'azienda e della pagina finivano tagliati.
                Impostazioni ora sta nella griglia «App», insieme a tutto il
                resto (vedi MobileAppGrid, area_impostazioni). Su desktop non
                c'era e non cambia niente. */}
            {/* AI: azioni proposte che richiedono OK utente (MP-AIE-03)
                v8.6.69 — Nascoste su mobile (icona inbox+badge); restano su md+.
                Motivazione UX: header mobile sovraffollato, l'utente accede
                alle proposte da pagina dedicata. */}
            {deferredRealtimeReady && !isMobile && (
              <div className="hidden md:block">
                <ActionProposalsBadge />
              </div>
            )}
            {/* v8.6.90 — Changelog "Cosa c'è di nuovo" con badge non-letti
                v8.6.72 — Nascosto su mobile per liberare header.
                Resta accessibile dalle impostazioni / drawer admin. */}
            {!isMobile && (
              <div className="hidden md:block">
                <ChangelogDrawer />
              </div>
            )}
            {/* 29/10/2026 — Via anche il cervello di Silvio dall'intestazione:
                sul telefono Silvio e' gia' il bottone grande al centro della
                barra in basso, dove il pollice arriva. Due porte per la stessa
                stanza, in una testata da 375px, erano una di troppo. */}
            {/* v8.6.71 — Chat Team header button (solo mobile).
                Sostituisce SilvioBellPopover su mobile (che resta su desktop
                accanto alla campanella notifiche). Mostra badge con il numero
                di messaggi chat non letti. Tap → /azienda/chat. */}
            {isMobile && (
              <MobileChatTeamButton badgePronti={deferredRealtimeReady} />
            )}
            {/* Silvio: cose da sapere proattive — NASCOSTA su mobile (v8.6.71)
                per liberare spazio header. Resta su desktop dove c'è più posto. */}
            {deferredRealtimeReady && !isMobile && (
              <div className="hidden md:block">
                <SilvioBellPopover />
              </div>
            )}
            {deferredRealtimeReady && <NotificationsRealtime />}
            <NotificationsBellPopover badgePronti={deferredRealtimeReady} />
            {/* Da 768px: tra 640 e 767 la testata è quella del telefono, dove
                il bottone verde da 150px spingeva fuori le icone. */}
            {showSupport && (
              <Button variant="outline" size="sm" className="relative hidden md:flex bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500 hover:border-emerald-600 shadow-md hover:shadow-lg transition-shadow" onClick={() => setChannelDialogOpen(true)}>
                <HeadphonesIcon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("Assistenza")}</span>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 flex items-center justify-center text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            )}
          </header>
          <OfflineBanner />
          {/* overflow-x-hidden: niente scroll laterale di pagina su mobile (richiesta utente:
              "spazi vuoti ai lati quando scrollo") — le tabelle scrollano nei loro wrapper */}
          {/* pb mobile ≈ altezza pillola flottante + safe-area: l'ultimo
              elemento resta raggiungibile sopra il vetro della bottom-nav. */}
          <main className={`flex-1 ${altezzaBloccata ? "min-h-0" : ""} overflow-y-auto overflow-x-hidden ${altezzaBloccata ? "" : "md:overflow-x-clip md:overflow-y-visible"} ${paddingMain} bg-muted/30`} id="main-content" aria-label={t("Contenuto principale")}>
            <RichiestaPushNativa />
            <ErrorBoundary title={t("Errore nel caricamento della pagina")} resetKey={location.pathname}>
              {/* Skeleton (non spinner) al cambio pagina: percezione di velocità sul primo paint mobile */}
              <Suspense fallback={
                <div className="space-y-4" aria-busy="true" aria-label={t("Caricamento pagina")}>
                  <Skeleton className="h-8 w-48" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="hidden h-24 rounded-xl sm:block" />
                    <Skeleton className="hidden h-24 rounded-xl lg:block" />
                  </div>
                  <Skeleton className="h-64 rounded-xl" />
                </div>
              }>
                <SoftphoneProvider>
                  {verificareDelega ? (
                    <DelegatedCompanyContent companyId={commercialistaCompanyId} effectiveCompanyId={effectiveCompany?.id}>
                      {contenutoAzienda}
                    </DelegatedCompanyContent>
                  ) : contenutoAzienda}
                  {!deferredRealtimeReady && <DopoPrimaPagina onReady={attivaServiziSecondari} />}
                </SoftphoneProvider>
              </Suspense>
            </ErrorBoundary>
          </main>
          <footer className="hidden md:block text-center py-2 border-t bg-background">
            <PoweredByBadge />
          </footer>
          {/* Bottom nav come flex item in fondo al layout — NO position:fixed.
              Su Safari iOS position:fixed non funziona in certi contesti.
              Con h-[100dvh] + overflow-hidden sul container e overflow-y-auto
              sul main, la nav resta sempre visibile senza fixed. */}
          {isMobile && (
            <ErrorBoundary key={location.pathname} title={t("Errore navigazione mobile")}>
              <MobileBottomNav badgePronti={deferredRealtimeReady} />
            </ErrorBoundary>
          )}
        </div>
      </div>
      {/* La chiamata passata dall'assistente arriva mentre lavori, non mentre
          guardi il centralino: la scheda vive nel guscio, non in una pagina. */}
      <ErrorBoundary title={t("Errore scheda chiamata")}>
        <SchedaPassaggioChiamata />
      </ErrorBoundary>
      {showSupport && (channelDialogOpen !== null || supportOpen !== null) && (
        <ErrorBoundary title={t("Errore nell’apertura dell’assistenza")}>
          <Suspense fallback={<AperturaPannello />}>
            {channelDialogOpen !== null && (
              <SupportChannelDialog
                open={channelDialogOpen}
                onOpenChange={setChannelDialogOpen}
                onOpenChat={handleOpenChat}
              />
            )}
            {supportOpen !== null && <SupportChatSheet open={supportOpen} onOpenChange={setSupportOpen} />}
          </Suspense>
        </ErrorBoundary>
      )}
      {commandOpen !== null && (
        <ErrorBoundary title={t("Errore nell’apertura della ricerca")}>
          <Suspense fallback={commandOpen ? <AperturaPannello /> : null}>
            <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
          </Suspense>
        </ErrorBoundary>
      )}
      {deferredRealtimeReady && <PWAInstallBanner />}
      {npsOpen && (
        <ErrorBoundary title={t("Errore nell’apertura del questionario")}>
          <Suspense fallback={<AperturaPannello />}>
            <NpsModal open={npsOpen} onClose={() => setNpsOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
      <AssistenteAzienda
        key={`${user?.id ?? ""}:${effectiveCompany?.id ?? ""}`}
        mostraPulsante={deferredRealtimeReady && !isMobile}
      />
    </SidebarProvider>
    </>
  );
}
