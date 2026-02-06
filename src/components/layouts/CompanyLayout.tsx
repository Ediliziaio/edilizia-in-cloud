import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Building2, 
  LayoutDashboard, 
  ClipboardList, 
  Users, 
  HeadphonesIcon,
  Settings,
  LogOut,
  TrendingUp
} from "lucide-react";
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

const navItems = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList },
  { title: "Clienti", url: "/azienda/clienti", icon: Users },
  { title: "Assistenza", url: "/azienda/assistenza", icon: HeadphonesIcon },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp },
  { title: "Impostazioni", url: "/azienda/impostazioni", icon: Settings },
];

function CompanySidebar() {
  const { signOut, company, profile } = useAuth();
  
  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/azienda" className="flex items-center gap-2">
          {company?.logo_url ? (
            <Avatar className="h-8 w-8">
              <AvatarImage src={company.logo_url} alt={company.name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {company.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Building2 className="h-6 w-6 text-primary" />
          )}
          <span className="font-semibold text-foreground truncate max-w-[160px]">
            {company?.name || "La tua azienda"}
          </span>
        </Link>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
                Admin
              </p>
            </div>
          </div>
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

export function CompanyLayout() {
  const { company } = useAuth();
  
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CompanySidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {company?.name}
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
