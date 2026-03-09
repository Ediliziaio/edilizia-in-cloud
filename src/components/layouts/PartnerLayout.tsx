import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, LogOut, User, Link2, DollarSign, Wallet, FolderDown, LayoutDashboard } from "lucide-react";
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

const MENU_ITEMS = [
  { to: "/partner", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/partner/link", label: "Il Mio Link", icon: Link2 },
  { to: "/partner/commissioni", label: "Commissioni", icon: DollarSign },
  { to: "/partner/payout", label: "Payout", icon: Wallet },
  { to: "/partner/materiali", label: "Materiali", icon: FolderDown },
  { to: "/partner/profilo", label: "Profilo", icon: User },
];

function PartnerSidebar() {
  const { signOut, profile, user } = useAuth();

  const { data: referrer } = useQuery({
    queryKey: ["my-referrer-sidebar", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("name, referral_tiers(name, icon, color)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const initials = `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase() || "P";
  const tier = (referrer as any)?.referral_tiers;

  return (
    <Sidebar className="border-r">
      <div className="flex h-14 items-center border-b px-4 justify-between">
        <Link to="/partner" className="flex items-center gap-2">
          <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
        </Link>
        {tier && (
          <Badge
            className="text-xs px-2 py-0.5"
            style={{ backgroundColor: tier.color, color: "#fff" }}
          >
            {tier.icon} {tier.name}
          </Badge>
        )}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MENU_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeClassName="bg-muted text-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
            <p className="text-sm font-medium truncate">{referrer?.name || `${profile?.first_name} ${profile?.last_name}`}</p>
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
