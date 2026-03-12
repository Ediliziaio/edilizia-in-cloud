import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

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
  "/admin/cs-tasks": "CS Tasks",
  "/admin/piani": "Piani",
  "/admin/feature-flags": "Feature Flags",
  "/admin/annunci": "Annunci",
  "/admin/sync-logs": "Sync Logs",
  "/admin/gdpr": "GDPR",
  "/admin/referral": "Referral",
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
  "/admin/impostazioni/piattaforma": "Piattaforma",
  "/admin/impostazioni/notifiche": "Notifiche",
  "/admin/impostazioni/super-admin": "Super Admin",
  "/admin/impostazioni/audit": "Registro Attività",
  "/admin/impostazioni/email": "Email",
  "/admin/impostazioni/agenti-ai": "Agenti AI",
  "/admin/impostazioni/ip-allowlist": "IP Allowlist",
  "/admin/impostazioni/sicurezza": "Sicurezza",
  "/admin/impostazioni/feature-flags": "Feature Flags",
  "/admin/impostazioni/integrazioni": "Integrazioni",
  "/admin/impostazioni/banking": "Banking",
};

export function AdminBreadcrumb() {
  const location = useLocation();
  const params = useParams();

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
