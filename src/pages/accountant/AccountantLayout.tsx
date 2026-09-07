/**
 * Layout del portale commercialista
 *
 * Sidebar fissa a sinistra con:
 *  - Header: logo studio + nome firm
 *  - Nav primaria: Cruscotto / Aziende / Inbox / Team / Profilo
 *  - Badge live count per Inbox (notifiche non lette + inviti pending)
 *  - Footer: user info + logout
 *
 * Content: <Outlet /> per nested routes.
 */

import { ReactNode, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import {
  Bell,
  Building2,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Settings,
  Users,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAccountantFirm,
  useAccountantCompanies,
  useAccountantNotifications,
  useAccountantNotificationsRealtime,
} from "@/hooks/accountant/useAccountantPortalData";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";

interface SidebarItemDef {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: number;
}

function SidebarItem({ to, label, icon: Icon, end, badge }: SidebarItemDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-white text-blue-700 shadow-sm"
            : "text-white/70 hover:bg-white/10 hover:text-white",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          {badge > 99 ? "99+" : badge}
        </Badge>
      )}
    </NavLink>
  );
}

export default function AccountantLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: firm, isLoading: isLoadingFirm } = useAccountantFirm();
  const { data: companies = [] } = useAccountantCompanies();
  useAccountantNotificationsRealtime();
  const { data: notifications = [] } = useAccountantNotifications();

  const pendingInvites = useMemo(
    () => companies.filter((c) => c.status === "invited").length,
    [companies],
  );
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );
  const inboxBadge = pendingInvites + unreadNotifications;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar semplificata: rimosso "Aziende clienti" duplicato — la lista è
  // direttamente nel Cruscotto, da lì si entra nella piattaforma cliente.
  const sidebarItems: SidebarItemDef[] = useMemo(
    () => [
      { to: "/commercialista", label: "Cruscotto", icon: LayoutDashboard, end: true },
      { to: "/commercialista/inbox", label: "Inbox", icon: Bell, badge: inboxBadge },
      { to: "/commercialista/richieste", label: "Le mie richieste", icon: ListChecks },
      { to: "/commercialista/team", label: "Team studio", icon: Users },
      { to: "/commercialista/profilo", label: "Profilo studio", icon: Settings },
    ],
    [inboxBadge],
  );

  if (isLoadingFirm) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07111f]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm text-white/70">Caricamento studio...</p>
        </div>
      </div>
    );
  }

  if (!firm) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07111f] p-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl">
          <Building2 className="mx-auto h-14 w-14 text-amber-500" />
          <h2 className="mt-4 text-xl font-bold text-slate-950">Nessuno studio collegato</h2>
          <p className="mt-2 text-sm text-slate-600">
            Il tuo account non è associato ad alcuno studio commercialista. Contatta il
            super admin di Edilizia in Cloud per essere assegnato a uno studio esistente,
            oppure registra un nuovo studio.
          </p>
          <Button
            className="mt-6 w-full bg-blue-700 text-white hover:bg-blue-800"
            onClick={() => navigate("/commercialista-login?signup=1")}
          >
            Registra il tuo studio
          </Button>
          <Button
            variant="ghost"
            className="mt-2 w-full text-slate-600 hover:text-slate-900"
            onClick={async () => {
              await signOut();
              navigate("/commercialista-login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Esci con un altro account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[#07111f] lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <img
            src={ediliziaLogo}
            alt="Edilizia in Cloud"
            className="h-7 w-auto object-contain brightness-0 invert"
          />
          <div className="mt-4 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Portale studio
            </p>
            <p className="truncate text-sm font-semibold text-white">{firm.name}</p>
            {firm.vat_number && (
              <p className="text-xs text-white/50">P.IVA {firm.vat_number}</p>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {sidebarItems.map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={async () => {
              await signOut();
              navigate("/commercialista-login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Mobile top bar (sidebar sostituita da menu drawer in futuro) */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Apri il menu dello studio"
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-0 bg-[#07111f] p-0 text-white">
                <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
                  <img loading="lazy" src={ediliziaLogo} alt="" className="h-6 w-auto" />
                  <span className="truncate text-sm font-semibold">{firm.name}</span>
                </div>
                <nav className="flex flex-col gap-1 p-3">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SheetClose asChild key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                              isActive
                                ? "bg-white/10 text-white"
                                : "text-white/70 hover:bg-white/10 hover:text-white",
                            )
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <Badge className="bg-red-500 text-white">
                              {item.badge > 99 ? "99+" : item.badge}
                            </Badge>
                          )}
                        </NavLink>
                      </SheetClose>
                    );
                  })}
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await signOut();
                      }}
                      className="mt-2 w-full justify-start gap-2 text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <LogOut className="h-4 w-4" /> Esci
                    </Button>
                  </SheetClose>
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/commercialista" className="flex items-center gap-2">
              <img loading="lazy" src={ediliziaLogo} alt="" className="h-6 w-auto" />
              <span className="text-sm font-semibold">{firm.name}</span>
            </Link>
          </div>
          <Link
            to="/commercialista/inbox"
            className="relative rounded-lg p-2 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {inboxBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {inboxBadge > 9 ? "9+" : inboxBadge}
              </span>
            )}
          </Link>
        </header>

        {/* Ritorno a admin dopo "Accedi come utente" su un commercialista. */}
        <QuickLoginReturnBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
