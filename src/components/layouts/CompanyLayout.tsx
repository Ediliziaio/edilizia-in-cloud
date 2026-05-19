import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { navigateToSubdomain } from "@/utils/subdomainNav";
import { supabase } from "@/integrations/supabase/client";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useBranding } from "@/hooks/useBranding";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useCustomCSS } from "@/hooks/useCustomCSS";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { 
  HeadphonesIcon,
  Settings,
  FolderOpen,
  LogOut,
  AlertTriangle,
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
  Loader2,
  AtSign,
  Banknote,
  QrCode,
  Settings as SettingsIcon,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

import { LifecycleNotificationsBanner } from "@/components/company/LifecycleNotificationsBanner";
import { SilvioBellPopover } from "@/components/silvio/SilvioBellPopover";
// MP-AIE-03: badge realtime con conteggio proposte azione AI pending
import { ActionProposalsBadge } from "@/components/ai/ActionProposals/ActionProposalsBadge";
import { ChangelogDrawer } from "@/components/changelog/ChangelogDrawer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { macroAreas, type NavItem, type MacroArea } from "@/lib/sidebarConfig";
import { getSmartCruscottoPath } from "@/lib/dashboardRouting";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { NotificationsBellPopover } from "@/components/notifications/NotificationsBellPopover";
import { useMyTaskCount } from "@/hooks/useMyTaskCount";

import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PWAInstallBanner } from "@/components/ui/PWAInstallBanner";
import { NpsModal } from "@/components/onboarding/NpsModal";
import { SilvioFAB } from "@/components/silvio/SilvioFAB";

const MultiCompanySwitcher = memo(function MultiCompanySwitcher() {
  const { role, multiCompanyAccesses, selectedMultiCompanyId, switchMultiCompany } = useAuth();

  if (role !== "multi_company_user" || multiCompanyAccesses.length <= 1) return null;

  return (
    <div className="bg-muted/50 border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <select
          value={selectedMultiCompanyId || ""}
          onChange={(e) => switchMultiCompany(e.target.value)}
          className="text-sm bg-transparent border rounded px-2 py-1 flex-1 max-w-xs"
        >
          {multiCompanyAccesses.map((access) => (
            <option key={access.company_id} value={access.company_id}>
              {access.company?.name || access.company_id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});

const ImpersonationBanner = memo(function ImpersonationBanner() {
  const { isImpersonating, impersonatedCompany, exitImpersonation } = useAuth();
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

  // Fallback testuale quando la fetch di impersonatedCompany è ancora in corso
  // (evita il flash con stringa vuota "Stai visualizzando come:  " che confondeva
  // l'utente su "quale azienda sto impersonando?").
  const label = impersonatedCompany?.name ?? "caricamento azienda…";

  return (
    <div className="bg-warning text-warning-foreground px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium text-sm truncate">
          <span className="hidden sm:inline">Stai visualizzando come: </span><strong>{label}</strong>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SuperAdminCompanySwitcher />
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

// Macro-area collapsible section component
const SCOPRI_LOCKED_ROUTES = [
  "/azienda/fatturazione",
  "/azienda/documenti",
  "/azienda/tesoreria",
  "/azienda/scadenzario",
  "/azienda/previsionale",
  "/azienda/marketing",
  "/azienda/sms-marketing",
  "/azienda/personale",
  "/azienda/magazzino",
  "/azienda/giornale-lavori",
  "/azienda/subappaltatori",
  "/azienda/sicurezza-cantiere",
  "/azienda/render",
  "/azienda/agenti-ai",
  "/azienda/automazioni",
];

// v8.6.93 — Module-level constants (no re-create per render)
const FULL_PLAN_SLUGS = new Set(["starter", "pro", "enterprise"]);
const CORE_MODULES_COUNT = 7;

function MacroAreaCollapsible({ area, visibleItems, pathname, open, onOpenChange, isScopriPlan = false, isFeaturePreview, isModuleDemo }: {
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
    // "Fatture" è attiva per /azienda/documenti e tutti i ?tipo=, ma NON per sottopagine autonome
    if (url === "/azienda/documenti") {
      const autonomousSubpaths = ["/azienda/documenti/anagrafiche", "/azienda/documenti/incassi", "/azienda/documenti/cassetto-sdi", "/azienda/documenti/report"];
      if (autonomousSubpaths.some(p => pathname === p || pathname.startsWith(p + "/"))) return false;
      return pathname === "/azienda/documenti" || pathname.startsWith("/azienda/documenti/");
    }
    if (pathname === url) return true;
    if (pathname.startsWith(url + "/")) {
      const hasMoreSpecific = visibleItems.some(
        other => other.url !== url && other.url.startsWith(url + "/") &&
          (pathname === other.url || pathname.startsWith(other.url + "/"))
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
                  to={item.url}
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
                to={item.url}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg mx-1.5 px-3 py-2 text-sm transition-colors",
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
                className="w-52 p-1.5 bg-sidebar border border-sidebar-border shadow-lg rounded-lg"
              >
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
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
                          to={item.url}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
          "flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-150 group",
          (open || hasActiveChild)
            ? "text-sidebar-primary/80"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90"
        )}>
          <span className="flex items-center gap-2">
            <AreaIcon className={cn("h-4 w-4 transition-colors duration-150", (open || hasActiveChild) && "text-sidebar-primary")} />
            {area.title}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-60 group-hover:opacity-100", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-sidebar-slide-down data-[state=closed]:animate-sidebar-slide-up">
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
                          to={item.url}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent",
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
  const permissions = usePermissions();
  const { role } = useAuth();
  const items = filterNavItems(macroAreas.find(a => a.id === "area_cruscotto")?.items ?? []);

  return (
    <SidebarGroup className="py-2">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isTaskItem = item.url === "/azienda/attivita";
            const itemUrl =
              item.url === "/azienda/cruscotto"
                ? (permissions.isLoading ? item.url : getSmartCruscottoPath(permissions, role))
                : item.url;
            const badgeCount = isTaskItem ? (taskCounts?.total ?? 0) : 0;
            const badgeVariant = isTaskItem && taskCounts?.overdue ? "destructive" : isTaskItem && taskCounts?.dueToday ? "warning" : "secondary";

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <NavLink
                    to={itemUrl}
                    end={itemUrl === "/azienda"}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground/90 transition-all duration-150 hover:bg-muted hover:text-foreground border-l-2 border-l-transparent"
                    activeClassName="bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-sidebar-primary"
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium">{item.title}</span>
                    {isTaskItem && badgeCount > 0 && (
                      <Badge
                        variant={badgeVariant === "destructive" ? "destructive" : "secondary"}
                        className={cn(
                          "ml-auto h-5 min-w-[20px] px-1.5 text-[10px] font-bold",
                          badgeVariant === "warning" && "bg-warning/15 text-warning border-warning/30"
                        )}
                      >
                        {badgeCount}
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
        { to: "/azienda/impostazioni/sedi",          label: "Sedi",              icon: <MapPin className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/branding",      label: "White-Label",       icon: <Paintbrush className="h-4 w-4" />,   visible: isAdmin },
        // v8.6.59 — Solo "Piano abbonamento": "Crediti & Saldo" è ora il tab
        // "Portafoglio" interno alla dashboard Abbonamento (no duplicazione).
        { to: "/azienda/impostazioni/abbonamento",   label: "Piano abbonamento", icon: <Wallet className="h-4 w-4" />,       visible: isAdmin },
      ],
    },
    {
      label: "Cantieri & Costi",
      items: [
        { to: "/azienda/impostazioni/stati-ordine",        label: "Stati ordine",        icon: <ListOrdered className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/categorie-costi",     label: "Categorie costi",     icon: <FolderOpen className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/fornitori",           label: "Fornitori",           icon: <Truck className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/qr-codici",           label: "QR & Codici",         icon: <QrCode className="h-4 w-4" />,      visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/automazioni-finanza", label: "Automazioni finanza", icon: <RefreshCw className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsOrders },
      ],
    },
    {
      label: "Preventivi & Listino",
      items: [
        { to: "/azienda/impostazioni/listino",              label: "Listino prodotti",    icon: <Package className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/tariffe",              label: "Tariffe aziendali",   icon: <Wrench className="h-4 w-4" />,     visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/listino-manutenzione", label: "Listino Manutenzione", icon: <ClipboardList className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/finanziamenti",        label: "Finanziamenti",        icon: <Banknote className="h-4 w-4" />,   visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/margini",              label: "Preventivi & Margini",icon: <TrendingUp className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/scontistica",          label: "Regole scontistica",  icon: <Percent className="h-4 w-4" />,    visible: isAdmin },
        { to: "/azienda/impostazioni/materiali-preventivi",label: "Materiali preventivi",icon: <FileStack className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/template-preventivi", label: "Template offerte",    icon: <Paintbrush className="h-4 w-4" />, visible: isAdmin || permissions.canEditSettingsCustomization },
        { to: "/azienda/impostazioni/sopralluoghi",        label: "Impostazioni Sopralluoghi", icon: <ClipboardList className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/firma-elettronica",   label: "Firma Elettronica",   icon: <FileSignature className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/bundle",              label: "Bundle & Pacchetti",   icon: <Package className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsOrders },
      ],
    },
    {
      label: "CRM & Vendite",
      items: [
        { to: "/azienda/impostazioni/tag",                 label: "Tag",                  icon: <Tag className="h-4 w-4" />,              visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/campi-personalizzati",label: "Campi personalizzati", icon: <SlidersHorizontal className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/sequenze",            label: "Sequenze",             icon: <GitBranch className="h-4 w-4" />,         visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/form-builder",        label: "Form & UTM",           icon: <FileText className="h-4 w-4" />,          visible: isAdmin || permissions.canEditSettingsCustomization },
      ],
    },
    {
      label: "Marketing",
      items: [
        { to: "/azienda/impostazioni/calendari",  label: "Calendari marketing", icon: <CalendarDays className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/lead-forms", label: "Lead Facebook",       icon: <FormInput className="h-4 w-4" />,    visible: isAdmin },
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
        { to: "/azienda/impostazioni/integrazioni",   label: "Integrazioni",   icon: <Plug className="h-4 w-4" />,   visible: isAdmin },
        { to: "/azienda/impostazioni/api",            label: "API Platform",   icon: <Key className="h-4 w-4" />,    visible: isAdmin },
        { to: "/azienda/impostazioni/webhook",        label: "Webhook",        icon: <Globe className="h-4 w-4" />,  visible: isAdmin },
        { to: "/azienda/impostazioni/dominio-email",  label: "Dominio Email",  icon: <AtSign className="h-4 w-4" />, visible: isAdmin },
        { to: "/azienda/impostazioni/numeri-telefono",label: "Numeri Virtuali",icon: <Phone className="h-4 w-4" />,  visible: isAdmin },
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
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation, role } = useAuth();
  // usePermissions è già "viewAs-aware": quando `viewAsRole` è attivo
  // restituisce i permessi REALI dell'utente target (letti da staff_permissions),
  // così la sidebar riflette esattamente quello che vedrebbe quell'utente.
  const permissions = usePermissions();
  const { isModuleEnabled, isScopriPlan, currentPlan, includedModules, isLoading: limitsLoading } = useSubscriptionLimits({ includeUsageCounts: false });
  const { isFeatureEnabled, isFeaturePreview, getFeatureAccessLevel, isLoading: flagsLoading } = useFeatureFlags();

  // v8.6.83 — "Piano limitato": ha meno di tutti i 7 moduli core OPPURE
  // slug NON è in FULL_PLAN_SLUGS. Per questi piani le voci moduleKey non
  // incluse vengono mostrate come DEMO invece di nascoste.
  // (FULL_PLAN_SLUGS è module-level constant — vedi top of file)
  const isFullBySlug = !!currentPlan?.slug && FULL_PLAN_SLUGS.has(currentPlan.slug);
  const isLimitedPlan = !isFullBySlug && (
    (includedModules.length > 0 && includedModules.length < CORE_MODULES_COUNT) ||
    (!!currentPlan?.slug && !FULL_PLAN_SLUGS.has(currentPlan.slug))
  );

  /** Modulo in modalità demo: non incluso ma piano è "limited" → preview. */
  const isModuleDemo = (moduleKey: string): boolean => {
    if (isModuleEnabled(moduleKey as never)) return false;
    return isLimitedPlan;
  };
  // Mostriamo skeleton finché plan + feature flags non sono risolti: con
  // `isModuleEnabled` fail-closed, altrimenti la sidebar flickererebbe a vuoto.
  const gatingLoading = limitsLoading || flagsLoading;
  const { branding } = useBranding();
  const { effectiveBrand } = useBrandSettings();
  const { mode: billingMode } = useBillingMode();
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/azienda/impostazioni");
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { setOpenMobile } = useSidebar();

  // Close mobile sidebar on every navigation
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  // Exclusive accordion: only one macro-area open at a time
  const findActiveAreaId = useCallback((path: string): string | null => {
    let bestAreaId: string | null = null;
    let bestUrlLength = 0;
    for (const area of macroAreas) {
      if (area.id === "area_cruscotto") continue;
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
  }, []);

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

  // Apply CSS variables for brand colors
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveBrand.isWhiteLabel) {
      root.style.setProperty("--brand-primary", effectiveBrand.primaryColor);
      root.style.setProperty("--brand-secondary", effectiveBrand.secondaryColor);
      root.style.setProperty("--brand-accent", effectiveBrand.accentColor);
      root.style.setProperty("--brand-text-on-primary", effectiveBrand.textOnPrimary);
      if (effectiveBrand.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
        link.href = effectiveBrand.faviconUrl;
      }
      if (effectiveBrand.platformName) {
        document.title = effectiveBrand.platformName;
      }
    } else {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-text-on-primary");
    }
    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-text-on-primary");
    };
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
      if (key === "billing_external") return billingMode === "external" ? "enabled" : "hidden";
      if (key === "billing_native") return billingMode === "native" ? "enabled" : "hidden";
      const lvl = getFeatureAccessLevel(key);
      if (lvl === "enabled") return "enabled";
      if (lvl === "preview") return "preview";
      return "hidden";
    };

    if (permissions.isLoading) {
      return items.filter((item) => {
        if (!item.featureKey) return true;
        return passesFeatureGate(item.featureKey) !== "hidden";
      });
    }
    return items.filter((item) => {
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
      // Module gate
      if (item.moduleKey) {
        if (!isModuleEnabled(item.moduleKey)) {
          // Tre casi: limited plan → mostra in demo;
          //           durante loading plan → tieni visibile (evita flicker vuoto);
          //           full plan caricato → nascondi davvero.
          if (!isLimitedPlan && !limitsLoading) return false;
        }
      }
      // Feature gate
      if (item.featureKey) {
        const state = passesFeatureGate(item.featureKey);
        if (state === "hidden") return false;
      }
      return true;
    });
  }, [permissions, isModuleEnabled, billingMode, getFeatureAccessLevel, isLimitedPlan, limitsLoading]);

  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";

  // Su mobile la navigazione è gestita dalla bottom nav + App Grid — niente sidebar
  if (isMobile) return null;

  return (
    <Sidebar className="border-r" collapsible="icon">
      <div
        className="flex h-14 items-center border-b border-sidebar-border px-4 overflow-hidden bg-sidebar-accent/40"
        style={effectiveBrand.isWhiteLabel ? { backgroundColor: effectiveBrand.primaryColor, color: effectiveBrand.textOnPrimary } : undefined}
      >
        {!isCollapsed && (
          <Link to="/azienda" className="flex items-center gap-2">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={effectiveCompany?.name || "Logo"} className="h-8 max-h-8 object-contain" />
            ) : effectiveCompany?.logo_url ? (
              <img src={effectiveCompany.logo_url} alt={effectiveCompany.name} className="h-8 max-h-8 object-contain" />
            ) : effectiveBrand.platformName ? (
              <span className="font-semibold text-sm truncate">{effectiveBrand.platformName}</span>
            ) : (
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
            )}
          </Link>
        )}
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
            {/* Cruscotto — standalone items */}
            <CruscottoNavItems filterNavItems={filterNavItems} />

            {/* Separator: divide top-level items from collapsible sections */}
            <div className="mx-4 border-t border-sidebar-border/60" />

            {/* Collapsible macro-areas — exclusive accordion.
                Durante il loading di plan/feature-flags mostriamo skeleton
                rows invece di nascondere voci (evita flicker e mancanza
                momentanea di sezioni a pagamento). */}
            {gatingLoading ? (
              <div className="px-3 py-2 space-y-2" aria-label="Caricamento menu">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : (
              macroAreas
                .filter(a => a.id !== "area_cruscotto")
                .map(area => {
                  const visibleItems = filterNavItems(area.items);
                  if (visibleItems.length === 0) return null;
                  return (
                    <MacroAreaCollapsible
                      key={area.id}
                      area={area}
                      visibleItems={visibleItems}
                      pathname={location.pathname}
                      open={openAreaId === area.id}
                      isScopriPlan={isScopriPlan}
                      isFeaturePreview={isFeaturePreview}
                      isModuleDemo={isModuleDemo}
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
                        <Link to="/azienda/impostazioni/mio-profilo">
                          <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-sidebar-border hover:ring-sidebar-primary transition-colors">
                            <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
                            <AvatarFallback className="bg-sidebar-primary/10 text-sidebar-primary text-xs font-semibold">
                              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {profile?.first_name} {profile?.last_name} — Il mio profilo
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
                    </div>
                    <div className="flex flex-col gap-0.5">
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
  const { effectiveCompany, isImpersonating } = useAuth();
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
      <div className="min-h-screen md:min-h-screen flex w-full md:h-auto h-[100dvh] overflow-hidden">
        <CompanySidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
          <MultiCompanySwitcher />
          <AnnouncementBanner />
          <SubscriptionBanner />
          <header className="h-14 border-b flex items-center px-3 gap-2 md:gap-4 bg-background">
            {/* Mobile: back arrow on sub-pages (no hamburger — bottom nav "App" replaces sidebar) */}
            {isSubPage && (
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 -ml-1 shrink-0" onClick={() => navigate(-1)} aria-label="Torna indietro">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            {/* Desktop: sidebar trigger */}
            <SidebarTrigger className="hidden md:flex" />

            {/* Mobile: current page title */}
            <span className="md:hidden font-semibold text-base truncate flex-1">
              {page || area || effectiveCompany?.name || ""}
            </span>

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
            <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0" onClick={() => setCommandOpen(true)} title="Cerca (⌘K)" aria-label="Cerca (⌘K)">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
            {/* v8.6.70 — Rotellina Impostazioni (mobile): apre l'hub griglia
                /azienda/impostazioni (SettingsIndexRoute → SettingsMobileHub
                su mobile, redirect a mio-profilo su desktop). */}
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
            {/* AI: azioni proposte che richiedono OK utente (MP-AIE-03)
                v8.6.69 — Nascoste su mobile (icona inbox+badge); restano su md+.
                Motivazione UX: header mobile sovraffollato, l'utente accede
                alle proposte da pagina dedicata. */}
            {deferredRealtimeReady && (
              <div className="hidden md:block">
                <ActionProposalsBadge />
              </div>
            )}
            {/* v8.6.90 — Changelog "Cosa c'è di nuovo" con badge non-letti */}
            <ChangelogDrawer />
            {/* Silvio: cose da sapere proattive */}
            {deferredRealtimeReady && <SilvioBellPopover />}
            {deferredRealtimeReady && <NotificationsBellPopover />}
            {showSupport && (
              <Button variant="outline" size="sm" className="relative hidden sm:flex" onClick={() => setChannelDialogOpen(true)}>
                <HeadphonesIcon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Assistenza</span>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 sm:ml-2 h-5 min-w-[20px] px-1 flex items-center justify-center text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            )}
            <span className="hidden md:block text-sm text-muted-foreground truncate max-w-[150px]">
              {effectiveCompany?.name}
            </span>
          </header>
          <OfflineBanner />
          {deferredRealtimeReady && <LifecycleNotificationsBanner />}
          <main className="flex-1 overflow-y-auto p-3 md:p-6 bg-muted/30 pb-4 md:pb-6" id="main-content" aria-label="Contenuto principale">
            <ErrorBoundary title="Errore nel caricamento della pagina">
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }>
                <Outlet />
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
      {deferredRealtimeReady && <SilvioFAB />}
    </SidebarProvider>
    </>
  );
}
