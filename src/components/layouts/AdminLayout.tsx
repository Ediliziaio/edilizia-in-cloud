import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { 
  LayoutDashboard, 
  Building, 
  LogOut,
  LogIn,
  MessageSquare,
  Settings,
  CreditCard,
  Gift,
  Search,
  X
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ScrollArea } from "@/components/ui/scroll-area";

const allNavItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, permission: "can_view_platform_stats" as const },
  { title: "Aziende", url: "/admin/aziende", icon: Building, permission: "can_manage_companies" as const },
  { title: "Assistenza", url: "/admin/ticket", icon: MessageSquare, permission: "can_manage_tickets" as const },
  { title: "Piani", url: "/admin/piani", icon: CreditCard, permission: "can_manage_plans" as const },
  { title: "Referral", url: "/admin/referral", icon: Gift, permission: "can_manage_referrals" as const },
];

const accountItems = [
  { title: "Impostazioni", url: "/admin/impostazioni", icon: Settings },
];

function AdminSidebar() {
  const { signOut, impersonateCompany } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const navigate = useNavigate();
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  const filteredNavItems = allNavItems.filter(
    (item) => permissions[item.permission]
  );

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-sidebar-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, logo_url")
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: permissions.can_manage_companies,
  });

  const visibleCompanies = companies
    .filter((c) => {
      if (permissions.allowed_company_ids && permissions.allowed_company_ids.length > 0) {
        if (!permissions.allowed_company_ids.includes(c.id)) return false;
      }
      if (companySearch) {
        return c.name.toLowerCase().includes(companySearch.toLowerCase());
      }
      return true;
    })
    .slice(0, 10);

  const handleImpersonate = async (companyId: string) => {
    await impersonateCompany(companyId);
    setShowCompanyPicker(false);
    setCompanySearch("");
    navigate("/azienda");
  };
  
  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/admin" className="flex items-center">
          <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
        </Link>
      </div>
      <SidebarContent className="flex flex-col">
        <SidebarGroup>
          <SidebarGroupLabel>Navigazione</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/admin"}
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

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
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

        {/* Quick Impersonation */}
        {permissions.can_manage_companies && (
          <SidebarGroup>
            <SidebarGroupLabel>Accesso Rapido</SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              {!showCompanyPicker ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 text-muted-foreground"
                  onClick={() => setShowCompanyPicker(true)}
                >
                  <LogIn className="h-4 w-4" />
                  Accedi come azienda
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cerca azienda..."
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      className="pl-8 pr-8 h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8"
                      onClick={() => { setShowCompanyPicker(false); setCompanySearch(""); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-0.5">
                      {visibleCompanies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => handleImpersonate(company.id)}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors"
                        >
                          {company.logo_url ? (
                            <img src={company.logo_url} alt="" className="h-5 w-5 rounded object-cover" />
                          ) : (
                            <Building className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="truncate">{company.name}</span>
                        </button>
                      ))}
                      {visibleCompanies.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-2">Nessuna azienda trovata</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        
        <div className="mt-auto p-4">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">Super Admin</span>
          </header>
          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
