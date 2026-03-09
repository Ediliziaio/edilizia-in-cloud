import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Gift, LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";

function PartnerSidebar() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  const initials = `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase() || "P";

  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/partner" className="flex items-center gap-2">
          <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
        </Link>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/partner" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                    <Gift className="h-4 w-4" /><span>Dashboard</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/profilo" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" activeClassName="bg-muted text-foreground font-medium">
                    <User className="h-4 w-4" /><span>Profilo</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto border-t p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.first_name} {profile?.last_name}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>
    </Sidebar>
  );
}

export function PartnerLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <PartnerSidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex h-14 items-center border-b px-4 lg:hidden">
            <SidebarTrigger />
          </div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
