import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { LayoutDashboard, ShoppingBag, Wallet, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/venditore", icon: LayoutDashboard, exact: true },
  { name: "I Miei Ordini", href: "/venditore/ordini", icon: ShoppingBag },
  { name: "Guadagni", href: "/venditore/guadagni", icon: Wallet },
  { name: "Profilo", href: "/venditore/profilo", icon: User },
];

/* ── Bottom nav mobile ─────────────────────────────────── */
function SalespersonBottomNav() {
  const location = useLocation();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigazione venditore"
    >
      <div className="flex items-stretch h-16">
        {navigation.map(({ name, icon: Icon, href, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              to={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
              aria-label={name}
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
                {name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Layout ────────────────────────────────────────────── */
export function SalespersonLayout() {
  const { signOut, profile } = useAuth();
  const location = useLocation();

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  return (
    <div className="min-h-screen bg-muted/30">
      <QuickLoginReturnBanner />

      {/* Header — compatto su mobile */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link to="/venditore" className="font-bold text-base md:text-lg">
              Area Venditore
            </Link>
            {/* Nav desktop */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = item.href === "/venditore"
                  ? location.pathname === item.href
                  : location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {profile?.first_name} {profile?.last_name}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content — padding bottom per bottom nav mobile */}
      <main className="p-4 md:p-6 pb-20 md:pb-6">
        <ErrorBoundary title="Errore nel caricamento della pagina">
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Bottom nav mobile */}
      <SalespersonBottomNav />
    </div>
  );
}
