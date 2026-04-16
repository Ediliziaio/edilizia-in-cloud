import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { captureVelocityError } from "@/lib/velocity/sentry";

interface Props {
  children: React.ReactNode;
  /** Titolo mostrato nel fallback (default: "Qualcosa è andato storto") */
  title?: string;
  /** Componente custom da mostrare al posto del fallback predefinito */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — cattura i crash di qualsiasi componente figlio
 * e mostra un'interfaccia di recupero invece di un'app completamente bianca.
 * Invia gli errori alla tabella system_health_metrics per osservabilità centralizzata.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("[ErrorBoundary] Errore catturato:", error.message);

    // Velocity — Sentry con velocity_area="error_boundary" + componentStack.
    // captureVelocityError è no-op se Sentry non è inizializzato (DSN vuota).
    captureVelocityError("error_boundary", error, {
      componentStack: errorInfo.componentStack?.slice(0, 2000) ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
    });

    // Report to system_health_metrics for centralized observability
    this.reportError(error, errorInfo).catch(() => {
      // Silent fail — error reporting should never block UX
    });
  }

  private async reportError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      await supabase.from("system_health_metrics").insert({
        metric_type: "client_error",
        function_name: "ErrorBoundary",
        error_message: `${error.name}: ${error.message}`.substring(0, 500),
        metadata: {
          stack: error.stack?.substring(0, 1000),
          componentStack: errorInfo.componentStack?.substring(0, 500),
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Silent — never let error reporting cause more errors
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  private isChunkError(error: Error | null): boolean {
    if (!error) return false;
    return (
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch dynamically imported module") ||
      error.message.includes("Importing a module script failed") ||
      error.message.includes("Unable to preload CSS") ||
      /Loading chunk \d+ failed/.test(error.message)
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // ChunkLoadError = new deploy, old chunk hashes gone → auto-reload once
      if (this.isChunkError(this.state.error)) {
        const reloadKey = '_chunk_err_reload';
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1');
          // Clear SW caches then hard-reload so the fresh index.html is served
          const doReload = () => window.location.reload();
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations()
              .then(regs => Promise.all(regs.map(r => r.unregister())))
              .then(() => typeof caches !== 'undefined'
                ? caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
                : Promise.resolve())
              .then(doReload)
              .catch(doReload);
          } else {
            setTimeout(doReload, 50);
          }
        }
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <div className="p-4 rounded-full bg-blue-50 mb-4">
              <RefreshCw className="h-10 w-10 text-blue-500 animate-spin" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Aggiornamento in corso…</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              La pagina si ricaricherà automaticamente.
            </p>
          </div>
        );
      }

      const title = this.props.title ?? "Qualcosa è andato storto";

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="p-4 rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>

          <p className="text-muted-foreground text-sm mb-1 max-w-md">
            Si è verificato un errore inatteso in questa sezione. Puoi riprovare
            o tornare alla home.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <p className="text-xs text-destructive/70 font-mono bg-destructive/5 border border-destructive/20 rounded px-3 py-2 mt-3 max-w-lg break-all">
              {this.state.error.message}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <Button onClick={this.handleReset} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
            <Button variant="outline" size="sm" onClick={this.handleGoHome}>
              <Home className="h-4 w-4 mr-2" />
              Vai alla home
            </Button>
          </div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
