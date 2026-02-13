import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits, type ModuleKey } from "@/hooks/useSubscriptionLimits";
import { SubscriptionBanner } from "@/components/layouts/SubscriptionBanner";
import { 
  LayoutDashboard, 
  ClipboardList, 
  Users,
  HeadphonesIcon,
  Settings,
  LogOut,
  TrendingUp,
  Receipt,
  AlertTriangle,
  ArrowLeft,
  Warehouse,
  CalendarDays,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useMemo } from "react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
  moduleKey?: ModuleKey;
}

const allNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard, permissionKey: "canViewDashboard" },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders" },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse" },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar" },
  { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers" },
  
  { title: "Assistenza", url: "/azienda/assistenza", icon: HeadphonesIcon, permissionKey: "canViewTickets", moduleKey: "tickets" },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast" },
  { title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewForecast", moduleKey: "forecast" },
  { title: "Impostazioni", url: "/azienda/impostazioni", icon: Settings, permissionKey: "canViewSettings" },
];

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
  const { signOut, effectiveCompany, profile, isImpersonating, exitImpersonation } = useAuth();
  const permissions = usePermissions();
  const { isModuleEnabled } = useSubscriptionLimits();
  const navigate = useNavigate();
  
  const handleLogoutOrExit = () => {
    if (isImpersonating) {
      exitImpersonation();
      navigate("/admin/aziende");
    } else {
      signOut();
    }
  };

  // Filter nav items based on permissions AND module availability
  const visibleNavItems = useMemo(() => {
    return allNavItems.filter((item) => {
      // Check permission
      if (item.permissionKey && permissions[item.permissionKey as keyof typeof permissions] !== true) {
        return false;
      }
      // Check module enabled in plan
      if (item.moduleKey && !isModuleEnabled(item.moduleKey)) {
        return false;
      }
      return true;
    });
  }, [permissions, isModuleEnabled]);

  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/azienda" className="flex items-center gap-2">
          {effectiveCompany?.logo_url ? (
            <Avatar className="h-8 w-8">
              <AvatarImage src={effectiveCompany.logo_url} alt={effectiveCompany.name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {effectiveCompany.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
          )}
          <span className="font-semibold text-foreground truncate max-w-[160px]">
            {effectiveCompany?.name || "La tua azienda"}
          </span>
        </Link>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
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
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <div className="mt-auto p-4 border-t">
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
      </SidebarContent>
    </Sidebar>
  );
}

export function CompanyLayout() {
  const { effectiveCompany } = useAuth();
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CompanySidebar />
        <div className="flex-1 flex flex-col">
          <ImpersonationBanner />
          <SubscriptionBanner />
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {effectiveCompany?.name}
            </span>
          </header>
          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
