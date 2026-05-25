import { useState, useRef } from "react";
import { navigateToSubdomain, getSubdomainUrl } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useAdminSidebarBadges, getBadgeForNavItem } from "@/hooks/useAdminSidebarBadges";
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
  RefreshCw,
  LifeBuoy,
  Megaphone,
  ArrowLeft,
  Mail,
  Bot,
  ListChecks,
  ShieldCheck as ShieldCheckIcon,
  BarChart3,
  Users,
  Target,
  CalendarDays,
  Zap,
  MessageCircle,
  LineChart,
  Ticket,
  FileText,
  Settings2,
  TrendingUp,
  BookOpen,
  FileUp,
  ShieldAlert,
  AlertTriangle,
  CheckSquare,
  MessagesSquare,
  Brain,
} from "lucide-react";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useSidebarSections } from "@/hooks/useSidebarSections";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { ADMIN_SETTINGS_NAV } from "@/config/adminSettingsNav";
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
import { AdminBreadcrumb } from "@/components/admin/header/AdminBreadcrumb";
import { AdminNotificationCenter } from "@/components/admin/header/AdminNotificationCenter";
import { AdminQuickActions } from "@/components/admin/header/AdminQuickActions";
import { AdminBottomNav } from "@/components/admin/AdminBottomNav";
import { AdminMobileSettingsNav } from "@/components/admin/AdminMobileSettingsNav";
import { AdminSilvioFAB } from "@/components/silvio/AdminSilvioFAB";
import { useIsMobile } from "@/hooks/use-mobile";

interface AdminNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: keyof ReturnType<typeof useSuperAdminPermissions>["permissions"];
  subcategory?: string;
}

// Subcategorie Navigazione — solo label, niente icona (riduce rumore visivo).
// Le icone restano sui singoli item dentro la subcategory.
const adminSubcategories: Array<{ id: string; label: string }> = [
  { id: "sa_revenue", label: "Fatturato" },
  { id: "sa_ai", label: "AI" },
  { id: "sa_customer_success", label: "Customer Success" },
  { id: "sa_prodotto", label: "Prodotto" },
  { id: "sa_operazioni", label: "Operazioni" },
  { id: "sa_growth", label: "Growth" },
];

const adminMarketingSubcategories: Array<{ id: string; label: string }> = [
  { id: "sa_mkt_crm", label: "CRM" },
  { id: "sa_mkt_comunicazione", label: "Comunicazione" },
  { id: "sa_mkt_automation", label: "Automazione & AI" },
];

// Smart defaults: aperte le sezioni più usate quotidianamente.
// Fatturato (= lista aziende + revenue + piani) sempre aperto: use-case primario
// Customer Success per gestire lifecycle, ticket, onboarding
const ADMIN_SIDEBAR_DEFAULTS: Record<string, boolean> = {
  sa_revenue: true,
  sa_ai: false,
  sa_customer_success: true,
  sa_prodotto: false,
  sa_operazioni: false,
  sa_growth: false,
  sa_mkt_crm: false,
  sa_mkt_comunicazione: false,
  sa_mkt_automation: false,
};

const allNavItems: AdminNavItem[] = [
  // Dashboard rimosso da qui — pinned in cima accanto ad Attività/Chat
  // ─── FATTURATO (sa_revenue) — lista clienti + revenue + piani uniti ───
  // Aziende è l'item primario perché è la lista dei clienti/paganti
  { title: "Aziende", url: "/admin/aziende", icon: Building, permission: "can_manage_companies", subcategory: "sa_revenue" },
  { title: "Revenue", url: "/admin/revenue", icon: LineChart, permission: "billing_read", subcategory: "sa_revenue" },
  { title: "Piani", url: "/admin/piani", icon: CreditCard, permission: "can_manage_plans", subcategory: "sa_revenue" },
  { title: "Fatture", url: "/admin/fatture", icon: FileText, permission: "billing_read", subcategory: "sa_revenue" },
  { title: "Promo", url: "/admin/promo-codes", icon: Ticket, permission: "billing_write", subcategory: "sa_revenue" },
  { title: "Dunning", url: "/admin/dunning", icon: Settings2, permission: "billing_write", subcategory: "sa_revenue" },
  // ─── AI MANAGEMENT (sezione dedicata: scorporo da Fatturato per ridurre rumore) ───
  // Config: routing modelli, personas, KB, pricing, governance
  { title: "AI · Config", url: "/admin/ai-config", icon: Settings2, permission: "can_view_platform_stats", subcategory: "sa_ai" },
  // Monitor: usage, costs, test lab, health
  { title: "AI · Monitor", url: "/admin/ai-monitor", icon: BarChart3, permission: "can_view_platform_stats", subcategory: "sa_ai" },
  // Operate: approvals, queue, policies, missions, chief, memory, learning
  { title: "AI · Operate", url: "/admin/ai-operate", icon: Bot, permission: "can_view_platform_stats", subcategory: "sa_ai" },
  // Memoria cross-company: vista super_admin di TUTTE le memorie AI persona
  { title: "AI · Memoria", url: "/admin/ai-memoria", icon: Brain, permission: "can_view_platform_stats", subcategory: "sa_ai" },
  // ─── CUSTOMER SUCCESS ───────────────────────────────────────────────
  { title: "CS Dashboard", url: "/admin/cs-dashboard", icon: TrendingUp, permission: "can_impersonate", subcategory: "sa_customer_success" },
  { title: "Assistenza", url: "/admin/ticket", icon: MessageSquare, permission: "can_manage_tickets", subcategory: "sa_customer_success" },
  { title: "Lifecycle", url: "/admin/lifecycle", icon: LifeBuoy, permission: "can_manage_companies", subcategory: "sa_customer_success" },
  // ⚠️ "Task CS" rimosso: la gestione task è ora un tab dentro "Attività" (top sidebar)
  { title: "Onboarding", url: "/admin/customer-success", icon: ListChecks, permission: "can_manage_companies", subcategory: "sa_customer_success" },
  { title: "Playbook", url: "/admin/playbooks", icon: BookOpen, permission: "can_manage_companies", subcategory: "sa_customer_success" },
  { title: "Feature Flags", url: "/admin/feature-flags", icon: Blocks, permission: "can_manage_companies", subcategory: "sa_prodotto" },
  { title: "Annunci", url: "/admin/annunci", icon: Megaphone, permission: "can_view_platform_stats", subcategory: "sa_prodotto" },
  { title: "Sync Logs", url: "/admin/sync-logs", icon: RefreshCw, permission: "can_view_platform_stats", subcategory: "sa_operazioni" },
  { title: "Alert Failure", url: "/admin/failure-alerts", icon: AlertTriangle, permission: "can_manage_companies", subcategory: "sa_operazioni" },
  { title: "Import CSV", url: "/admin/csv-import", icon: FileUp, permission: "can_manage_companies", subcategory: "sa_operazioni" },
  { title: "Audit Log", url: "/admin/audit-log", icon: ShieldAlert, permission: "can_manage_companies", subcategory: "sa_operazioni" },
  { title: "GDPR", url: "/admin/gdpr", icon: ShieldCheckIcon, permission: "can_manage_companies", subcategory: "sa_operazioni" },
  { title: "Referral", url: "/admin/referral", icon: Gift, permission: "can_manage_referrals", subcategory: "sa_growth" },
];

const adminMarketingNavItems: AdminNavItem[] = [
  { title: "Dashboard", url: "/admin/marketing", icon: BarChart3, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Contatti & Lead", url: "/admin/marketing/contatti", icon: Users, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Opportunità", url: "/admin/marketing/opportunita", icon: Target, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Calendario", url: "/admin/marketing/calendario", icon: CalendarDays, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Email Marketing", url: "/admin/marketing/email", icon: Mail, permission: "can_manage_marketing", subcategory: "sa_mkt_comunicazione" },
  { title: "SMS Marketing", url: "/admin/marketing/sms", icon: MessageSquare, permission: "can_manage_marketing", subcategory: "sa_mkt_comunicazione" },
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
  const [search, setSearch] = useState("");

  const canAccess = (item: { permission?: string }): boolean => {
    if (!item.permission) return true;
    const val = permissions?.[item.permission as keyof Omit<typeof permissions, 'allowed_company_ids'>];
    return val === true;
  };

  const filteredNav = ADMIN_SETTINGS_NAV
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          canAccess(item) &&
          (search === "" ||
            item.label.toLowerCase().includes(search.toLowerCase()) ||
            item.description.toLowerCase().includes(search.toLowerCase()))
      ),
    }))
    .filter((g) => g.items.length > 0);

  const navLinkClass = "flex items-start gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group";
  const activeClass = "bg-sidebar-primary/10 text-sidebar-primary font-medium";

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
          <h2 className="text-lg font-semibold px-3 mb-3">Impostazioni</h2>
          <div className="relative mb-3 px-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca impostazioni..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredNav.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-8 text-center">
              Nessun risultato per &quot;{search}&quot;
            </p>
          ) : (
            filteredNav.map((group) => (
              <SidebarGroup key={group.group}>
                <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={item.url}
                              className={navLinkClass}
                              activeClassName={activeClass}
                            >
                              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{item.label}</span>
                                  {item.badge && (
                                    <span className="inline-flex items-center rounded-full bg-sidebar-primary/10 px-1.5 py-0.5 text-xs font-medium text-sidebar-primary">
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5 group-hover:text-muted-foreground/80">
                                  {item.description}
                                </p>
                              </div>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </ScrollArea>

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
  const { data: sidebarBadges } = useAdminSidebarBadges();
  const navigate = useNavigate();
  const [companySearch, setCompanySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Search globale che filtra tutte le voci del menu — quando attiva forza
  // tutte le subcategorie aperte per mostrare i match
  const [navSearch, setNavSearch] = useState("");

  const allAdminNavItems = [...allNavItems, ...adminMarketingNavItems];
  const { toggle, isOpen } = useSidebarSections({
    navItems: allAdminNavItems,
    storageKey: "admin_sidebar_sections_state",
    defaultState: ADMIN_SIDEBAR_DEFAULTS,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = (value: string) => {
    setCompanySearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const matchesSearch = (title: string) => {
    if (!navSearch) return true;
    return title.toLowerCase().includes(navSearch.toLowerCase());
  };

  const filteredNavItems = allNavItems.filter(
    (item) => permissions[item.permission] && matchesSearch(item.title)
  );

  const filteredMarketingItems = adminMarketingNavItems.filter(
    (item) => permissions[item.permission] && matchesSearch(item.title)
  );

  const isSearching = navSearch.trim().length > 0;

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
    const impToken = await impersonateCompany(companyId, permissions);
    if (impToken) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const params = new URLSearchParams({
          _at: session.access_token,
          _rt: session.refresh_token ?? '',
          _it: impToken,
          _ic: companyId,
        });
        const url = getSubdomainUrl(`/azienda#${params.toString()}`, "app");
        safeRedirect(url);
        return;
      }
    }
    navigateToSubdomain("/azienda", "app", navigate);
  };

  const navLinkClass = "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const activeClass = "bg-sidebar-primary/10 text-sidebar-primary font-semibold border-l-2 border-sidebar-primary";
  
  return (
    <Sidebar className="border-r">
      <div className="flex flex-col border-b">
        <div className="flex h-14 items-center px-4 justify-between">
          <Link to="/admin" className="flex items-center">
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
          </Link>
          {sidebarBadges?.maintenanceActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400" title="Manutenzione attiva">
              🔧
            </span>
          )}
        </div>
        {permissions.can_manage_companies && (
          <div className="px-3 pb-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between font-normal h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 group"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Building className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-xs">Accedi come azienda</span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
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
                  <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
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
        {/* ─── Cruscotto top — accesso rapido alle 3 voci quotidiane ────────
           Dashboard / Attività / Chat sempre visibili in cima.
           Dashboard prima → "home" mentale dell'utente
           Attività → task CS gestione clienti (badge urgenza)
           Chat     → conversazioni team interno
           Search bar globale sotto per saltare a qualsiasi pagina */}
        {(permissions.can_manage_companies || permissions.can_manage_tickets) && (
          <SidebarGroup className="pt-3 pb-2">
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.can_view_platform_stats && (
                  <SidebarMenuItem key="top-dashboard">
                    <SidebarMenuButton asChild tooltip="Dashboard">
                      <NavLink
                        to="/admin"
                        end
                        className={navLinkClass}
                        activeClassName={activeClass}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        <span className="flex-1 font-medium">Dashboard</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {permissions.can_manage_companies && (() => {
                  const badge = getBadgeForNavItem("/admin/cs-tasks", sidebarBadges);
                  return (
                    <SidebarMenuItem key="top-attivita">
                      <SidebarMenuButton asChild tooltip="Attività">
                        <NavLink
                          to="/admin/attivita"
                          className={navLinkClass}
                          activeClassName={activeClass}
                        >
                          <CheckSquare className="h-4 w-4" />
                          <span className="flex-1 font-medium">Attività</span>
                          {badge && badge.count != null && badge.count > 0 && (
                            <span
                              className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-xs font-bold leading-none ${
                                badge.variant === "destructive"
                                  ? "bg-destructive text-destructive-foreground"
                                  : badge.variant === "warning"
                                  ? "bg-orange-500 text-white dark:bg-orange-600"
                                  : "bg-sidebar-primary/15 text-sidebar-primary"
                              }`}
                              title={
                                sidebarBadges
                                  ? `${sidebarBadges.openTasks} task aperti${sidebarBadges.overdueTasks ? ` · ${sidebarBadges.overdueTasks} in ritardo` : ""}${sidebarBadges.dueTodayTasks ? ` · ${sidebarBadges.dueTodayTasks} oggi` : ""}`
                                  : undefined
                              }
                            >
                              {badge.count > 99 ? "99+" : badge.count}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })()}
                {permissions.can_manage_companies && (() => {
                  const badge = getBadgeForNavItem("/admin/chat", sidebarBadges);
                  return (
                    <SidebarMenuItem key="top-chat">
                      <SidebarMenuButton asChild tooltip="Chat team">
                        <NavLink
                          to="/admin/chat"
                          className={navLinkClass}
                          activeClassName={activeClass}
                        >
                          <MessagesSquare className="h-4 w-4" />
                          <span className="flex-1 font-medium">Chat</span>
                          {badge && badge.count != null && badge.count > 0 && (
                            <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sidebar-primary/15 px-1 text-xs font-bold leading-none text-sidebar-primary">
                              {badge.count > 99 ? "99+" : badge.count}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })()}
                {/* Silvio rimosso dalla sidebar: ora vive come canale dentro
                    /admin/chat (visibile e accessibile come per le aziende).
                    Il link sidebar separato era ridondante. */}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ─── Search globale sidebar — stile minimal coerente ───────────
           Filtra le voci di tutto il menu per nome. Stile borderless con
           background trasparente per integrarsi con la sidebar. */}
        <div className="px-3 py-1">
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              placeholder=""
              aria-label="Cerca nel menu"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              className="w-full h-7 pl-7 pr-2 text-xs bg-transparent border-0 outline-none focus:bg-muted/30 rounded-md transition-colors"
            />
          </div>
        </div>

        {/* ─── NAVIGAZIONE — niente group title, subcategorie direttamente ───
           Stile minimal Linear/Vercel: l'utente vede subito le subcategorie
           senza un livello extra "NAVIGAZIONE" che non aggiunge informazione. */}
        {filteredNavItems.length > 0 && (
          <SidebarGroup className="pt-1 pb-1">
            <SidebarGroupContent>
              {adminSubcategories.map((sub) => {
                const items = filteredNavItems.filter((i) => i.subcategory === sub.id);
                if (items.length === 0) return null;
                const aggregateBadge = items.reduce((sum, i) => {
                  const b = getBadgeForNavItem(i.url, sidebarBadges);
                  return sum + (b?.count ?? 0);
                }, 0);
                return (
                  <SidebarSubcategory
                    key={sub.id}
                    label={sub.label}
                    badge={aggregateBadge}
                    isOpen={isSearching || isOpen(sub.id)}
                    onToggle={() => toggle(sub.id)}
                  >
                    <SidebarMenu>
                      {items.map((item) => {
                        const badge = getBadgeForNavItem(item.url, sidebarBadges);
                        return (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                              <NavLink
                                to={item.url}
                                end={item.url === "/admin"}
                                className={navLinkClass}
                                activeClassName={activeClass}
                              >
                                <item.icon className="h-4 w-4" />
                                <span className="flex-1">{item.title}</span>
                                {badge && badge.count != null && badge.count > 0 && (
                                  <span
                                    className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-xs font-bold leading-none ${
                                      badge.variant === "destructive"
                                        ? "bg-destructive text-destructive-foreground"
                                        : badge.variant === "warning"
                                        ? "bg-orange-500 text-white dark:bg-orange-600"
                                        : "bg-sidebar-primary/15 text-sidebar-primary"
                                    }`}
                                  >
                                    {badge.count > 99 ? "99+" : badge.count}
                                  </span>
                                )}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarSubcategory>
                );
              })}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ─── MARKETING & VENDITA — separato da divider sottile ─────────
           Niente group title verboso: divider + label discreto in alto */}
        {filteredMarketingItems.length > 0 && (
          <>
            <div className="px-3 my-1">
              <div className="border-t border-border/40" />
              <div className="pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Marketing & Vendita
              </div>
            </div>
            <SidebarGroup className="pt-0 pb-1">
              <SidebarGroupContent>
                {adminMarketingSubcategories.map((sub) => {
                  const items = filteredMarketingItems.filter((i) => i.subcategory === sub.id);
                  if (items.length === 0) return null;
                  return (
                    <SidebarSubcategory
                      key={sub.id}
                      label={sub.label}
                      isOpen={isSearching || isOpen(sub.id)}
                      onToggle={() => toggle(sub.id)}
                    >
                      <SidebarMenu>
                        {items.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                              <NavLink
                                to={item.url}
                                end={item.url === "/admin/marketing"}
                                className={navLinkClass}
                                activeClassName={activeClass}
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.title}</span>
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarSubcategory>
                  );
                })}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* Empty search state */}
        {isSearching && filteredNavItems.length === 0 && filteredMarketingItems.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              Nessuna voce trovata per <span className="font-medium">"{navSearch}"</span>
            </p>
            <button
              type="button"
              onClick={() => setNavSearch("")}
              className="text-xs text-sidebar-primary hover:underline mt-1"
            >
              Cancella ricerca
            </button>
          </div>
        )}

        <div className="mt-auto border-t">
          <div className="px-2 pt-3">
            <SidebarMenu>
              {accountItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className={navLinkClass}
                      activeClassName={activeClass}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
          <div className="p-4">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Esci
            </Button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isSettingsRoute = location.pathname.startsWith("/admin/impostazioni");

  // Mobile: no sidebar at all — bottom nav replaces it
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col w-full">
        {/* Mobile header — clean, native-style */}
        <header className="flex h-11 border-b items-center px-3 bg-background sticky top-0 z-40">
          <div className="flex-1 min-w-0">
            <AdminBreadcrumb />
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <AdminNotificationCenter />
            <QuickLoginPopover />
          </div>
        </header>

        {/* Settings sub-navigation on mobile */}
        {isSettingsRoute && <AdminMobileSettingsNav />}

        <main className="flex-1 p-3 pb-20 bg-muted/30 overflow-x-hidden">
          <ErrorBoundary title="Errore nel caricamento della pagina">
            <Outlet />
          </ErrorBoundary>
        </main>

        <AdminBottomNav />
      </div>
    );
  }

  // Desktop: full sidebar + header
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {isSettingsRoute ? <AdminSettingsSidebar /> : <AdminMainSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-14 border-b items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <AdminBreadcrumb />
            <div className="ml-auto flex items-center gap-2">
              <AdminQuickActions />
              <AdminNotificationCenter />
              <Separator orientation="vertical" className="h-5" />
              <QuickLoginPopover />
            </div>
          </header>
          <main className="flex-1 p-6 bg-muted/30 overflow-x-hidden">
            <ErrorBoundary title="Errore nel caricamento della pagina">
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
        <AdminSilvioFAB />
      </div>
    </SidebarProvider>
  );
}
