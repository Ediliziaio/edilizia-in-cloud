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
  Gift,
  Factory,
  Calculator,
  Blocks,
  Search,
  ChevronsUpDown,
  Megaphone,
  ArrowLeft,
  Mail,
  Sparkles,
  Bot,
  BarChart3,
  Users,
  Target,
  CalendarDays,
  Zap,
  MessageCircle,
  Wallet,
  Settings2,
  HeartHandshake,
  GraduationCap,
  CheckSquare,
  MessagesSquare,
  Receipt,
  Library,
  HardHat,
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
import { AdminFirstRunTour } from "@/components/admin/AdminFirstRunTour";
import { AdminMobileSettingsNav } from "@/components/admin/AdminMobileSettingsNav";
// AdminSilvioFAB sostituito con SilvioFAB mode="admin" — stesso UX della
// chat aziendale (audio recording, attachments, markdown, model selector,
// action proposals) ma scoped al backend superadmin (silvio-admin-chat).
import { SilvioFAB } from "@/components/silvio/SilvioFAB";
import { useIsMobile } from "@/hooks/use-mobile";

interface AdminNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: keyof ReturnType<typeof useSuperAdminPermissions>["permissions"];
  subcategory?: string;
}

// Subcategorie Navigazione — ordine intenzionale: prima le subcategorie
// che hanno multiple voci (rendono accordion), poi quelle con un solo item
// (rendono flat). Visivamente raggruppa i gruppi navigabili in alto e le
// shortcut in fondo, riducendo il "mix accordion/flat" che confonde.
const adminSubcategories: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  // ── 1. Accordion (≥2 voci) ───────────────────────────────────────────
  { id: "sa_revenue", label: "Fatturato", icon: Wallet },
  { id: "sa_prodotto", label: "Prodotto", icon: Blocks },
  // ── 2. Flat (1 voce → render diretto come link) ──────────────────────
  { id: "sa_ai", label: "AI", icon: Sparkles },
  { id: "sa_customer_success", label: "Assistenza Clienti", icon: HeartHandshake },
  { id: "sa_portale", label: "Portale Formazione", icon: GraduationCap },
  { id: "sa_operazioni", label: "Operazioni", icon: Settings2 },
  { id: "sa_growth", label: "Growth", icon: Gift },
];

const adminMarketingSubcategories: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "sa_mkt_crm", label: "CRM", icon: Users },
  { id: "sa_mkt_comunicazione", label: "Comunicazione", icon: Mail },
  { id: "sa_mkt_automation", label: "Automazione & AI", icon: Zap },
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
  // ⚡ Hub Fatturato — 5 tab in alto sostituiscono 5 voci sidebar separate
  // (Revenue · Piani · Fatture · Promo · Dunning). Pulisce visualmente la
  // navigazione mantenendo l'accesso a tutti i sotto-strumenti con 1 click.
  { title: "Fatturato", url: "/admin/fatturato", icon: Wallet, permission: "billing_read", subcategory: "sa_revenue" },
  // Fatturazione Elettronica — chi usa la FE, volumi, costi e wallet openapi.
  { title: "Fatturazione Elettronica", url: "/admin/fatturazione-elettronica", icon: Receipt, permission: "billing_read", subcategory: "sa_revenue" },
  // ─── AI MANAGEMENT — Hub unico (Operate · Monitor · Config · Memoria
  //     in tab in alto). 4 voci → 1. Coerenza con Fatturato/CS/Operazioni. ──
  { title: "AI", url: "/admin/ai", icon: Sparkles, permission: "can_view_platform_stats", subcategory: "sa_ai" },
  // ─── CUSTOMER SUCCESS — Hub unico (Dashboard · Assistenza · Lifecycle ·
  //     Onboarding · Playbook in tab in alto). 5 voci → 1. ────────────────
  { title: "Assistenza Clienti", url: "/admin/cs", icon: HeartHandshake, permission: "can_manage_companies", subcategory: "sa_customer_success" },
  // ─── PORTALE FORMAZIONE — voce standalone in sidebar ──────────────
  // Modello LMS multi-tenant: corsi interni team Superadmin + grants alle
  // aziende clienti. Sufficientemente importante da meritare voce propria,
  // non un sotto-elemento di Customer Success.
  { title: "Portale Formazione", url: "/admin/portale-formazione", icon: GraduationCap, permission: "can_manage_companies", subcategory: "sa_portale" },
  // ─── PRODOTTO ──────────────────────────────────────────────────────
  { title: "Funzionalità Azienda", url: "/admin/feature-flags", icon: Blocks, permission: "can_manage_companies", subcategory: "sa_prodotto" },
  // Libreria Prezzari Regionali — curata dal super-admin, condivisa con le aziende.
  { title: "Prezzari regionali", url: "/admin/prezzari-regionali", icon: Library, permission: "can_manage_companies", subcategory: "sa_prodotto" },
  // Manodopera (costo orario) — tariffe orarie edili ufficiali, curate dal super-admin.
  { title: "Manodopera (costo orario)", url: "/admin/manodopera-tariffe", icon: HardHat, permission: "can_manage_companies", subcategory: "sa_prodotto" },
  { title: "Annunci", url: "/admin/annunci", icon: Megaphone, permission: "can_view_platform_stats", subcategory: "sa_prodotto" },
  // ⚠️ "Operazioni" rimosso dalla sidebar principale: è materia di
  //    amministrazione di sistema (sync, alert, import, GDPR, audit) e
  //    duplicava parzialmente "Registro Attività" già presente in
  //    Impostazioni → Sistema. Ora vive lì come singola voce.
  //    L'hub /admin/operazioni resta funzionante per i deep link.
  { title: "Referral", url: "/admin/referral", icon: Gift, permission: "can_manage_referrals", subcategory: "sa_growth" },
  { title: "Produttori", url: "/admin/produttori", icon: Factory, permission: "can_manage_companies", subcategory: "sa_growth" },
  { title: "Commercialisti", url: "/admin/commercialisti", icon: Calculator, permission: "can_manage_companies", subcategory: "sa_growth" },
  // NB (audit superadmin 2026-06): le route orfane /admin/campagne (A/B test
  // legacy su crm_campaigns, duplica l'Email Marketing dell'hub) e
  // /admin/cohort (la UI è pronta ma cohort_revenue_view NON esiste nel DB →
  // la pagina mostra solo un errore) restano volutamente FUORI dalla nav.
  // Cohort si potrà linkare quando la view verrà creata via migration.
];

const adminMarketingNavItems: AdminNavItem[] = [
  { title: "Dashboard", url: "/admin/marketing", icon: BarChart3, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Contatti & Lead", url: "/admin/marketing/contatti", icon: Users, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Lead Scraper", url: "/admin/marketing/lead-scraper", icon: Search, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Opportunità", url: "/admin/marketing/opportunita", icon: Target, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Calendario", url: "/admin/marketing/calendario", icon: CalendarDays, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
  { title: "Simulatore ROI", url: "/admin/marketing/simulatore-roi", icon: Calculator, permission: "can_manage_marketing", subcategory: "sa_mkt_crm" },
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

  // Sidebar SuperAdmin — palette blu (brand) + accenti arancio (active).
  // Default: testo neutro muted, hover: tint blu chiaro.
  // Active: bg blu pallido + testo blu scuro + bordo sinistro arancio = mix
  // brand piattaforma + accent EdiliziaInCloud per coerenza col resto della UI.
  const navLinkClass =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-all duration-150 hover:bg-blue-50 hover:text-blue-900 dark:hover:bg-sidebar-accent/40 dark:hover:text-sidebar-foreground";
  const activeClass =
    "bg-blue-50 text-blue-900 font-semibold border-l-2 border-orange-500 dark:bg-sidebar-primary/15 dark:text-sidebar-primary dark:border-orange-500";

  return (
    <Sidebar className="border-r bg-gradient-to-b from-white via-slate-50/30 to-white dark:from-sidebar dark:via-sidebar dark:to-sidebar">
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
           Chat     → conversazioni team interno */}
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
                  const badge = getBadgeForNavItem("/admin/email", sidebarBadges);
                  return (
                    <SidebarMenuItem key="top-email">
                      <SidebarMenuButton asChild tooltip="Email">
                        <NavLink
                          to="/admin/email"
                          className={navLinkClass}
                          activeClassName={activeClass}
                        >
                          <Mail className="h-4 w-4" />
                          <span className="flex-1 font-medium">Email</span>
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
                {/* "Triage AI" rimosso dalla sidebar: il triage è integrato
                    nella toolbar del client /admin/email (filtri smart per
                    categoria + AI Command Center). Niente più pagina duplicata. */}
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

        {/* ─── NAVIGAZIONE — subcategorie collapsabili SOLO se >1 item ───
           Regola UX: una macrocategoria con sotto una sola voce è rumore
           visivo (cliccando vai dritto al figlio). Quindi:
             • Subcategory con 1 item  → render FLAT, l'item appare diretto.
             • Subcategory con ≥2 item → render con SidebarSubcategory accordion.
           Stile minimal Linear/Vercel mantenuto. */}
        {filteredNavItems.length > 0 && (
          <SidebarGroup className="pt-1 pb-1">
            <SidebarGroupContent>
              <SidebarMenu>
                {adminSubcategories.map((sub) => {
                  const items = filteredNavItems.filter((i) => i.subcategory === sub.id);
                  if (items.length === 0) return null;

                  // ── Caso 1: 1 solo item → render flat (no wrapper) ─────
                  if (items.length === 1) {
                    const item = items[0];
                    const badge = getBadgeForNavItem(item.url, sidebarBadges);
                    return (
                      <SidebarMenuItem key={`flat-${sub.id}`}>
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
                  }

                  // ── Caso 2: ≥2 item → accordion subcategory ────────────
                  const aggregateBadge = items.reduce((sum, i) => {
                    const b = getBadgeForNavItem(i.url, sidebarBadges);
                    return sum + (b?.count ?? 0);
                  }, 0);
                  return (
                    <SidebarSubcategory
                      key={sub.id}
                      label={sub.label}
                      icon={sub.icon}
                      badge={aggregateBadge}
                      isOpen={isOpen(sub.id)}
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ─── MARKETING & VENDITA — separatore minimale ──────────────
           Solo hairline + label discreto sentence-case. Senza dot arancio,
           senza gradient — sembrava un secondo header. */}
        {filteredMarketingItems.length > 0 && (
          <>
            <div className="mx-3 my-3">
              <div className="h-px bg-slate-200/80 dark:bg-sidebar-border/60" />
              <p className="mt-3 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-sidebar-foreground/40">
                Marketing
              </p>
            </div>
            <SidebarGroup className="pt-0 pb-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminMarketingSubcategories.map((sub) => {
                    const items = filteredMarketingItems.filter((i) => i.subcategory === sub.id);
                    if (items.length === 0) return null;

                    // Stessa regola UX: 1 item → flat, ≥2 → accordion.
                    if (items.length === 1) {
                      const item = items[0];
                      return (
                        <SidebarMenuItem key={`flat-mkt-${sub.id}`}>
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
                      );
                    }

                    return (
                      <SidebarSubcategory
                        key={sub.id}
                        label={sub.label}
                        icon={sub.icon}
                        isOpen={isOpen(sub.id)}
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
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
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
        <SilvioFAB mode="admin" />
        <AdminFirstRunTour />
      </div>
    </SidebarProvider>
  );
}
