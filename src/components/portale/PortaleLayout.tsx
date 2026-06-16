import { Link, useLocation } from "react-router-dom";
import { Home, Wrench, ClipboardList, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortaleCliente } from "@/hooks/usePortaleAuth";

interface PortaleLayoutProps {
  children: React.ReactNode;
  cliente: PortaleCliente;
  token: string;
}

export function PortaleLayout({ children, cliente, token }: PortaleLayoutProps) {
  const location = useLocation();

  const navItems = [
    { label: "Home", icon: Home, href: `/portale/${token}`, exact: true },
    { label: "Impianti", icon: Wrench, href: `/portale/${token}/impianti`, exact: false },
    { label: "Richieste", icon: ClipboardList, href: `/portale/${token}/richieste`, exact: false },
    { label: "Notifiche", icon: Bell, href: `/portale/${token}/notifiche`, exact: false },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  const initials =
    (cliente.first_name?.[0] ?? "").toUpperCase() +
    (cliente.last_name?.[0] ?? "").toUpperCase();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-gray-50">
      {/* Header */}
      {/* NIENTE env(safe-area-inset-top) qui: in app nativa il padding-top del body
          (html.capacitor body) riserva già il notch UNA volta; sommarlo qui lo
          raddoppiava → spazio bianco. In web env()=0, resta solo 0.75rem. */}
      <header className="flex-none bg-[#1E3A5F] px-4 pb-3 flex items-center justify-between"
        style={{ paddingTop: "0.75rem" }}
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-blue-200 font-medium uppercase tracking-wider leading-none">
              Portale Cliente
            </p>
            <p className="text-base font-bold text-white leading-tight mt-0.5">
              {cliente.company_name}
            </p>
          </div>
        </div>

        <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {initials || "?"}
        </div>
      </header>

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigazione portale"
      >
        <div className="flex items-stretch h-16">
          {navItems.map(({ label, icon: Icon, href, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                to={href}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative min-w-0"
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-2xl transition-all duration-200",
                    active ? "bg-orange-100 w-14 h-8" : "w-10 h-8"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-all duration-200",
                      active ? "text-orange-500 stroke-[2.5]" : "text-gray-400 stroke-[1.5]"
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-all duration-200",
                    active ? "text-orange-500 font-semibold" : "text-gray-400 font-medium"
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
