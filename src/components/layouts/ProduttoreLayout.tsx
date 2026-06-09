import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Factory, Users, Palette, Wallet, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

const NAV = [
  { to: "/produttore", end: true, label: "Rivenditori", Icon: Users },
  { to: "/produttore/branding", end: false, label: "Brand & dominio", Icon: Palette },
  { to: "/produttore/fatturazione", end: false, label: "Fatturazione", Icon: Wallet },
  { to: "/produttore/impostazioni", end: false, label: "Impostazioni", Icon: Settings },
];

/**
 * Layout dedicato dell'area Produttore (produttore.ediliziaincloud.com).
 * Responsive: sidebar su desktop (lg+), top-bar orizzontale su mobile.
 */
export function ProduttoreLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/produttore-login", { replace: true });
  };

  return (
    <div className="flex h-dvh flex-col bg-slate-50 lg:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-white lg:flex">
        <div className="border-b p-4">
          <img src={ediliziaLogo} alt="Edilizia in Cloud" className="h-8 object-contain" />
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Factory className="h-3.5 w-3.5" /> Area Produttore
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" /> Esci
          </Button>
        </div>
      </aside>

      {/* Top-bar — mobile */}
      <header className="flex items-center gap-2 border-b bg-white px-3 py-2 lg:hidden">
        <Factory className="h-5 w-5 shrink-0 text-primary" />
        <nav className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={handleLogout}
          aria-label="Esci"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
