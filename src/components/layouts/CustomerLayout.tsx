import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { Eye, LogOut, PenTool } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useCustomCSS } from "@/hooks/useCustomCSS";
import { usePreviewToken } from "@/hooks/usePreviewToken";
import { PreviewSessionContext } from "@/contexts/PreviewSessionContext";
import {
  ClipboardList,
  HeadphonesIcon,
  User,
  FileText,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { NavLink } from "@/components/NavLink";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { useCustomerUnreadCount } from "@/hooks/useCustomerUnreadCount";
import { CustomerBottomNav } from "@/components/cliente/CustomerBottomNav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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

const navItems = [
  { title: "I Miei Ordini", url: "/cliente", icon: ClipboardList, end: true },
  { title: "Documenti", url: "/cliente/documenti", icon: FileText },
  { title: "Firma Documenti", url: "/cliente/firma", icon: PenTool },
  { title: "Stato Pagamenti", url: "/cliente/rate", icon: CreditCard },
  { title: "Appuntamenti", url: "/cliente/appuntamenti", icon: CalendarDays },
  { title: "Assistenza", url: "/cliente/assistenza", icon: HeadphonesIcon },
  { title: "Il Mio Profilo", url: "/cliente/profilo", icon: User },
];

export function CustomerLayout() {
  const { signOut, company, profile } = useAuth();
  const { effectiveBrand } = useBrandSettings(company?.id);
  useCustomCSS();
  const unreadCount = useCustomerUnreadCount();
  const previewSession = usePreviewToken();

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  // Apply CSS variables for brand colors
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveBrand.isWhiteLabel) {
      root.style.setProperty("--brand-primary", effectiveBrand.primaryColor);
      root.style.setProperty("--brand-secondary", effectiveBrand.secondaryColor);
      root.style.setProperty("--brand-accent", effectiveBrand.accentColor);
      root.style.setProperty("--brand-text-on-primary", effectiveBrand.textOnPrimary);
      if (effectiveBrand.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
        link.href = effectiveBrand.faviconUrl;
      }
      if (effectiveBrand.platformName) document.title = effectiveBrand.platformName;
    } else {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-text-on-primary");
    }
    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-text-on-primary");
    };
  }, [effectiveBrand]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        {/* Sidebar */}
        <Sidebar collapsible="icon" className="border-r">
          <div className="flex h-14 items-center border-b px-4">
            <Link to="/cliente" className="flex items-center gap-2 overflow-hidden">
              {company?.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="h-7 max-h-7 object-contain" />
              ) : effectiveBrand.platformName ? (
                <span className="font-semibold text-sm truncate">{effectiveBrand.platformName}</span>
              ) : (
                <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-7" />
              )}
            </Link>
          </div>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Area Cliente</SidebarGroupLabel>
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
                          {item.title === "Assistenza" && unreadCount > 0 && (
                            <span className="ml-auto h-5 min-w-5 px-1 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] font-bold">
                              {unreadCount}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* Sidebar Footer — user info + logout */}
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
            {!effectiveBrand.hidePoweredBy && (
              <div className="mt-2 group-data-[collapsible=icon]:hidden">
                <PoweredByBadge />
              </div>
            )}
          </div>
        </Sidebar>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <QuickLoginReturnBanner />

          {/* Preview banner */}
          {previewSession.isPreview && (
            <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                Modalità SuperAdmin — Visualizzazione come: Cliente (sola lettura)
              </span>
            </div>
          )}
          {previewSession.error && (
            <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive text-center">
              Token preview non valido: {previewSession.error}
            </div>
          )}

          {/* Top bar — hidden on mobile (bottom nav replaces it) */}
          <header className="hidden md:flex h-14 border-b bg-background items-center gap-3 px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              <span>Area Cliente</span>
              {company?.name && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="font-medium text-foreground">{company.name}</span>
                </>
              )}
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
            <PreviewSessionContext.Provider value={previewSession}>
              <Outlet />
            </PreviewSessionContext.Provider>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <CustomerBottomNav unreadCount={unreadCount} />
      </div>
    </SidebarProvider>
  );
}
