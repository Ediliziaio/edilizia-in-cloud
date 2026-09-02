import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { SoftphoneProvider } from "@/components/telephony/SoftphoneProvider";
import { navigateToSubdomain } from "@/utils/subdomainNav";
// Apple Guideline 3.1.1 — su iOS nativo nascondiamo voci che linkano a checkout Stripe
import { isIOS as isIOSNativePlatform } from "@/lib/mobile/platform";
import { supabase } from "@/integrations/supabase/client";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useBranding } from "@/hooks/useBranding";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { applyBrandTheme, clearBrandTheme } from "@/lib/brandTheme";
import { useCustomCSS } from "@/hooks/useCustomCSS";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { useImpersonationClientView, setImpersonationClientView } from "@/hooks/useImpersonationView";
import { 
  HeadphonesIcon,
  Settings,
  FolderOpen,
  LogOut,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  ArrowLeft,
  Building2,
  Package,
  Wrench,
  TrendingUp,
  Percent,
  ListOrdered,
  Truck,
  Users,
  Key,
  ChevronDown,
  ChevronRight,
  Plug,
  Tag,
  SlidersHorizontal,
  GitBranch,
  CalendarDays,
  Wallet,
  Shield,
  Gavel,
  Paintbrush,
  FileSignature,
  FileStack,
  FileText,
  RefreshCw,
  Search,
  Globe,
  Phone,
  FormInput,
  MapPin,
  ClipboardList,
  AtSign,
  Banknote,
  QrCode,
  Brain,
  Bell,
  Settings as SettingsIcon,
  PanelLeft,
  PanelLeftClose,
  ImagePlus,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import ediliziaLogoSmall from "@/assets/edilizia-in-cloud-logo-small.webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CompanyContextSwitcher } from "@/components/layouts/CompanyContextSwitcher";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { Suspense, useMemo, useState, useEffect, useCallback, memo } from "react";
import { SupportChatSheet } from "@/components/layouts/SupportChatSheet";
import { SupportChannelDialog } from "@/components/layouts/SupportChannelDialog";
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

import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PWAInstallBanner } from "@/components/ui/PWAInstallBanner";
import { NpsModal } from "@/components/onboarding/NpsModal";
import { SilvioFAB } from "@/components/silvio/SilvioFAB";
import { useAuditAccountantPageView } from "@/hooks/accountant/useAccountantAudit";
import { useAccountantRevocationWatch } from "@/hooks/accountant/useAccountantRevocationWatch";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";

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
  const logoSrc = logoUrl ?? (isCollapsed ? ediliziaLogoSmall : ediliziaLogo);
  const logoAlt = logoUrl ? (platformName ?? "Logo piattaforma") : "EdiliziaInCloud";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={homeTo}
          className={cn(
            "flex min-w-0 items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60",
            isCollapsed ? "h-11 w-11 justify-center p-1.5" : "h-12 w-full justify-start px-1",
          )}
          aria-label={platformName ?? "EdiliziaInCloud"}
        >
          <img
            src={logoSrc}
            alt={logoAlt}
            className={cn(
              "object-contain",
              isCollapsed ? "max-h-8 max-w-8" : "h-10 max-w-[205px]",
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

  if (!isImpersonating) return null;

  const handleExit = async () => {
    await exitImpersonation();
    // On production (real subdomains), clear the app.* session locally
    // without invalidating the server-side token used by the admin panel.
    // On localhost, admin and app share the same localStorage — never sign out
    // or the admin would get kicked out too.
    const hostname = window.location.hostname;
    const isProductionSubdomain =
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      !hostname.includes("192.168.");
    if (isProductionSubdomain) {
      await supabase.auth.signOut({ scope: "local" });
    }
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
        <span className="hidden shrink-0 text-sm font-medium sm:inline">Stai visualizzando:</span>
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
          <span className="hidden sm:inline">Torna a Admin</span>
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
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setImpersonationClientView(!clientView)}
      title={
        clientView
          ? "Stai vedendo ciò che vede il cliente (piano e funzioni applicati). Clicca per la vista completa super admin."
          : "Vista completa super admin: tutti i moduli aperti. Clicca per vedere ciò che vede il cliente."
      }
    >
      {clientView ? <Eye className="h-4 w-4 sm:mr-2" /> : <EyeOff className="h-4 w-4 sm:mr-2" />}
      <span className="hidden sm:inline">{clientView ? "Vista cliente" : "Vista completa"}</span>
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
  const resolvedCompanyName = companyName ?? "azienda selezionata";

  return (
    <div className="border-b-2 border-blue-300 bg-gradient-to-r from-blue-100 to-blue-50 px-3 py-3 text-blue-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
              Modalità Commercialista — stai operando per
            </p>
            <p className="truncate text-sm font-bold text-blue-950">
              {resolvedCompanyName}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-9 shrink-0 border-blue-300 bg-white font-medium hover:bg-blue-50">
          <Link to={returnTo}>← Torna allo studio</Link>
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
  "/azienda/sicurezza-cantiere",
  "/azienda/render",
  "/azienda/agenti-ai",
  "/azienda/automazioni",
];

// FULL_PLAN_SLUGS: fallback hardcoded usato se `subscription_plans.is_full_plan`
// non è ancora popolato (backward compat per ambienti pre-migration).
// Fonte di verità preferita: `currentPlan.is_full_plan === true`.
const FULL_PLAN_SLUGS = new Set(["starter", "pro", "enterprise"]);

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
    if (item.featureKey) {
      if (item.featureKey === "billing_external" || item.featureKey === "billing_native") return false;
      if (isFeaturePreview?.(item.featureKey)) return true;
    }
    if (item.moduleKey && isModuleDemo?.(item.moduleKey)) return true;
    return false;
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !(prev[label] ?? true) }));
  };

  const isGroupOpen = (label: string) => {
    if (label in openGroups) return openGroups[label];
    return true; // default open
  };
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (url: string) => {
    if (url === "/azienda") return pathname === "/azienda";
    if (url === "/azienda/marketing") return pathname === "/azienda/marketing";
    // "Fatture" è l'hub unico della fatturazione nativa: documenti, rubrica,
    // incassi, SDI e fiscalità vivono come tab interne.
    if (url === "/azienda/documenti") {
      return pathname === "/azienda/documenti" || pathname.startsWith("/azienda/documenti/");
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
                  title={item.title}
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
            <SidebarMenuButton asChild>
              <NavLink
                to={toHref(item.url)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg mx-1.5 px-3 py-2 text-xs transition-colors",
                  active
                    ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                )}
              >
                <ItemIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title}</span>
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
                  {area.title}
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
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary",
                            isDemo && "opacity-70"
                          )}
                        >
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.title}</span>
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
          "flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-normal transition-all duration-150 group",
          (open || hasActiveChild)
            ? "text-sidebar-primary/80"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90"
        )}>
          <span className="flex items-center gap-1.5 min-w-0">
            <AreaIcon className={cn("h-4 w-4 shrink-0 transition-colors duration-150", (open || hasActiveChild) && "text-sidebar-primary")} />
            <span className="truncate">{area.title}</span>
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
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={toHref(item.url)}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-xs text-sidebar-foreground/75 transition-all duration-150 hover:bg-muted hover:text-sidebar-foreground border-l-2 border-l-transparent",
                            active && "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary",
                            isLocked && "opacity-50",
                            isDemo && !active && "opacity-75"
                          )}
                        >
                          <ItemIcon className="h-4 w-4" />
                          <span>{item.title}</span>
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

function CruscottoNavItems({ filterNavItems }: { filterNavItems: (items: NavItem[]) => NavItem[] }) {
  const { data: taskCounts } = useMyTaskCount();
  const { data: emailCounts } = useUnreadEmailCount();
  const permissions = usePermissions();
  const { role } = useAuth();
  const items = filterNavItems(macroAreas.find(a => a.id === "area_cruscotto")?.items ?? []);

  return (
    <SidebarGroup className="py-2">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isTaskItem = item.url === "/azienda/attivita";
            const isEmailItem = item.url === "/azienda/email";
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
            const tooltipExtra = isEmailItem && emailCounts
              ? ` — ${emailCounts.unread} da leggere${emailCounts.urgent ? `, ${emailCounts.urgent} urgenti` : ""}`
              : isTaskItem && taskCounts && taskCounts.total > 0
                ? ` — ${taskCounts.total} attività${taskCounts.overdue ? ` (${taskCounts.overdue} scadute)` : ""}`
                : "";

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild tooltip={`${item.title}${tooltipExtra}`}>
                  <NavLink
                    to={itemUrl}
                    end={itemUrl === "/azienda" || itemUrl === "/azienda/marketing"}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-xs text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent"
                    activeClassName="bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary"
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium">{item.title}</span>
                    {showBadge && (
                      <Badge
                        variant={badgeVariant === "destructive" ? "destructive" : "secondary"}
                        className={cn(
                          "ml-auto h-5 min-w-[20px] px-1.5 text-[10px] font-bold",
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

// ─── Tipi struttura dati sidebar impostazioni ────────────────────────────────
interface SettingsNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
}
interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

/** Costruisce i gruppi della sidebar impostazioni in base ai permessi.
 *  Il primo gruppo "Il mio account" è sempre visibile a tutti i ruoli.
 *  I gruppi aziendali sono visibili solo se l'utente ha i permessi necessari. */
function buildSettingsGroups(isAdmin: boolean, permissions: Permissions): SettingsNavGroup[] {
  return [
    {
      label: "Il mio account",
      items: [
        { to: "/azienda/impostazioni/mio-profilo", label: "Il mio profilo", icon: <Users className="h-4 w-4" />, visible: true },
      ],
    },
    {
      label: "La mia azienda",
      items: [
        { to: "/azienda/impostazioni/profilo",      label: "Profilo aziendale", icon: <Building2 className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsProfile },
        { to: "/azienda/impostazioni/sedi",          label: "Sedi",              icon: <MapPin className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsPeople },
        { to: "/azienda/impostazioni/branding",      label: "White-Label",       icon: <Paintbrush className="h-4 w-4" />,   visible: isAdmin },
        // v8.6.59 — Solo "Piano abbonamento": "Crediti & Saldo" è ora il tab
        // "Portafoglio" interno alla dashboard Abbonamento (no duplicazione).
        // Apple Guideline 3.1.1 — nascosto su iOS nativo (no link a Stripe checkout).
        { to: "/azienda/impostazioni/abbonamento",   label: "Piano abbonamento", icon: <Wallet className="h-4 w-4" />,       visible: isAdmin && !isIOSNativePlatform },
      ],
    },
    {
      // v8.6.72 — Nuovo gruppo "AI & Notifiche" — voci precedentemente
      // raggiungibili solo da Cmd+K o dall'hub mobile (/azienda/impostazioni).
      // Visibili a tutti gli utenti (la pagina interna gestisce permessi fini).
      label: "AI & Notifiche",
      items: [
        { to: "/azienda/impostazioni/ai-memoria", label: "AI Personas (chat + memoria)", icon: <Brain className="h-4 w-4" />, visible: true },
        { to: "/azienda/impostazioni/notifiche",  label: "Notifiche",           icon: <Bell className="h-4 w-4" />,  visible: true },
      ],
    },
    {
      label: "Cantieri & Costi",
      items: [
        { to: "/azienda/impostazioni/stati-ordine",        label: "Stati ordine",        icon: <ListOrdered className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/categorie-costi",     label: "Categorie costi",     icon: <FolderOpen className="h-4 w-4" />, visible: isAdmin || permissions.canViewCosts },
        { to: "/azienda/impostazioni/fornitori",           label: "Fornitori",           icon: <Truck className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsSuppliers },
        { to: "/azienda/impostazioni/qr-codici",           label: "QR & Codici",         icon: <QrCode className="h-4 w-4" />,      visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/automazioni-finanza", label: "Automazioni finanza", icon: <RefreshCw className="h-4 w-4" />,  visible: isAdmin || permissions.canViewCosts },
      ],
    },
    {
      // 13/7/2026: gate voci allineati 1:1 ai permessi delle route
      // (companyRoutes.tsx): prima molte voci usavano canViewSettingsOrders e chi
      // aveva SOLO can_view_settings_pricing non vedeva Listino & Prezzi in menu.
      label: "Preventivi & Listino",
      items: [
        { to: "/azienda/impostazioni/listino",              label: "Listino prodotti",    icon: <Package className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsPricing },
        { to: "/azienda/impostazioni/tariffe",              label: "Manodopera e Servizi", icon: <Wrench className="h-4 w-4" />,     visible: isAdmin || permissions.canViewSettingsPricing },
        { to: "/azienda/impostazioni/finanziamenti",        label: "Finanziamenti",        icon: <Banknote className="h-4 w-4" />,   visible: isAdmin || permissions.canViewSettingsFinanziamenti },
        { to: "/azienda/impostazioni/margini",              label: "Preventivi & Margini",icon: <TrendingUp className="h-4 w-4" />, visible: isAdmin || permissions.canViewCosts },
        { to: "/azienda/impostazioni/scontistica",          label: "Regole scontistica",  icon: <Percent className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsScontistica },
        { to: "/azienda/impostazioni/template-preventivi", label: "Template offerte",    icon: <Paintbrush className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsPricing },
        { to: "/azienda/impostazioni/catalogo-render",    label: "Catalogo render",     icon: <ImagePlus className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/condizioni-firma", label: "Condizioni e firma", icon: <Gavel className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsPricing },
        { to: "/azienda/impostazioni/sopralluoghi",        label: "Impostazioni Sopralluoghi", icon: <ClipboardList className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/firma-elettronica",   label: "Firma Elettronica",   icon: <FileSignature className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/bundle",              label: "Bundle & Pacchetti",   icon: <Package className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsBundle },
      ],
    },
    {
      label: "CRM & Vendite",
      items: [
        { to: "/azienda/impostazioni/tag",                 label: "Tag",                  icon: <Tag className="h-4 w-4" />,              visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/campi-personalizzati",label: "Campi personalizzati", icon: <SlidersHorizontal className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/sequenze",            label: "Sequenze",             icon: <GitBranch className="h-4 w-4" />,         visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/form-builder",        label: "Form & UTM",           icon: <FileText className="h-4 w-4" />,          visible: isAdmin || permissions.canViewSettingsCustomization },
      ],
    },
    {
      label: "Marketing",
      items: [
        { to: "/azienda/impostazioni/calendari",  label: "Calendari marketing", icon: <CalendarDays className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/lead-forms", label: "Lead Facebook",       icon: <FormInput className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsIntegrations },
      ],
    },
    {
      label: "Persone & Accessi",
      items: [
        // IMP3: voce unica → pagina con 4 tab (utenti/venditori/staff/team)
        { to: "/azienda/impostazioni/persone", label: "Persone & Accessi", icon: <Users className="h-4 w-4" />, visible: isAdmin || permissions.canViewUsers || permissions.canViewSettingsPeople },
      ],
    },
    {
      label: "Sicurezza & Privacy",
      items: [
        // IMP4: voce unica → pagina con 4 tab (password/privacy/dashboard/attivita)
        { to: "/azienda/impostazioni/sicurezza-privacy", label: "Sicurezza & Privacy", icon: <Shield className="h-4 w-4" />, visible: true },
      ],
    },
    {
      label: "Integrazioni & API",
      items: [
        // v8.6.57 — "Crediti & Saldo" spostato in "La mia azienda" sopra
        { to: "/azienda/impostazioni/integrazioni",   label: "Integrazioni",   icon: <Plug className="h-4 w-4" />,   visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/api",            label: "API Platform",   icon: <Key className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/webhook",        label: "Webhook",        icon: <Globe className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/dominio-email",  label: "Dominio Email",  icon: <AtSign className="h-4 w-4" />, visible: isAdmin || permissions.canViewMarketingEmail },
        { to: "/azienda/impostazioni/numeri-telefono",label: "Telefonia",icon: <Phone className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsIntegrations },
      ],
    },
    {
      // v8.6.57 — "Piano abbonamento" spostato in "La mia azienda".
      // "Fatturazione" + "Fatturazione elettronica" unificate in 1 voce sola
      // con tabs interni (modalità esterna provider vs nativa).
      label: "Fatturazione",
      items: [
        { to: "/azienda/impostazioni/fatturazione", label: "Fatturazione", icon: <FileText className="h-4 w-4" />, visible: isAdmin },
      ],
    },
  ];
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

  const allGroups = useMemo(
    () => buildSettingsGroups(isAdmin, permissions),
    [isAdmin, permissions]
  );

  // Filtra gruppi per ricerca: se query vuota mostra tutto, altrimenti filtra per label
  const filteredGroups = useMemo<SettingsNavGroup[]>(() => {
    const visibleGroups = allGroups.map(g => ({
      ...g,
      items: g.items.filter(item => item.visible),
    })).filter(g => g.items.length > 0);

    if (!query.trim()) return visibleGroups;

    const q = query.trim().toLowerCase();
    return visibleGroups
      .map(g => ({
        ...g,
        items: g.items.filter(
          item =>
            item.label.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.items.length > 0);
  }, [allGroups, query]);

  const navLinkClass =
    "flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent";
  const navLinkActive =
    "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary";

  return (
    <>
      {/* Bottone Torna indietro */}
      <div className="px-3 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 mb-2 text-muted-foreground hover:text-foreground w-full"
          onClick={() => navigate("/azienda")}
        >
          <ArrowLeft className="h-4 w-4" />
          Torna indietro
        </Button>
        <h2 className="text-lg font-semibold px-3 mb-3">Impostazioni</h2>

        {/* Barra di ricerca fuzzy */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca impostazioni…"
            className="pl-8 h-8 text-sm bg-muted/40 border-0 focus-visible:ring-1"
            aria-label="Cerca nelle impostazioni"
          />
        </div>
      </div>


      {/* Gruppi filtrati */}
      {filteredGroups.map(group => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(item => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.to} className={navLinkClass} activeClassName={navLinkActive}>
                      {item.icon}
                      <span>{item.label}</span>
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
          Nessun risultato per <strong>"{query}"</strong>
        </div>
      )}
    </>
  );
});

const CompanySidebar = memo(function CompanySidebar() {
  const isMobile = useIsMobile();
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation, role, multiCompanyAccesses, viewAsRole } = useAuth();
  const hasMultipleCompanies = (multiCompanyAccesses?.length ?? 0) > 1;
  // usePermissions è già "viewAs-aware": quando `viewAsRole` è attivo
  // restituisce i permessi REALI dell'utente target (letti da staff_permissions),
  // così la sidebar riflette esattamente quello che vedrebbe quell'utente.
  const permissions = usePermissions();
  const { isModuleEnabled, isScopriPlan, currentPlan, isLoading: limitsLoading } = useSubscriptionLimits({ includeUsageCounts: false });
  const { isFeaturePreview, getFeatureAccessLevel, isLoading: flagsLoading } = useFeatureFlags();

  // v8.6.102 — Super-admin bypass per badge DEMO.
  // Bug fix: durante il bootstrap impersonation, il super_admin vedeva per
  // 1-3 sec badge "DEMO" sulla sidebar perché isImpersonationReady arrivava
  // dopo. Per super_admin il bypass dei badge è SEMPRE attivo:
  // — non opera mai realmente come "limited user" sulla UI
  // — bypass effettivo a livello DB resta gestito da useFeatureFlags.bypass
  //   che richiede isImpersonationReady, quindi nessun leak privilege
  // ECCEZIONE "Vista cliente" (toggle nel banner impersonation, default ON):
  // il super admin vuole verificare COSA VEDE il piano del cliente → in quel
  // caso la sidebar deve rendere badge/moduli esattamente come per il cliente.
  // Con "Visualizza come utente" (viewAsRole) la vista cliente è FORZATA:
  // "loggato come Daniela" = pixel-perfect ciò che vede Daniela.
  const impersonationClientView = useImpersonationClientView() || !!viewAsRole;
  const isSuperAdminViewer = role === "super_admin" && !(isImpersonating && impersonationClientView);

  // Demo Azienda S.r.l. = company-vetrina interna. Bypassa DEMO badges così
  // la sidebar appare full-feature anche se il piano DB è parziale (è il caso
  // reference che support/onboarding usano come "come dovrebbe apparire").
  const isDemoBaseline = isDemoCompanyId(effectiveCompany?.id);

  // "Piano full": fonte di verità è la colonna DB `subscription_plans.is_full_plan`.
  // Fallback su `FULL_PLAN_SLUGS` hardcoded se il campo DB non è popolato
  // (ambienti pre-migration). Aggiungere un nuovo piano "premium" ora richiede
  // solo `UPDATE subscription_plans SET is_full_plan=true WHERE slug='premium'`
  // → nessun deploy frontend.
  const planIsFullFlag = (currentPlan as { is_full_plan?: boolean } | null | undefined)?.is_full_plan === true;
  const isFullBySlug = !!currentPlan?.slug && FULL_PLAN_SLUGS.has(currentPlan.slug);
  const isFullPlan = planIsFullFlag || isFullBySlug;

  // "Piano limitato": ha un piano attivo che NON è full.
  // - Trial / no plan → fail-open in filterNavItems (gestito separatamente)
  // - Demo Azienda / super_admin → bypass dedicato
  // - Full plan → tutto abilitato
  // - Tutti gli altri (free/scopri/custom/team/etc.) → limited → DEMO badge
  const isLimitedPlan = !isSuperAdminViewer && !isDemoBaseline && !!currentPlan && !isFullPlan;

  /** Modulo in modalità demo: non incluso ma piano è "limited" (o no plan) → preview. */
  const isModuleDemo = (moduleKey: string): boolean => {
    if (isSuperAdminViewer) return false; // super_admin non vede mai badge DEMO
    if (isDemoBaseline) return false;     // Demo Azienda = vetrina, no badge DEMO
    if (isModuleEnabled(moduleKey as never)) return false;
    // v8.6.95: fail-open senza plan → marca come DEMO finché non c'è chiarezza
    if (!currentPlan && !limitsLoading) return true;
    return isLimitedPlan;
  };
  // Mostriamo skeleton finché plan + feature flags non sono risolti: con
  // `isModuleEnabled` fail-closed, altrimenti la sidebar flickererebbe a vuoto.
  const gatingLoading = limitsLoading || flagsLoading;
  const [menuLoadingFallback, setMenuLoadingFallback] = useState(false);
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
  const isAdmin = role === "company_admin" || role === "super_admin";
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

  const [openAreaId, setOpenAreaId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem("sidebar_open_area");
      if (stored) return stored;
    } catch { /* storage non disponibile — silenzioso */ }
    return findActiveAreaId(location.pathname);
  });

  // BUG FIX: la dep `openAreaId` qui causava un loop di accordion: se l'utente
  // cliccava su un'altra macroArea (es. "Persone") mentre era su una route di
  // un'altra area (es. /azienda/fatture in area_finanza), `setOpenAreaId(area_persone)`
  // veniva immediatamente sovrascritto da questo effect che ri-leggeva il
  // pathname e riportava `openAreaId` ad area_finanza. Risultato: la sidebar
  // restava "incollata" all'area della route corrente e non si poteva esplorare.
  //
  // Soluzione: l'effect deve allineare la sidebar SOLO quando cambia il
  // pathname (navigazione effettiva). I click manuali sull'accordion sono
  // gestiti da onOpenChange e devono essere preservati. Quindi: dep array
  // include solo `location.pathname` (con `findActiveAreaId` stabile via
  // useCallback).
  useEffect(() => {
    const active = findActiveAreaId(location.pathname);
    if (active) {
      setOpenAreaId(active);
      try { localStorage.setItem("sidebar_open_area", active); } catch { /* storage non disponibile — silenzioso */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Applica i colori brand al design system (--primary, --accent, sidebar)
  useEffect(() => {
    if (effectiveBrand.isWhiteLabel) {
      applyBrandTheme({
        primaryColor: effectiveBrand.primaryColor,
        accentColor: effectiveBrand.accentColor,
        textOnPrimary: effectiveBrand.textOnPrimary,
      });
      if (effectiveBrand.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
        link.href = effectiveBrand.faviconUrl;
      }
      if (effectiveBrand.platformName) {
        document.title = effectiveBrand.platformName;
      }
    } else {
      clearBrandTheme();
    }
    return () => clearBrandTheme();
  }, [effectiveBrand]);
  
  const handleLogoutOrExit = useCallback(async () => {
    if (isImpersonating) {
      await exitImpersonation();
      // Same logic as ImpersonationBanner: only sign out on production subdomains.
      const hostname = window.location.hostname;
      const isProductionSubdomain =
        hostname !== "localhost" &&
        hostname !== "127.0.0.1" &&
        !hostname.includes("192.168.");
      if (isProductionSubdomain) {
        await supabase.auth.signOut({ scope: "local" });
      }
      navigateToSubdomain("/admin/aziende", "admin", navigate);
    } else {
      signOut();
    }
  }, [isImpersonating, exitImpersonation, navigate, signOut]);

  const filterNavItems = useCallback((items: NavItem[]) => {
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
      if (!isCommercialistaMode) return visibleItems;
      return visibleItems.filter((item) => COMMERCIALISTA_ALLOWED_URLS.has(item.url));
    };

    if (permissions.isLoading || gatingLoading) {
      return applyCommercialistaScope(items.filter((item) => {
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
    return applyCommercialistaScope(items.filter((item) => {
      if (item.url === "/azienda/contenuti-multimediali" && !canAccessMediaLibrary(permissions)) {
        return false;
      }
      if (item.demoCompanyOnly && !isDemoBaseline) return false;
      if (item.multiCompanyOnly && !hasMultipleCompanies) return false;
      if (item.url === "/azienda/cruscotto") {
        if (
          !permissions.canViewCruscotto &&
          !permissions.canViewDashboard &&
          !permissions.canViewMarketingDashboard
        ) {
          return false;
        }
      } else if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
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
  }, [permissions, gatingLoading, isModuleEnabled, billingMode, getFeatureAccessLevel, isLimitedPlan, isDemoBaseline, limitsLoading, currentPlan, isCommercialistaMode, hasMultipleCompanies]);

  useEffect(() => {
    if (!gatingLoading) {
      setMenuLoadingFallback(false);
      return;
    }
    setMenuLoadingFallback(false);
    const timer = window.setTimeout(() => setMenuLoadingFallback(true), 1500);
    return () => window.clearTimeout(timer);
  }, [gatingLoading]);

  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";
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
          isCollapsed ? "flex flex-col items-center gap-2.5 px-2 py-3" : "space-y-2.5 px-3 py-4",
        )}
      >
        <CompanyBrandHeader
          isCollapsed={isCollapsed}
          logoUrl={branding?.logo_url}
          platformName={effectiveBrand.platformName}
          homeTo={isCommercialistaMode ? withCommercialistaSearch("/azienda/controllo-gestione") : COMPANY_APP_HOME}
        />
        <CompanyContextSwitcher isCollapsed={isCollapsed} />
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
                  Vista commercialista
                </Badge>
                <p className="text-sm font-semibold leading-tight">{commercialistaCompanyName}</p>
                <p className="mt-1 text-xs text-blue-800">
                  Menu limitato a cantieri, magazzino, controllo gestione e finanza.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 h-8 w-full bg-white">
                  <Link to={commercialistaReturnTo}>Torna allo studio</Link>
                </Button>
              </div>
            )}
            {/* Cruscotto — standalone items */}
            {!isCommercialistaMode && <CruscottoNavItems filterNavItems={filterNavItems} />}

            {/* Separator: divide top-level items from collapsible sections */}
            {!isCommercialistaMode && <div className="mx-4 border-t border-sidebar-border/60" />}

            {/* Collapsible macro-areas — exclusive accordion.
                Durante il loading di plan/feature-flags mostriamo skeleton
                rows invece di nascondere voci (evita flicker e mancanza
                momentanea di sezioni a pagamento). */}
            {showMenuSkeleton ? (
              <div className="px-3 py-2 space-y-2" aria-label="Caricamento menu">
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
                        try { localStorage.setItem("sidebar_open_area", newId ?? ""); } catch { /* storage non disponibile — silenzioso */ }
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
                          aria-label="Espandi menu"
                        >
                          <PanelLeft className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Espandi menu</TooltipContent>
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
                          ? "Torna allo studio"
                          : `${profile?.first_name} ${profile?.last_name} — Il mio profilo`}
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
                        {isImpersonating ? "Torna a Admin" : "Esci"}
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
                        <p className="text-sm font-medium truncate">
                          {profile?.first_name} {profile?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {isImpersonating ? "Super Admin" : "Admin"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleSidebar}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                        aria-label="Comprimi menu a icone"
                        title="Comprimi a icone"
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
                            Impostazioni
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
                        {isImpersonating ? "Torna a Admin" : "Esci"}
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
    effectiveCompany,
    isImpersonating,
    multiCompanyAccesses,
    selectedMultiCompanyId,
    switchMultiCompany,
    role,
  } = useAuth();
  const permissions = usePermissions();
  const { isModuleEnabled } = useSubscriptionLimits({ includeUsageCounts: false });
  useCustomCSS();
  const navigate = useNavigate();
  const [supportOpen, setSupportOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [deferredRealtimeReady, setDeferredRealtimeReady] = useState(false);
  const { unreadCount, markAsRead } = useUnreadSupportCount({ enabled: deferredRealtimeReady });
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

  // AUTO-SWITCH: se l'URL contiene commercialistaMode=1 + commercialistaCompany=X,
  // assicuriamoci che effectiveCompany sia X (non l'azienda di sessione del commercialista).
  // Senza questo, il cruscotto mostra i dati sbagliati.
  //
  // EDGE CASE: se l'utente cambia azienda via CompanyContextSwitcher mentre è
  // in commercialistaMode, selectedMultiCompanyId diventa Y ≠ URL.X. Per evitare
  // loop di switch (URL forza X, switcher forza Y, ping-pong), aggiorniamo
  // l'URL alla nuova azienda invece di forzare lo switch indietro.
  useEffect(() => {
    if (!isCommercialistaMode || !commercialistaCompanyId) return;
    if (selectedMultiCompanyId === commercialistaCompanyId) return;
    const hasAccessUrl = multiCompanyAccesses.some(
      (a) => a.company_id === commercialistaCompanyId,
    );
    if (!hasAccessUrl) return; // azienda non ancora caricata in accessi (loading)

    // L'utente ha già selezionato un'altra azienda accountant via switcher?
    if (selectedMultiCompanyId) {
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

    switchMultiCompany(commercialistaCompanyId);
  }, [
    isCommercialistaMode,
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
      document.title = `${page} · ${companyName || "Edilizia in Cloud"}`;
    } else if (area) {
      document.title = `${area} · ${companyName || "Edilizia in Cloud"}`;
    } else {
      document.title = companyName || "Edilizia in Cloud";
    }
  }, [page, area, effectiveCompany?.name]);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Evita che badge realtime, polling e widget accessori competano con la
  // prima renderizzazione della pagina. Restano disponibili subito dopo il
  // primo idle frame, senza cambiare il comportamento utente.
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) {
      const idleId = win.requestIdleCallback(() => setDeferredRealtimeReady(true), { timeout: 1_200 });
      return () => win.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(() => setDeferredRealtimeReady(true), 700);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Preventivatore Verticalizzato — FASE 1.4
  // Gate onboarding vertical: se l'azienda corrente non ha ancora completato la
  // scelta del settore (onboarding_vertical_completed=false) forziamo il redirect
  // a /azienda/onboarding/vertical. Escludiamo:
  // - impersonation super_admin: il super_admin non deve subire onboarding del tenant;
  // - la pagina di onboarding stessa (evita loop).
  const onboardingVerticalDone =
    (effectiveCompany as unknown as { onboarding_vertical_completed?: boolean } | null)
      ?.onboarding_vertical_completed;
  useEffect(() => {
    if (isImpersonating) return;
    if (!effectiveCompany) return;
    if (onboardingVerticalDone !== false) return;
    if (location.pathname === "/azienda/onboarding/vertical") return;
    navigate("/azienda/onboarding/vertical", { replace: true });
  }, [isImpersonating, effectiveCompany, onboardingVerticalDone, location.pathname, navigate]);

  const [npsOpen, setNpsOpen] = useState(false);

  const showSupport = permissions.canViewTickets && isModuleEnabled("tickets");

  const handleOpenChat = () => {
    markAsRead();
    setSupportOpen(true);
  };
  
  return (
    <>
    <SidebarProvider>
      <div className="md:min-h-screen flex w-full md:h-auto h-[calc(100dvh-env(safe-area-inset-top))] overflow-hidden">
        <CompanySidebar />
        {/* NIENTE pt-safe qui: il top safe-area è già riservato UNA volta dal
            padding-top del body (html.capacitor body). Aggiungerlo qui lo
            raddoppierebbe → grande spazio bianco in alto su notch/Dynamic Island.
            Il root sopra usa h-[calc(100dvh - env(top))] così non straborda sotto
            (la bottom-nav resta visibile sopra l'home indicator). */}
        {/* relative: ancora la bottom-nav pillola (absolute) al fondo del
            container — overlay sul contenuto, niente fascia di layout. */}
        <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Skip to main content — keyboard / screen-reader accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:bg-background focus:text-foreground focus:border focus:rounded focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
          >
            Vai al contenuto principale
          </a>
          <QuickLoginReturnBanner />
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
          <header data-app-header className="h-14 border-b flex items-center px-2 md:px-3 gap-1.5 md:gap-4 bg-background">
            {/* Mobile: back arrow on sub-pages (no hamburger — bottom nav "App" replaces sidebar) */}
            {isSubPage && (
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 -ml-1 shrink-0" onClick={() => navigate(-1)} aria-label="Torna indietro">
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
              <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
                {AreaIcon && <AreaIcon className="h-3.5 w-3.5" />}
                <span className="text-xs font-medium">{area}</span>
                {page && (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-xs font-medium text-foreground">{page}</span>
                  </>
                )}
              </nav>
            )}

            <div className="hidden md:block flex-1" />
            {/* ViewAsDropdown — visibile SOLO durante impersonazione super_admin */}
            <ViewAsDropdown />
            {/* v8.6.72 — Search Command Palette nascosta su mobile: spazio header limitato,
                la ricerca dentro l'App grid + le ricerche per-pagina coprono i casi mobile. */}
            <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 hidden md:inline-flex" onClick={() => setCommandOpen(true)} title="Cerca (⌘K)" aria-label="Cerca (⌘K)">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
            {/* v8.6.70 — Rotellina Impostazioni (mobile): apre l'hub griglia
                /azienda/impostazioni (SettingsIndexRoute → SettingsMobileHub
                su mobile, redirect a mio-profilo su desktop).
                Nascosta in modalità commercialista — non deve accedere alle
                impostazioni dell'azienda cliente. */}
            {!isCommercialistaMode && (
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 shrink-0 md:hidden"
                onClick={() => navigate("/azienda/impostazioni")}
                title="Impostazioni"
                aria-label="Impostazioni"
              >
                <SettingsIcon className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {/* AI: azioni proposte che richiedono OK utente (MP-AIE-03)
                v8.6.69 — Nascoste su mobile (icona inbox+badge); restano su md+.
                Motivazione UX: header mobile sovraffollato, l'utente accede
                alle proposte da pagina dedicata. */}
            {deferredRealtimeReady && (
              <div className="hidden md:block">
                <ActionProposalsBadge />
              </div>
            )}
            {/* v8.6.90 — Changelog "Cosa c'è di nuovo" con badge non-letti
                v8.6.72 — Nascosto su mobile per liberare header.
                Resta accessibile dalle impostazioni / drawer admin. */}
            <div className="hidden md:block">
              <ChangelogDrawer />
            </div>
            {/* v8.6.70 — Silvio chat header button (solo mobile).
                Desktop usa il SilvioFAB in basso a destra; su mobile invece
                serve un accesso veloce in alto perché lo schermo è ridotto. */}
            {deferredRealtimeReady && (
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 shrink-0 md:hidden"
                onClick={() => window.dispatchEvent(new Event("silvio:open-chat"))}
                aria-label="Apri chat con Silvio"
                title="Silvio"
              >
                <Brain className="h-4 w-4 text-orange-600" aria-hidden="true" />
              </Button>
            )}
            {/* v8.6.71 — Chat Team header button (solo mobile).
                Sostituisce SilvioBellPopover su mobile (che resta su desktop
                accanto alla campanella notifiche). Mostra badge con il numero
                di messaggi chat non letti. Tap → /azienda/chat. */}
            {deferredRealtimeReady && (
              <MobileChatTeamButton />
            )}
            {/* Silvio: cose da sapere proattive — NASCOSTA su mobile (v8.6.71)
                per liberare spazio header. Resta su desktop dove c'è più posto. */}
            {deferredRealtimeReady && (
              <div className="hidden md:block">
                <SilvioBellPopover />
              </div>
            )}
            {deferredRealtimeReady && (
              <>
                <NotificationsRealtime />
                <NotificationsBellPopover />
              </>
            )}
            {showSupport && (
              <Button variant="outline" size="sm" className="relative hidden sm:flex bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500 hover:border-emerald-600 shadow-md hover:shadow-lg transition-shadow" onClick={() => setChannelDialogOpen(true)}>
                <HeadphonesIcon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Assistenza</span>
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
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 bg-muted/30 pb-28 md:pb-6" id="main-content" aria-label="Contenuto principale">
            <ErrorBoundary title="Errore nel caricamento della pagina">
              {/* Skeleton (non spinner) al cambio pagina: percezione di velocità sul primo paint mobile */}
              <Suspense fallback={
                <div className="space-y-4" aria-busy="true" aria-label="Caricamento pagina">
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
                  <Outlet />
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
          <ErrorBoundary key={location.pathname} title="Errore navigazione mobile">
            <MobileBottomNav />
          </ErrorBoundary>
        </div>
      </div>
      {showSupport && (
        <>
          <SupportChannelDialog
            open={channelDialogOpen}
            onOpenChange={setChannelDialogOpen}
            onOpenChat={handleOpenChat}
          />
          <SupportChatSheet open={supportOpen} onOpenChange={setSupportOpen} />
        </>
      )}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      {deferredRealtimeReady && <PWAInstallBanner />}
      <NpsModal open={npsOpen} onClose={() => setNpsOpen(false)} />
      {/* Silvio FAB — visibile da tablet/desktop; su mobile si usa la voce Chat */}
      {/* Boundary dedicato: un errore dentro Silvio (FAB/chat sheet) non deve più
          buttare giù l'INTERA area azienda con la pagina "Errore nell'area azienda" */}
      {deferredRealtimeReady && (
        <ErrorBoundary title="Silvio non è al momento disponibile">
          <SilvioFAB />
        </ErrorBoundary>
      )}
    </SidebarProvider>
    </>
  );
}
