import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Factory, Users, Palette, Wallet, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

const NAV = [
  { to: "/produttore", end: true, label: "Rivenditori", Icon: Users },
  { to: "/produttore/branding", end: false, label: "Brand & dominio", Icon: Palette },
  { to: "/produttore/fatturazione", end: false, label: "Fatturazione", Icon: Wallet },
];

/**
 * Layout dedicato dell'area Produttore (produttore.ediliziaincloud.com).
 * Snello e separato dall'app azienda: qui il produttore gestisce SOLO i suoi
 * rivenditori, il brand e la fatturazione. Specchiato sul pattern referral/partner.
 */
export function ProduttoreLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-dvh bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
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
            onClick={async () => {
              await signOut();
              navigate("/produttore-login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Esci
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
