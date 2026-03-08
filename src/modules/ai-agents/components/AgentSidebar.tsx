import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bot, Database, Phone, MessageCircle, CreditCard, Settings, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const baseLinks = [
  { to: "/azienda/marketing/agente-ai", label: "Agenti", icon: Bot, end: true },
  { to: "/azienda/marketing/agente-ai/knowledge-base", label: "Knowledge Base", icon: Database },
  { to: "/azienda/marketing/agente-ai/numeri-telefono", label: "Numeri di Telefono", icon: Phone },
  { to: "/azienda/marketing/agente-ai/whatsapp", label: "WhatsApp", icon: MessageCircle, badge: "Alpha" },
  { to: "/azienda/marketing/agente-ai/crediti", label: "Crediti & Utilizzo", icon: CreditCard },
];

export function AgentSidebar() {
  const location = useLocation();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const links = [
    ...baseLinks,
    ...(isSuperAdmin
      ? [{ to: "/azienda/marketing/agente-ai/impostazioni", label: "Impostazioni", icon: Settings }]
      : [{ to: "/azienda/marketing/agente-ai/il-mio-piano", label: "Il mio piano", icon: FileText }]),
  ];

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
            {(link as any).badge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {(link as any).badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
