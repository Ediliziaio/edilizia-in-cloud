import { useState, useRef } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { 
  LayoutDashboard, 
  Building, 
  LogOut,
  MessageSquare,
  Settings,
  CreditCard,
  Gift,
  Blocks,
  Search,
  ChevronsUpDown,
  ChevronDown,
  RefreshCw,
  LifeBuoy,
  Megaphone,
  ArrowLeft,
  User,
  Server,
  Bell,
  ShieldCheck,
  ScrollText,
  Mail,
  Bot,
  ListChecks,
  ClipboardCheck,
  ShieldCheck as ShieldCheckIcon,
  BarChart3,
  Users,
  Target,
  CalendarDays,
  Zap,
  MessageCircle,
  Briefcase,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { useSidebarSections } from "@/hooks/useSidebarSections";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
import { QuickLoginPopover } from "@/components/admin/QuickLoginPopover";

interface AdminNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: keyof ReturnType<typeof useSuperAdminPermissions>["permissions"];
  subcategory?: string;
}

const adminSubcategories = [
  { id: "sa_overview", label: "Overview" },
  { id: "sa_clienti", label: "Gestione Clienti" },
  { id: "sa_piattaforma", label: "Piattaforma" },
  { id: "sa_programmi", label: "Programmi" },
];

const adminMarketingSubcategories = [
  { id: "sa_mkt_crm", label: "CRM" },
  { id: "sa_mkt_comunicazione", label: "Comunicazione" },
  { id: "sa_mkt_automation", label: "Automazione & AI" },
];

const ADMIN_SIDEBAR_DEFAULTS: Record<string, boolean> = {
  sa_overview: false,
  sa_clienti: false,
  sa_piattaforma: false,
  sa_programmi: false,
  sa_mkt_crm: false,
  sa_mkt_comunicazione: false,
  sa_mkt_automation: false,
};

const allNavItems: AdminNavItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, permission: "can_view_platform_stats", subcategory: "sa_overview" },
  { title: "Aziende", url: "/admin/aziende", icon: Building, permission: "can_manage_companies", subcategory: "sa_clienti" },
  { title: "Assistenza", url: "/admin/ticket", icon: MessageSquare, permission: "can_manage_tickets", subcategory: "sa_clienti" },
  { title: "Lifecycle", url: "/admin/lifecycle", icon: LifeBuoy, permission: "can_manage_companies", subcategory: "sa_clienti" },
  { title: "CS Onboarding", url: "/admin/customer-success", icon: ListChecks, permission: "can_manage_companies", subcategory: "sa_clienti" },
  { title: "CS Tasks", url: "/admin/cs-tasks", icon: ClipboardCheck, permission: "can_manage_companies", subcategory: "sa_clienti" },
  { title: "Piani", url: "/admin/piani", icon: CreditCard, permission: "can_manage_plans", subcategory: "sa_piattaforma" },
  { title: "Feature Flags", url: "/admin/feature-flags", icon: Blocks, permission: "can_manage_companies", subcategory: "sa_piattaforma" },
  { title: "Annunci", url: "/admin/annunci", icon: Megaphone, permission: "can_view_platform_stats", subcategory: "sa_piattaforma" },
  { title: "Sync Logs", url: "/admin/sync-logs", icon: RefreshCw, permission: "can_view_platform_stats", subcategory: "sa_piattaforma" },
  { title: "GDPR", url: "/admin/gdpr", icon: ShieldCheckIcon, permission: "can_manage_companies", subcategory: "sa_piattaforma" },
  { title: "Referral", url: "/admin/referral", icon: Gift, permission: "can_manage_referrals", subcategory: "sa_programmi" },
];

const adminMarketingNavItems: AdminNavItem[] = [
  { title: "Dashboard", url: "/admin/marketing", icon: BarChart3, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Contatti & Lead", url: "/admin/marketing/contatti", icon: Users, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Opportunità", url: "/admin/marketing/opportunita", icon: Target, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Calendario", url: "/admin/marketing/calendario", icon: CalendarDays, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Email Marketing", url: "/admin/marketing/email", icon: Mail, permission: "can_manage_marketing", subcategory: "sa_mkt_comunicazione" },
  { title: "WhatsApp", url: "/admin/marketing/whatsapp", icon: MessageCircle, permission: "can_manage_marketing", subcategory: "sa_mkt_comunicazione" },
  { title: "Automazioni", url: "/admin/marketing/automazioni", icon: Zap, permission: "can_manage_marketing", subcategory: "sa_mkt_automation" },
  { title: "Agenti AI", url: "/admin/marketing/agenti-ai", icon: Bot, permission: "can_manage_marketing", subcategory: "sa_mkt_automation" },
];

const accountItems = [
  { title: "Impostazioni", url: "/admin/impostazioni", icon: Settings },
];

const AVATAR_COLORS = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AdminSettingsSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { permissions } = useSuperAdminPermissions();

  const navLinkClass = "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const activeClass = "bg-muted text-foreground font-medium";

  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/admin" className="flex items-center">
          <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
        </Link>
      </div>
      <SidebarContent>
        <div className="px-3 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 mb-2 text-muted-foreground hover:text-foreground w-full"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft className="h-4 w-4" />
            Torna indietro
          </Button>
          <h2 className="text-lg font-semibold px-3 mb-4">Impostazioni</h2>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/admin/impostazioni/profilo" className={navLinkClass} activeClassName={activeClass}>
                    <User className="h-4 w-4" /><span>Profilo</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Piattaforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/admin/impostazioni/piattaforma" className={navLinkClass} activeClassName={activeClass}>
                    <Server className="h-4 w-4" /><span>Piattaforma</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                   <NavLink to="/admin/impostazioni/notifiche" className={navLinkClass} activeClassName={activeClass}>
                    <Bell className="h-4 w-4" /><span>Notifiche</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/admin/impostazioni/email" className={navLinkClass} activeClassName={activeClass}>
                    <Mail className="h-4 w-4" /><span>Email</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/admin/impostazioni/agenti-ai" className={navLinkClass} activeClassName={activeClass}>
                    <Bot className="h-4 w-4" /><span>Agenti AI</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {permissions.can_manage_admins && (
          <SidebarGroup>
            <SidebarGroupLabel>Amministrazione</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin/impostazioni/super-admin" className={navLinkClass} activeClassName={activeClass}>
                      <ShieldCheck className="h-4 w-4" /><span>Super Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin/impostazioni/audit" className={navLinkClass} activeClassName={activeClass}>
                      <ScrollText className="h-4 w-4" /><span>Registro Attività</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin/impostazioni/ip-allowlist" className={navLinkClass} activeClassName={activeClass}>
                      <ShieldCheck className="h-4 w-4" /><span>IP Allowlist</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
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

function AdminMainSidebar() {
  const { signOut, impersonateCompany } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const navigate = useNavigate();
  const [companySearch, setCompanySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = (value: string) => {
    setCompanySearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const filteredNavItems = allNavItems.filter(
    (item) => permissions[item.permission]
  );

  const filteredMarketingItems = adminMarketingNavItems.filter(
    (item) => permissions[item.permission]
  );

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-sidebar-companies", debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from("companies")
        .select("id, name, logo_url")
        .eq("is_platform_admin_company", false)
        .order("name")
        .limit(50);
      if (debouncedSearch) {
        query = query.ilike("name", `%${debouncedSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: permissions.can_manage_companies,
  });

  const visibleCompanies = permissions.allowed_company_ids?.length
    ? companies.filter((c) => permissions.allowed_company_ids!.includes(c.id))
    : companies;

  const handleImpersonate = async (companyId: string) => {
    setPopoverOpen(false);
    setCompanySearch("");
    await impersonateCompany(companyId, permissions);
    navigate("/azienda");
  };
  
  return (
    <Sidebar className="border-r">
      <div className="flex flex-col border-b">
        <div className="flex h-14 items-center px-4">
          <Link to="/admin" className="flex items-center">
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
          </Link>
        </div>
        {permissions.can_manage_companies && (
          <div className="px-3 pb-3">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between text-muted-foreground font-normal h-9"
                >
                  <span className="truncate text-sm">Accedi come azienda...</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start" sideOffset={8}>
                <div className="p-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cerca un'azienda..."
                      value={companySearch}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-9 h-9 text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                <Separator />
                <div className="px-3 py-2">
                  <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                    Tutte le aziende
                  </p>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <div className="px-1 pb-2">
                    {visibleCompanies.map((company) => (
                      <button
                        key={company.id}
                        onClick={() => handleImpersonate(company.id)}
                        className="w-full flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted transition-colors"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          {company.logo_url ? (
                            <AvatarImage src={company.logo_url} alt={company.name} />
                          ) : null}
                          <AvatarFallback className={`${getAvatarColor(company.name)} text-white text-xs font-semibold`}>
                            {company.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">{company.name}</span>
                      </button>
                    ))}
                    {visibleCompanies.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                        Nessuna azienda trovata
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        )}
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

        {filteredMarketingItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Marketing & Vendita</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMarketingItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/admin/marketing"}
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
        )}

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
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/admin/impostazioni");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {isSettingsRoute ? <AdminSettingsSidebar /> : <AdminMainSidebar />}
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground">Super Admin</span>
            <div className="ml-auto">
              <QuickLoginPopover />
            </div>
          </header>
          <main className="flex-1 p-6 bg-muted/30">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
