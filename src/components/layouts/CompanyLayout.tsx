import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
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
  Plug,
  Briefcase,
  Megaphone,
  Tag,
  SlidersHorizontal,
  GitBranch,
  CalendarDays,
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
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useMemo, useState } from "react";
import { SupportChatSheet } from "@/components/layouts/SupportChatSheet";
import { SupportChannelDialog } from "@/components/layouts/SupportChannelDialog";
import { useUnreadSupportCount } from "@/hooks/useUnreadSupportCount";
import { Badge } from "@/components/ui/badge";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { AnnouncementBanner } from "@/components/company/AnnouncementBanner";

import { LifecycleNotificationsBanner } from "@/components/company/LifecycleNotificationsBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { internalNavItems, marketingNavItems, cruscottoNavItem, type NavItem } from "@/lib/sidebarConfig";

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

function CompanySidebar() {
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation, role } = useAuth();
  const permissions = usePermissions();
  const { isModuleEnabled } = useSubscriptionLimits();
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/azienda/impostazioni");
  const isAdmin = role === "company_admin" || role === "super_admin";
  
  const handleLogoutOrExit = () => {
    if (isImpersonating) {
      exitImpersonation();
      navigate("/admin/aziende");
    } else {
      signOut();
    }
  };

  const isMarketingRoute = location.pathname.startsWith("/azienda/marketing");
  const isCruscottoRoute = location.pathname.startsWith("/azienda/cruscotto");

  const filterNavItems = (items: NavItem[]) => {
    const messagingEnabled = (effectiveCompany as any)?.messaging_beta_enabled === true;
    return items.filter((item) => {
      if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
        return false;
      }
      if (item.moduleKey && !isModuleEnabled(item.moduleKey)) {
        return false;
      }
      if (item.isBeta && item.url.includes("messaggistica") && !messagingEnabled) {
        return false;
      }
      return true;
    });
  };

  const companyId = effectiveCompany?.id;
  const messagingBetaEnabled = (effectiveCompany as any)?.messaging_beta_enabled;
  const visibleInternalItems = useMemo(() => filterNavItems(internalNavItems), [permissions, isModuleEnabled, companyId, messagingBetaEnabled]);
  const visibleMarketingItems = useMemo(() => filterNavItems(marketingNavItems), [permissions, isModuleEnabled, companyId, messagingBetaEnabled]);
  const showCruscotto = permissions.canViewCruscotto;

  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/azienda" className="flex items-center gap-2">
          {effectiveCompany?.logo_url ? (
            <img src={effectiveCompany.logo_url} alt={effectiveCompany.name} className="h-8 max-h-8 object-contain" />
          ) : (
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
          )}
        </Link>
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            <SidebarGroup>
              <SidebarGroupLabel>Sicurezza e log</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/azienda/impostazioni/sicurezza" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                        <Key className="h-4 w-4" /><span>Cambio password</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink to="/azienda/impostazioni/attivita" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                          <ScrollText className="h-4 w-4" /><span>Registro attività</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        ) : (
          <>
            {/* Cruscotto Aziendale - standalone item above sections */}
            {showCruscotto && (
              <SidebarGroup className="pb-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={cruscottoNavItem.url}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          activeClassName="bg-primary/10 text-primary font-semibold"
                        >
                          <cruscottoNavItem.icon className="h-4 w-4" />
                          <span className="font-medium">{cruscottoNavItem.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Gestione Interna */}
            <Collapsible defaultOpen={!isMarketingRoute && !isCruscottoRoute}>
              <SidebarGroup>
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group">
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5" />
                    Gestione Interna
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visibleInternalItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink 
                              to={item.url} 
                              end={item.url === "/azienda"}
                              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              activeClassName="bg-muted text-foreground font-medium"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                              {item.isBeta && (
                                <Badge variant="outline" className="ml-auto h-4 text-[9px] px-1 bg-accent text-accent-foreground border-border">BETA</Badge>
                              )}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>

            {/* Marketing e Vendita */}
            {visibleMarketingItems.length > 0 && (
              <Collapsible defaultOpen={isMarketingRoute}>
                <SidebarGroup className="pt-0">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group">
                    <span className="flex items-center gap-2">
                      <Megaphone className="h-3.5 w-3.5" />
                      Marketing e Vendita
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {visibleMarketingItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                              <NavLink 
                                to={item.url} 
                                end={item.url === "/azienda/marketing"}
                                className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                activeClassName="bg-muted text-foreground font-medium"
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.title}</span>
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            )}
            
            <div className="mt-auto border-t">
              {permissions.canViewSettings && (
                <div className="px-2 pt-3">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
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
              <div className="p-4">
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
  const navigate = useNavigate();
  const [supportOpen, setSupportOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const { unreadCount, markAsRead } = useUnreadSupportCount();

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
          <AnnouncementBanner />
          <SubscriptionBanner />
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <div className="flex-1" />
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
          <LifecycleNotificationsBanner />
          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
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
    </SidebarProvider>
  );
}
