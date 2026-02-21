import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Building2,
  Package,
  ListOrdered,
  Truck,
  Users,
  UserCheck,
  HardHat,
  Key,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";

interface SettingsNavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const settingsGroups: { label: string; items: SettingsNavItem[] }[] = [
  {
    label: "La mia azienda",
    items: [
      { title: "Profilo aziendale", url: "/azienda/impostazioni/profilo", icon: Building2 },
      { title: "Catalogo articoli", url: "/azienda/impostazioni/catalogo", icon: Package },
    ],
  },
  {
    label: "Gestione ordini",
    items: [
      { title: "Stati ordine", url: "/azienda/impostazioni/stati-ordine", icon: ListOrdered },
      { title: "Fornitori", url: "/azienda/impostazioni/fornitori", icon: Truck },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "Utenti", url: "/azienda/impostazioni/utenti", icon: Users, adminOnly: true },
      { title: "Venditori", url: "/azienda/impostazioni/venditori", icon: UserCheck, adminOnly: true },
      { title: "Staff / Operai", url: "/azienda/impostazioni/staff", icon: HardHat, adminOnly: true },
    ],
  },
  {
    label: "Sicurezza e log",
    items: [
      { title: "Cambio password", url: "/azienda/impostazioni/sicurezza", icon: Key },
      { title: "Registro attività", url: "/azienda/impostazioni/attivita", icon: ScrollText, adminOnly: true },
    ],
  },
];

export function SettingsLayout() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  return (
    <div className="flex min-h-[calc(100vh-8rem)] -m-6">
      {/* Settings Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-background p-4 flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 mb-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/azienda")}
        >
          <ArrowLeft className="h-4 w-4" />
          Torna indietro
        </Button>

        <h2 className="text-lg font-semibold px-3 mb-4">Impostazioni</h2>

        {settingsGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || isAdmin
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
                {group.label}
              </p>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  activeClassName="bg-muted text-foreground font-medium"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </aside>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
