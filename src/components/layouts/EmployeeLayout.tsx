import { Outlet, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Clock,
  CalendarDays,
  User,
  LogOut,
  Palmtree,
  MoreHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavLink } from "@/components/NavLink";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";

const navigationItems = [
  { title: "Dashboard", url: "/dipendente", icon: Home },
  { title: "Registra Ore", url: "/dipendente/ore", icon: Clock },
  { title: "I Miei Rapportini", url: "/dipendente/rapportini", icon: CalendarDays },
  { title: "Ferie & Permessi", url: "/dipendente/ferie", icon: Palmtree },
  { title: "Profilo", url: "/dipendente/profilo", icon: User },
];

/* ── Bottom Navigation per mobile ──────────────────────── */
const BOTTOM_NAV = [
  { label: "Home", icon: Home, href: "/dipendente", exact: true },
  { label: "Ore", icon: Clock, href: "/dipendente/ore" },
  { label: "Rapportini", icon: CalendarDays, href: "/dipendente/rapportini" },
  { label: "Ferie", icon: Palmtree, href: "/dipendente/ferie" },
];

function EmployeeBottomNav() {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione dipendente"
    >
      <div className="flex items-stretch h-16">
        {BOTTOM_NAV.map(({ label, icon: Icon, href, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              to={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl transition-all duration-200",
                  active ? "bg-blue-50 w-12 h-8" : "w-10 h-8"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    active ? "text-blue-600 stroke-[2.5]" : "text-muted-foreground stroke-[1.5]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none transition-all duration-200",
                  active ? "text-blue-600 font-semibold" : "text-muted-foreground font-medium"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Menu */}
        <button
          className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
          onClick={toggleSidebar}
          aria-label="Apri menu"
          type="button"
        >
          <div className="flex items-center justify-center w-10 h-8">
            <MoreHorizontal className="h-5 w-5 text-muted-foreground stroke-[1.5]" />
          </div>
          <span className="text-[10px] leading-none text-muted-foreground font-medium">
            Altro
          </span>
        </button>
      </div>
    </nav>
  );
}

/* ── Sidebar ───────────────────────────────────────────── */
function EmployeeSidebar() {
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const { data: employee, isLoading } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, company:companies(name)")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  const initials = employee
    ? `${employee.first_name[0]}${employee.last_name[0]}`.toUpperCase()
    : "??";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-4">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            {!collapsed && <Skeleton className="h-4 w-24" />}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-medium text-sm">
                  {employee?.first_name} {employee?.last_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(employee?.company && typeof employee.company === "object" && "name" in employee.company ? (employee.company as { name: string }).name : "Dipendente")}
                </span>
              </div>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dipendente"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-sidebar-primary/10 text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => signOut()}
                  >
                    <LogOut className="h-4 w-4" />
                    {!collapsed && <span>Esci</span>}
                  </Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * @deprecated L'area `/dipendente` e' stata assorbita da `/campo`.
 * Manteniamo il layout per storico git e rollback, ma le route pubbliche
 * reindirizzano sempre al portale campo mobile-first.
 */
export function EmployeeLayout() {
  const { user, isLoading: authLoading } = useAuth();

  const { data: employee, isLoading: employeeLoading } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, company:companies(name)")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  if (authLoading || employeeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-destructive">Accesso Negato</h1>
          <p className="text-muted-foreground">
            Il tuo account non è associato a nessun profilo dipendente.
          </p>
          <Link to="/login">
            <Button>Torna al Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <EmployeeSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <QuickLoginReturnBanner />
          {/* Header desktop — nascosto su mobile */}
          <header className="hidden md:flex h-14 border-b items-center px-4 gap-4 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <span className="font-medium">Area Dipendente</span>
          </header>
          {/* Contenuto con padding bottom per la bottom nav mobile */}
          <div className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6 overflow-auto">
            <Outlet />
          </div>
        </main>
        {/* Bottom nav mobile */}
        <EmployeeBottomNav />
      </div>
    </SidebarProvider>
  );
}
