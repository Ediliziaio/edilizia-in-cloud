/**
 * Layout per l'area campo (operai e subappaltatori).
 * Usa la stessa UX white-sidebar dell'app principale.
 * Su mobile la sidebar diventa un sheet laterale.
 */
import { Outlet } from "react-router-dom";
import {
  Home,
  Calendar,
  MessageSquare,
  HardHat,
  Eye,
  LogOut,
  ClipboardCheck,
  FileText,
  Mic,
  Shield,
  CreditCard,
  Ticket,
  Settings,
  Clock,
  CalendarDays,
  Receipt,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePreviewToken } from "@/hooks/usePreviewToken";
import { PreviewSessionContext } from "@/contexts/PreviewSessionContext";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import OfflineBanner from "@/components/campo/OfflineBanner";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { CampoBottomNav } from "@/components/campo/CampoBottomNav";
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
} from "@/components/ui/sidebar";
import { CompanyContextSwitcher } from "@/components/layouts/CompanyContextSwitcher";

type CampoNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
};

export default function CampoLayout() {
  const { profile, user, signOut, company, effectiveCompany } = useAuth();
  const { isOperaio } = useIsCampo();
  const activeCompany = effectiveCompany ?? company;

  // Conta messaggi non letti
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["campo-unread", user?.id],
    queryFn: async () => {
      if (!user?.id || !profile?.company_id) return 0;
      const { data: membership } = await supabase
        .from("chat_channel_members")
        .select("channel_id")
        .eq("user_id", user.id);
      if (!membership?.length) return 0;
      const channelIds = membership.map((member: { channel_id: string }) => member.channel_id);
      const since = new Date();
      since.setDate(since.getDate() - 1);
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("channel_id", channelIds)
        .neq("sender_id", user.id)
        .gte("created_at", since.toISOString());
      return count ?? 0;
    },
    refetchInterval: 30000,
    enabled: !!user?.id && !!profile?.company_id,
  });

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");
  const previewSession = usePreviewToken();
  const roleLabel = isOperaio ? "Operaio" : "Subappaltatore";

  // Nav items per operaio
  const operaioItems: CampoNavItem[] = [
    { title: "Home", url: "/campo", icon: Home, end: true },
    { title: "Lavori", url: "/campo/calendario", icon: Calendar },
    { title: "Attività", url: "/campo/attivita", icon: ClipboardCheck },
    { title: "Presenze", url: "/campo/presenze", icon: Clock },
    { title: "Ferie e Permessi", url: "/campo/ferie", icon: CalendarDays },
    { title: "Cedolini", url: "/campo/cedolini", icon: Receipt },
    { title: "Rapportino Vocale", url: "/campo/rapportino-vocale", icon: Mic },
    { title: "Chat", url: "/campo/chat", icon: MessageSquare, badge: unreadCount },
    { title: "Sicurezza", url: "/campo/sicurezza", icon: Shield },
    { title: "Tesserino", url: "/campo/tesserino", icon: CreditCard },
    { title: "Documenti", url: "/campo/documenti", icon: FileText },
    { title: "Apri Ticket", url: "/campo/ticket/nuovo", icon: Ticket },
    { title: "Impostazioni", url: "/campo/impostazioni", icon: Settings },
  ];

  // Nav items per subappaltatore
  const subItems: CampoNavItem[] = [
    { title: "Home", url: "/campo", icon: Home, end: true },
    { title: "Lavori", url: "/campo/calendario", icon: Calendar },
    { title: "Attività", url: "/campo/attivita", icon: ClipboardCheck },
    { title: "Rapportino Vocale", url: "/campo/rapportino-vocale", icon: Mic },
    { title: "Chat", url: "/campo/chat", icon: MessageSquare, badge: unreadCount },
    { title: "Sicurezza", url: "/campo/sicurezza", icon: Shield },
    { title: "SAL", url: "/campo/sal", icon: ClipboardCheck },
    { title: "Documenti", url: "/campo/documenti", icon: FileText },
    { title: "Apri Ticket", url: "/campo/ticket/nuovo", icon: Ticket },
    { title: "Impostazioni", url: "/campo/impostazioni", icon: Settings },
  ];

  const navItems = isOperaio ? operaioItems : subItems;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        {/* Sidebar */}
        <Sidebar collapsible="icon" className="border-r">
          <div className="space-y-2 border-b px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <HardHat className="w-4 h-4 text-primary" />
              </div>
              <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">
                  {roleLabel}
                </p>
                <p className="text-sm font-semibold truncate leading-tight">
                  {profile?.first_name} {profile?.last_name}
                </p>
              </div>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <CompanyContextSwitcher showSecurityNote={false} />
            </div>
          </div>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>
                {isOperaio ? "Area Operaio" : "Area Subappaltatore"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.end}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          activeClassName="bg-accent text-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.title}</span>
                          {!!item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1">
                              {item.badge > 9 ? "9+" : item.badge}
                            </Badge>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* Footer */}
          <div className="mt-auto border-t p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors group-data-[collapsible=icon]:hidden"
                title="Esci"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 group-data-[collapsible=icon]:hidden">
              <PoweredByBadge />
            </div>
          </div>
        </Sidebar>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <OfflineBanner />

          {/* Preview banners */}
          {previewSession.isPreview && (
            <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                Modalit&agrave; SuperAdmin — Visualizzazione come: {roleLabel} (sola lettura)
              </span>
            </div>
          )}
          {previewSession.error && (
            <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive text-center">
              Token preview non valido: {previewSession.error}
            </div>
          )}

          {/* Top bar — hidden on mobile (bottom nav replaces it) */}
          <header className="hidden md:flex h-14 border-b bg-secondary items-center gap-3 px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2 text-sm text-secondary-foreground/80">
              <HardHat className="h-4 w-4" />
              <span>Area {roleLabel}</span>
              {activeCompany?.name && (
                <>
                  <span className="text-secondary-foreground/40">&middot;</span>
                  <span className="font-medium text-secondary-foreground">{activeCompany.name}</span>
                </>
              )}
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 px-3 py-3 sm:px-4 md:p-6 pb-28 md:pb-6">
            <PreviewSessionContext.Provider value={previewSession}>
              <ErrorBoundary title="Errore nel caricamento della pagina">
                <Outlet />
              </ErrorBoundary>
            </PreviewSessionContext.Provider>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <CampoBottomNav unreadCount={unreadCount} />
      </div>
    </SidebarProvider>
  );
}
