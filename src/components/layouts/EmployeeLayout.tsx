import { Outlet, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, 
  Clock, 
  CalendarDays, 
  User, 
  LogOut,
  Menu
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

const navigationItems = [
  { title: "Dashboard", url: "/dipendente", icon: Home },
  { title: "Registra Ore", url: "/dipendente/ore", icon: Clock },
  { title: "I Miei Rapportini", url: "/dipendente/rapportini", icon: CalendarDays },
  { title: "Profilo", url: "/dipendente/profilo", icon: User },
];

function EmployeeSidebar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // Fetch employee profile
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
    staleTime: 10 * 60 * 1000, // 10 minuti
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
                  {(employee?.company as any)?.name || "Dipendente"}
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
                      activeClassName="bg-muted text-primary font-medium"
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

export function EmployeeLayout() {
  const { user, isLoading: authLoading } = useAuth();

  // Verify employee has valid profile
  const { data: employee, isLoading: employeeLoading } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
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
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <span className="font-medium">Area Dipendente</span>
          </header>
          <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
