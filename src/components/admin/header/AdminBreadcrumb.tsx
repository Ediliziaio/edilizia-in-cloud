import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

const ROUTE_MAP: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/aziende": "Aziende",
  "/admin/aziende/nuova": "Nuova Azienda",
  "/admin/ticket": "Assistenza",
  "/admin/lifecycle": "Lifecycle",
  "/admin/customer-success": "CS Onboarding",
  "/admin/attivita": "Attività",
  "/admin/chat": "Chat team",
  "/admin/cs-tasks": "Attività", // alias retrocompat (redirige a /admin/attivita?tab=tutte)
  "/admin/piani": "Piani",
  "/admin/fatturato": "Fatturato",
  "/admin/revenue": "Revenue",
  "/admin/fatture": "Fatture",
  "/admin/promo-codes": "Promo",
  "/admin/dunning": "Dunning",
  "/admin/cs": "Assistenza Clienti",
  "/admin/cs-dashboard": "Assistenza Clienti",
  "/admin/portale-formazione": "Portale Formazione",
  "/admin/operazioni": "Operazioni",
  "/admin/ai": "Intelligenza Artificiale",
  "/admin/ai-operate": "AI · Operate",
  "/admin/ai-monitor": "AI · Monitor",
  "/admin/ai-config": "AI · Config",
  "/admin/ai-memoria": "AI · Memoria",
  "/admin/sync-logs": "Sync Logs",
  "/admin/failure-alerts": "Alert Failure",
  "/admin/csv-import": "Import CSV",
  "/admin/audit-log": "Audit Log",
  "/admin/feature-flags": "Funzionalità Azienda",
  "/admin/annunci": "Annunci",
  "/admin/gdpr": "GDPR",
  "/admin/referral": "Referral",
  "/admin/ai-usage": "Monitor AI",
  "/admin/marketing": "Marketing",
  "/admin/marketing/contatti": "Contatti",
  "/admin/marketing/opportunita": "Opportunità",
  "/admin/marketing/calendario": "Calendario",
  "/admin/marketing/email": "Email Marketing",
  "/admin/marketing/whatsapp": "WhatsApp",
  "/admin/marketing/automazioni": "Automazioni",
  "/admin/marketing/agenti-ai": "Agenti AI",
  "/admin/impostazioni": "Impostazioni",
  "/admin/impostazioni/profilo": "Profilo",
  "/admin/impostazioni/mio-profilo": "Il mio profilo",
  "/admin/impostazioni/preferenze-email": "Preferenze email",
  "/admin/impostazioni/dominio-email": "Dominio email",
  "/admin/email": "Email",
  "/admin/impostazioni/piattaforma": "Piattaforma",
  "/admin/impostazioni/notifiche": "Notifiche",
  "/admin/impostazioni/super-admin": "Super Admin",
  "/admin/impostazioni/audit": "Registro Attività",
  "/admin/impostazioni/email": "Email",
  "/admin/impostazioni/agenti-ai": "Agenti AI",
  "/admin/impostazioni/ip-allowlist": "IP Allowlist",
  "/admin/impostazioni/sicurezza": "Sicurezza",
  "/admin/impostazioni/integrazioni": "Integrazioni",
  "/admin/impostazioni/api-mcp": "API & MCP",
  "/admin/impostazioni/whatsapp-locale": "WhatsApp Locale",
  "/admin/impostazioni/banking": "Banking",
};

export function AdminBreadcrumb() {
  const location = useLocation();
  const isMobile = useIsMobile();

  const segments = useMemo(() => {
    const path = location.pathname;
    const result: BreadcrumbSegment[] = [];

    // Always start with Dashboard
    if (path !== "/admin") {
      result.push({ label: "Dashboard", href: "/admin" });
    }

    // Marketing section
    if (path.startsWith("/admin/marketing")) {
      if (path !== "/admin/marketing") {
        result.push({ label: "Marketing", href: "/admin/marketing" });
      }
      // Contact detail
      if (path.match(/\/admin\/marketing\/contatti\/[^/]+/)) {
        result.push({ label: "Contatti", href: "/admin/marketing/contatti" });
        result.push({ label: "Dettaglio Contatto" });
        return result;
      }
    }

    // Settings section
    if (path.startsWith("/admin/impostazioni")) {
      result.push({ label: "Impostazioni", href: "/admin/impostazioni/profilo" });
      const settingsPage = ROUTE_MAP[path];
      if (settingsPage && path !== "/admin/impostazioni") {
        result.push({ label: settingsPage });
      }
      return result;
    }

    // Company detail
    if (path.match(/\/admin\/aziende\/[^/]+/) && !path.endsWith("/nuova")) {
      result.push({ label: "Aziende", href: "/admin/aziende" });
      result.push({ label: "Dettaglio Azienda" });
      return result;
    }

    // Direct route match
    const label = ROUTE_MAP[path];
    if (label) {
      result.push({ label });
    }

    return result;
  }, [location.pathname]);

  if (segments.length === 0) return null;

  // Mobile: show only the last segment as page title — clean and compact
  if (isMobile) {
    const lastSeg = segments[segments.length - 1];
    const parentSeg = segments.length > 1 ? segments[segments.length - 2] : null;
    return (
      <nav className="flex items-center gap-1.5 min-w-0" aria-label="Breadcrumb">
        {parentSeg?.href ? (
          <Link to={parentSeg.href} className="text-muted-foreground shrink-0 flex items-center">
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          </Link>
        ) : (
          <Link to="/admin" className="text-muted-foreground shrink-0 flex items-center">
            <Home className="h-3.5 w-3.5" />
          </Link>
        )}
        <span className="text-sm font-semibold text-foreground truncate">
          {lastSeg.label}
        </span>
      </nav>
    );
  }

  // Desktop: full breadcrumb trail
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <div key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            {seg.href && !isLast ? (
              <Link
                to={seg.href}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
              >
                {seg.label}
              </Link>
            ) : (
              <span className={cn("text-xs font-medium", isLast ? "text-foreground" : "text-muted-foreground")}>
                {seg.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
