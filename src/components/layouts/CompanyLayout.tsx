import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useBranding } from "@/hooks/useBranding";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { 
  HeadphonesIcon,
  Settings,
  FolderOpen,
  LogOut,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Package,
  ListOrdered,
  Truck,
  Users,
  UserCheck,
  HardHat,
  Key,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Plug,
  Briefcase,
  Megaphone,
  Tag,
  SlidersHorizontal,
  GitBranch,
  CalendarDays,
  Wallet,
  Shield,
  Paintbrush,
  FileStack,
  FileText,
  RefreshCw,
  Bell,
  Search,
  Globe,
  Phone,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useMemo, useState, useEffect, useCallback } from "react";
import { SupportChatSheet } from "@/components/layouts/SupportChatSheet";
import { SupportChannelDialog } from "@/components/layouts/SupportChannelDialog";
import { useUnreadSupportCount } from "@/hooks/useUnreadSupportCount";
import { Badge } from "@/components/ui/badge";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { AnnouncementBanner } from "@/components/company/AnnouncementBanner";

import { LifecycleNotificationsBanner } from "@/components/company/LifecycleNotificationsBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { macroAreas, type NavItem, type MacroArea } from "@/lib/sidebarConfig";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

import { CommandPalette } from "@/components/CommandPalette";

function MultiCompanySwitcher() {
  const { role, multiCompanyAccesses, selectedMultiCompanyId, switchMultiCompany, effectiveCompany } = useAuth();

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
}

function ImpersonationBanner() {
  const { isImpersonating, impersonatedCompany, exitImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  const handleExit = () => {
    exitImpersonation();
    navigate("/admin/aziende");
  };

  return (
    <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-medium">
          Stai visualizzando come: <strong>{impersonatedCompany?.name}</strong>
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExit}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Torna a Admin
      </Button>
    </div>
  );
}

// Macro-area collapsible section component
function MacroAreaCollapsible({ area, visibleItems, pathname, open, onOpenChange }: {
  area: MacroArea;
  visibleItems: NavItem[];
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !(prev[label] ?? true) }));
  };

  const isGroupOpen = (label: string, items: NavItem[]) => {
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
                    "flex items-center justify-center",
                    hasActiveChild && "bg-primary/10 text-primary"
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
                      return (
                        <NavLink
                          key={item.url}
                          to={item.url}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.title}</span>
                          {item.isBeta && (
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
                            isOpen={isGroupOpen(group.label, group.items)}
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
      <SidebarGroup className={cn("py-0 rounded-lg mx-1.5 transition-colors duration-200", open && "bg-sidebar-accent")}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-foreground transition-colors group">
          <span className="flex items-center gap-2">
            <AreaIcon className="h-3.5 w-3.5" />
            {area.title}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
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
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                            active && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          <ItemIcon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.isBeta && (
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
                        isOpen={isGroupOpen(group.label, group.items)}
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

function CompanySidebar() {
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation, role } = useAuth();
  const permissions = usePermissions();
  const { isModuleEnabled } = useSubscriptionLimits();
  const { isFeatureEnabled } = useFeatureFlags();
  const { branding } = useBranding();
  const { effectiveBrand } = useBrandSettings();
  const { mode: billingMode } = useBillingMode();
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/azienda/impostazioni");
  const isAdmin = role === "company_admin" || role === "super_admin";

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
    } catch {}
    return findActiveAreaId(location.pathname);
  });

  useEffect(() => {
    const active = findActiveAreaId(location.pathname);
    if (active && active !== openAreaId) {
      setOpenAreaId(active);
      try { localStorage.setItem("sidebar_open_area", active); } catch {}
    }
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
  
  const handleLogoutOrExit = () => {
    if (isImpersonating) {
      exitImpersonation();
      navigate("/admin/aziende");
    } else {
      signOut();
    }
  };

  const filterNavItems = (items: NavItem[]) => {
    return items.filter((item) => {
      if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
        return false;
      }
      if (item.moduleKey && !isModuleEnabled(item.moduleKey)) {
        return false;
      }
      if (item.featureKey === "billing_external" && billingMode !== "external") return false;
      if (item.featureKey === "billing_native" && billingMode !== "native") return false;
      if (item.featureKey && item.featureKey !== "billing_external" && item.featureKey !== "billing_native" && !isFeatureEnabled(item.featureKey)) {
        return false;
      }
      return true;
    });
  };

  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";

  return (
    <Sidebar className="border-r" collapsible="icon">
      <div
        className="flex h-14 items-center border-b px-4 overflow-hidden"
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
          <>
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
              <h2 className="text-lg font-semibold px-3 mb-4">Impostazioni</h2>
            </div>

            <SidebarGroup>
              <SidebarGroupLabel>La mia azienda</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/profilo" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Building2 className="h-4 w-4" /><span>Profilo aziendale</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/catalogo" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Package className="h-4 w-4" /><span>Catalogo articoli</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Gestione ordini</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/stati-ordine" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <ListOrdered className="h-4 w-4" /><span>Stati ordine</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/fornitori" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Truck className="h-4 w-4" /><span>Fornitori</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/categorie-costi" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <FolderOpen className="h-4 w-4" /><span>Categorie costi</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/automazioni-finanza" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <RefreshCw className="h-4 w-4" /><span>Automazioni Finanza</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Marketing e Vendita</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/tag" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Tag className="h-4 w-4" /><span>Tag</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/campi-personalizzati" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <SlidersHorizontal className="h-4 w-4" /><span>Campi personalizzati</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/sequenze" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <GitBranch className="h-4 w-4" /><span>Sequenze</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/calendari" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <CalendarDays className="h-4 w-4" /><span>Calendari</span>
                      </NavLink>
                    </SidebarMenuButton>
                   </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/materiali-preventivi" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <FileStack className="h-4 w-4" /><span>Materiali Preventivi</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/template-preventivi" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Paintbrush className="h-4 w-4" /><span>Template Offerte</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/form-builder" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <FileText className="h-4 w-4" /><span>Form & UTM</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Utenti</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/utenti" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Users className="h-4 w-4" /><span>Utenti</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Team</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/venditori" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <UserCheck className="h-4 w-4" /><span>Venditori</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/staff" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <HardHat className="h-4 w-4" /><span>Staff / Operai</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/team" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Users className="h-4 w-4" /><span>Team</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            <SidebarGroup>
              <SidebarGroupLabel>Sicurezza e Privacy</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/sicurezza" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Key className="h-4 w-4" /><span>Cambio password</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/privacy" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Shield className="h-4 w-4" /><span>Privacy & GDPR</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAdmin && (
                    <>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/azienda/impostazioni/security-dashboard" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                            <Shield className="h-4 w-4" /><span>Security Dashboard</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/azienda/impostazioni/attivita" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                            <ScrollText className="h-4 w-4" /><span>Registro attività</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Integrazioni & Crediti</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/integrazioni" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Plug className="h-4 w-4" /><span>Integrazioni</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/crediti" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Wallet className="h-4 w-4" /><span>Crediti & Saldo</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/api" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Key className="h-4 w-4" /><span>API Platform</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/webhook" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Globe className="h-4 w-4" /><span>Webhook</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/numeri-telefono" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Phone className="h-4 w-4" /><span>Numeri Virtuali</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/branding" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Paintbrush className="h-4 w-4" /><span>White-Label</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/abbonamento" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <Wallet className="h-4 w-4" /><span>Abbonamento</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/fatturazione" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <FileText className="h-4 w-4" /><span>Fatturazione</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        ) : (
          <>
            {/* Cruscotto — standalone items */}
            <SidebarGroup className="pb-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  {filterNavItems(macroAreas.find(a => a.id === "area_cruscotto")?.items ?? []).map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          end={item.url === "/azienda"}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          activeClassName="bg-primary/10 text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="font-medium">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* 5 collapsible macro-areas — exclusive accordion */}
            {macroAreas
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
                    onOpenChange={(isOpen) => {
                      const newId = isOpen ? area.id : null;
                      setOpenAreaId(newId);
                      try { localStorage.setItem("sidebar_open_area", newId ?? ""); } catch {}
                    }}
                  />
                );
              })}
            
            <div className="mt-auto border-t">
              {permissions.canViewSettings && (
                <div className="px-2 pt-3">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="Impostazioni">
                        <NavLink
                          to="/azienda/impostazioni"
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          activeClassName="bg-muted text-foreground font-medium"
                        >
                          <Settings className="h-4 w-4" />
                          <span>Impostazioni</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </div>
              )}
              <div className={cn("p-4", isCollapsed && "p-2 flex flex-col items-center gap-2")}>
                {isCollapsed ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Avatar className="h-8 w-8 cursor-default">
                          <AvatarFallback className="bg-muted text-xs">
                            {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {profile?.first_name} {profile?.last_name}
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
                  <>
                    <div className="flex items-center gap-3 mb-4 px-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted text-xs">
                          {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {profile?.first_name} {profile?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {isImpersonating ? "Super Admin (Impersonando)" : "Admin"}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
                      onClick={handleLogoutOrExit}
                    >
                      <LogOut className="h-4 w-4" />
                      {isImpersonating ? "Torna a Admin" : "Esci"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

export function CompanyLayout() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const { isModuleEnabled } = useSubscriptionLimits();
  const { effectiveBrand } = useBrandSettings();
  const navigate = useNavigate();
  const [supportOpen, setSupportOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { unreadCount, markAsRead } = useUnreadSupportCount();
  const { unreadCount: notifUnreadCount } = useNotifications();
  const { area, areaIcon: AreaIcon, page } = useBreadcrumb();

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

  const showSupport = permissions.canViewTickets && isModuleEnabled("tickets");

  const handleOpenChat = () => {
    markAsRead();
    setSupportOpen(true);
  };
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CompanySidebar />
        <div className="flex-1 flex flex-col">
          <QuickLoginReturnBanner />
          <ImpersonationBanner />
          <MultiCompanySwitcher />
          <AnnouncementBanner />
          <SubscriptionBanner />
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            {area && (
              <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setCommandOpen(true)} title="Cerca (⌘K)">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setNotificationsPanelOpen(true)} title="Notifiche">
              <Bell className="h-4 w-4" />
              {notifUnreadCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-bold">
                  {notifUnreadCount > 99 ? "99+" : notifUnreadCount}
                </Badge>
              )}
            </Button>
            {showSupport && (
              <Button variant="outline" size="sm" className="relative" onClick={() => setChannelDialogOpen(true)}>
                <HeadphonesIcon className="h-4 w-4 mr-2" />
                Assistenza
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] px-1 flex items-center justify-center text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {effectiveCompany?.name}
            </span>
          </header>
          <OfflineBanner />
          <LifecycleNotificationsBanner />
          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
          {!effectiveBrand.hidePoweredBy && (
            <footer className="text-center py-2 text-xs text-muted-foreground border-t bg-background">
              Powered by EdiliziaInCloud
            </footer>
          )}
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
      <NotificationsPanel
        open={notificationsPanelOpen}
        onOpenChange={setNotificationsPanelOpen}
      />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  );
}
