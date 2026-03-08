import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bot, Headphones, Phone, CreditCard } from "lucide-react";

const links = [
  { to: "/azienda/agente-interno", label: "Agenti Interni", icon: Bot, end: true },
  { to: "/azienda/agente-interno/chiamate", label: "Chiamate", icon: Headphones },
  { to: "/azienda/agente-interno/campagne", label: "Campagne", icon: Phone },
];

export function InternalAgentSidebar() {
  const location = useLocation();

  return (
    <nav className="flex flex-wrap gap-1 mb-6 p-1 rounded-lg bg-muted/50 border">
      {links.map((link) => {
        const isActive = (link as any).end
          ? location.pathname === link.to
          : location.pathname.startsWith(link.to);

        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={(link as any).end}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <link.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{link.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
