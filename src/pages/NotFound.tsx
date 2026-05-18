import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/utils/logger";
import { useSEO } from "@/hooks/useSEO";

const NotFound = () => {
  const location = useLocation();

  // v8.6.47 — SEO fix critico: la pagina NotFound veniva servita con HTTP 200
  // (perché Cloudflare Pages fa SPA fallback su /index.html per tutti i path
  // non matchati), quindi Google la considerava una pagina valida E duplicata
  // della homepage (stessa shell HTML iniziale).
  // Risultato in Google Search Console:
  //   - "Pagina duplicata, Google ha scelto canonica diversa"
  //   - Soft 404 detection sporadica
  //
  // Fix definitivo: meta robots="noindex,nofollow" tramite useSEO. Googlebot
  // legge il noindex DOPO il rendering JS, quindi non indicizzerà nessuna
  // pagina che termina su NotFound.
  // Nota: per un 404 status code reale serve SSR — fuori scope qui.
  useSEO({
    title: "Pagina non trovata (404)",
    description: "La pagina richiesta non esiste o è stata spostata. Torna alla home di Edilizia in Cloud.",
    canonical: "/",
    noindex: true,
  });

  useEffect(() => {
    logger.warn("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-muted-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">
          Oops! La pagina che cerchi non esiste.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-primary hover:underline"
        >
          Torna alla Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
