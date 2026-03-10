import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { 
  ClipboardList, 
  HeadphonesIcon,
  User,
  LogOut,
  Menu,
  FileText,
  CreditCard,
  CalendarDays,
  MessageCircle,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavLink } from "@/components/NavLink";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { useCustomerUnreadCount } from "@/hooks/useCustomerUnreadCount";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Ordini", url: "/cliente", icon: ClipboardList },
  { title: "Documenti", url: "/cliente/documenti", icon: FileText },
  { title: "Rate", url: "/cliente/rate", icon: CreditCard },
  { title: "Appuntamenti", url: "/cliente/appuntamenti", icon: CalendarDays },
  { title: "Messaggi", url: "/cliente/messaggi", icon: MessageCircle, badge: true },
  { title: "Assistenza", url: "/cliente/assistenza", icon: HeadphonesIcon },
  { title: "Profilo", url: "/cliente/profilo", icon: User },
];

export function CustomerLayout() {
  const { signOut, company, profile } = useAuth();
  const { effectiveBrand } = useBrandSettings(company?.id);
  const unreadCount = useCustomerUnreadCount();

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
    <div className="min-h-screen flex flex-col bg-muted/30">
      <QuickLoginReturnBanner />
      {/* Header */}
      <header className="h-14 border-b bg-background sticky top-0 z-50">
        <div className="h-full max-w-4xl mx-auto px-4 flex items-center justify-between">
          <Link to="/cliente" className="flex items-center gap-2">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-8 max-h-8 object-contain" />
            ) : effectiveBrand.platformName ? (
              <span className="font-semibold text-sm">{effectiveBrand.platformName}</span>
            ) : (
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
            )}
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              {navItems.map((item) => (
                <DropdownMenuItem key={item.url} asChild>
                  <Link to={item.url} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.title}
                    {item.badge && unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1">
                        {unreadCount}
                      </Badge>
                    )}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Navigation Tabs - Mobile Friendly */}
      <nav className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/cliente"}
                className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent whitespace-nowrap transition-colors hover:text-foreground"
                activeClassName="text-foreground border-primary font-medium"
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
      {!effectiveBrand.hidePoweredBy && (
        <footer className="text-center py-2 text-xs text-muted-foreground border-t bg-background">
          Powered by EdiliziaInCloud
        </footer>
      )}
    </div>
  );
}
