import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { Home, ArrowLeft, Search, Mail, LifeBuoy } from "lucide-react";
import { logger } from "@/utils/logger";
import { useSEO } from "@/hooks/useSEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

/**
 * NotFound — pagina 404 stilizzata + context-aware.
 *
 * v2 (2026-05-25):
 *   - Suggerimenti contestuali in base al path che ha sbagliato l'utente
 *     (es. /admin/qualcosa → mostra Dashboard Admin + Aziende + AI)
 *   - 3 CTA: Home dell'area · Indietro · Cerca (apre Cmd+K se admin)
 *   - Logging dettagliato per analisi UX (quali path 404 più frequenti)
 *
 * Note SEO: useSEO con noindex preserva il fix v8.6.47 (Cloudflare SPA fallback
 * serve 200 OK ma robots noindex evita indicizzazione Google).
 */
const NotFound = () => {
  const location = useLocation();
  const { user, isImpersonating } = useAuth();

  // Detect area dall'URL per suggerimenti contestuali
  const area: "admin" | "azienda" | "campo" | "public" = useMemo(() => {
    const p = location.pathname.toLowerCase();
    if (p.startsWith("/admin")) return "admin";
    if (p.startsWith("/azienda")) return "azienda";
    if (p.startsWith("/campo")) return "campo";
    return "public";
  }, [location.pathname]);

  useSEO({
    title: "Pagina non trovata (404)",
    description: "La pagina richiesta non esiste o è stata spostata. Torna alla home di Edilizia in Cloud.",
    canonical: "/",
    noindex: true,
  });

  useEffect(() => {
    logger.warn("404 Error: User attempted to access non-existent route:", location.pathname, {
      area,
      authenticated: !!user,
      impersonating: isImpersonating,
    });
  }, [location.pathname, area, user, isImpersonating]);

  // Suggerimenti specifici per area
  const suggestions = useMemo(() => {
    if (area === "admin") {
      return [
        { label: "Dashboard Admin", to: "/admin", icon: Home },
        { label: "Aziende", to: "/admin/aziende", icon: Search },
        { label: "Fatturato", to: "/admin/fatturato", icon: Search },
        { label: "AI", to: "/admin/ai", icon: Search },
      ];
    }
    if (area === "azienda") {
      return [
        { label: "Dashboard Azienda", to: "/azienda", icon: Home },
        { label: "Commesse", to: "/azienda/ordini", icon: Search },
        { label: "Email", to: "/azienda/email", icon: Mail },
      ];
    }
    if (area === "campo") {
      return [
        { label: "Home Campo", to: "/campo", icon: Home },
      ];
    }
    return [
      { label: "Home", to: "/", icon: Home },
      { label: "Funzionalità", to: "/funzionalita", icon: Search },
      { label: "Contatti", to: "/demo", icon: Mail },
    ];
  }, [area]);

  const homeHref =
    area === "admin" ? "/admin"
    : area === "azienda" ? "/azienda"
    : area === "campo" ? "/campo"
    : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-orange-50/30 px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Hero */}
        <div className="text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-200"
          >
            <span className="text-3xl font-bold">404</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Pagina non trovata
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            L&apos;indirizzo <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-800">{location.pathname}</code> non esiste o è stato spostato.
          </p>
        </div>

        {/* CTA principali */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="default" className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
            <Link to={homeHref}>
              <Home className="h-4 w-4" />
              {area === "admin" ? "Dashboard Admin" : area === "azienda" ? "Dashboard Azienda" : "Home"}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Indietro
          </Button>
        </div>

        {/* Suggerimenti contestuali */}
        {suggestions.length > 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Forse cercavi
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {suggestions.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.to}
                    to={s.to}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition hover:border-orange-200 hover:bg-orange-50/50"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="font-medium text-slate-700">{s.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Help footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Se pensi che sia un errore,{" "}
          <Link to="/demo" className="inline-flex items-center gap-1 text-orange-600 hover:underline">
            <LifeBuoy className="h-3 w-3" />
            segnala il problema
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default NotFound;
