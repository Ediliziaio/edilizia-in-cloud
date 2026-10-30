import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

// Una voce per ogni pagina vera (i rimandi non servono: l'indirizzo cambia
// prima che il breadcrumb si veda). Senza voce il titolo restava vuoto.
const ROUTE_MAP: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/aziende": "Aziende",
  "/admin/utenti": "Utenti",
  "/admin/attivita": "Attività",
  "/admin/chat": "Chat team",
  "/admin/email": "Email",
  "/admin/email/ai": "AI della casella email",
  "/admin/fatturato": "Fatturato",
  "/admin/insoluti": "Insoluti",
  "/admin/fatturazione-elettronica": "Fatturazione elettronica",
  "/admin/cohort": "Coorti di ricavo",
  "/admin/dunning-templates": "Modelli recupero pagamenti",
  "/admin/referral": "Referral",
  "/admin/produttori": "Produttori",
  "/admin/commercialisti": "Commercialisti",
  "/admin/cs": "Assistenza Clienti",
  "/admin/portale-formazione": "Portale Formazione",
  "/admin/ai": "Intelligenza Artificiale",
  "/admin/silvio": "Silvio",
  "/admin/messaggi-programmati": "Messaggi programmati",
  "/admin/feature-flags": "Funzionalità Azienda",
  "/admin/feature-bundles": "Gruppi di funzionalità",
  "/admin/annunci": "Annunci",
  "/admin/changelog": "Novità",
  "/admin/fv-modulo": "Modulo fotovoltaico",
  "/admin/prezzari-regionali": "Prezzari regionali",
  "/admin/template-articoli": "Libreria listino",
  "/admin/manodopera-tariffe": "Manodopera (costo orario)",
  "/admin/salute": "Salute piattaforma",
  "/admin/sito": "Traffico sito",
  "/admin/siti": "Siti e Google",
  "/admin/connessioni": "Connessioni",
  "/admin/sms": "Prezzi e pacchetti SMS",
  "/admin/marketing": "Marketing",
  "/admin/marketing/dashboard": "Dashboard CRM",
  "/admin/marketing/clienti-servizio": "Clienti Servizi",
  "/admin/marketing/contatti": "Contatti",
  "/admin/marketing/lead-scraper": "Lead scraper",
  "/admin/marketing/opportunita": "Opportunità",
  "/admin/marketing/calendario": "Calendario",
  "/admin/marketing/email": "Email Marketing",
  "/admin/marketing/sms": "SMS Marketing",
  "/admin/marketing/whatsapp": "WhatsApp (Meta)",
  "/admin/marketing/whatsapp-locale": "WhatsApp dal telefono",
  "/admin/marketing/whatsapp-locale/campagne": "WhatsApp dal telefono",
  "/admin/marketing/whatsapp-locale/numeri": "WhatsApp dal telefono",
  "/admin/marketing/automazioni": "Automazioni",
  "/admin/marketing/automazioni/nuova": "Nuova automazione",
  "/admin/marketing/agenti-ai": "Agenti AI",
  "/admin/marketing/lead-forms": "Moduli lead Meta",
  "/admin/marketing/form-builder": "Form Builder",
  "/admin/marketing/reportistica": "Report",
  "/admin/marketing/sales-os": "Sales OS",
  "/admin/marketing/simulatore-roi": "Simulatore ROI",
  "/admin/marketing/preventivi": "Preventivi",
  "/admin/marketing/preventivi/nuovo": "Nuovo preventivo",
  "/admin/impostazioni": "Impostazioni",
  "/admin/impostazioni/mio-profilo": "Il mio profilo",
  "/admin/impostazioni/super-admin": "Gestione Team",
  "/admin/impostazioni/piattaforma": "Info Piattaforma",
  "/admin/impostazioni/campi-personalizzati": "Campi personalizzati",
  "/admin/impostazioni/prodotti-servizi": "Prodotti & Servizi",
  "/admin/impostazioni/integrazioni": "Integrazioni",
  "/admin/impostazioni/calendari": "Calendari marketing",
  "/admin/impostazioni/sequenze": "Pipeline di vendita",
  "/admin/impostazioni/banking": "Banking",
  "/admin/impostazioni/email": "Email",
  "/admin/impostazioni/preferenze-email": "Mittente e aspetto email",
  "/admin/impostazioni/dominio-email": "Dominio email",
  "/admin/impostazioni/notifiche": "Notifiche",
  "/admin/impostazioni/meta-lead-esclusioni": "Filtro Lead Meta",
  "/admin/impostazioni/operazioni": "Operazioni",
  "/admin/impostazioni/audit": "Registro Attività",
  "/admin/impostazioni/sicurezza": "Sicurezza",
  "/admin/impostazioni/ip-allowlist": "IP autorizzati",
  "/admin/impostazioni/api-mcp": "API e MCP",
  "/admin/impostazioni/webhooks": "Webhook in uscita",
  "/admin/impostazioni/webhook-logs": "Registro webhook",
};

export function AdminBreadcrumb() {
  const location = useLocation();
  const isMobile = useIsMobile();

  const segments = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
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
      result.push({ label: "Impostazioni", href: "/admin/impostazioni/mio-profilo" });
      const settingsPage = ROUTE_MAP[path];
      if (settingsPage && path !== "/admin/impostazioni") {
        result.push({ label: settingsPage });
      }
      return result;
    }

    // Nuova azienda e dettaglio piano: sotto la loro pagina madre
    if (path === "/admin/aziende/nuova") {
      result.push({ label: "Aziende", href: "/admin/aziende" });
      result.push({ label: "Nuova Azienda" });
      return result;
    }
    if (path.match(/\/admin\/piani\/[^/]+/)) {
      result.push({ label: "Fatturato", href: "/admin/fatturato?tab=piani" });
      result.push({ label: "Piano" });
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
