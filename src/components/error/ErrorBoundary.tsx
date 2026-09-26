import React from "react";
import { AlertTriangle, RefreshCw, Home, LifeBuoy, CheckCircle2, Loader2 } from "lucide-react";
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
  /**
   * Quando cambia, un errore mostrato si toglie e si riprova (i layout passano
   * la pagina aperta). Senza, dopo il crash di una pagina anche tutte le altre
   * mostravano l'errore finché non si ricaricava (Ener Italia, 25/09/2026). Non
   * rimonta i figli quando non c'è errore: una `key` staccherebbe il telefono.
   */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  /** Stato invio ticket assistenza super-admin */
  ticketState: "idle" | "submitting" | "success" | "error";
  ticketError: string | null;
}

/**
 * ErrorBoundary — cattura i crash di qualsiasi componente figlio
 * e mostra un'interfaccia di recupero invece di un'app completamente bianca.
 * Invia gli errori alla tabella system_health_metrics per osservabilità centralizzata.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  private chunkReloadScheduled = false;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      ticketState: "idle",
      ticketError: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      componentStack: null,
      ticketState: "idle",
      ticketError: null,
    };
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // Solo un errore già mostrato: se è la pagina nuova a rompersi, resta
    // l'errore e non si riprova in giro.
    if (prevState.hasError && this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.handleReset();
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("[ErrorBoundary] Errore catturato:", error.message);

    // Velocity — Sentry con velocity_area="error_boundary" + componentStack.
    // captureVelocityError è no-op se Sentry non è inizializzato (DSN vuota).
    captureVelocityError("error_boundary", error, {
      componentStack: errorInfo.componentStack?.slice(0, 2000) ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
    });

    // Salva componentStack in state per inclusion nel ticket
    this.setState({ componentStack: errorInfo.componentStack?.slice(0, 1500) ?? null });

    // Report to system_health_metrics for centralized observability
    this.reportError(error, errorInfo).catch(() => {
      // Silent fail — error reporting should never block UX
    });
  }

  /**
   * Invia ticket assistenza al super-admin (Florin) tramite edge function.
   * La function invia anche email a flo.andriciuc@gmail.com via Resend.
   */
  handleSendTicket = async () => {
    if (this.state.ticketState === "submitting") return;
    this.setState({ ticketState: "submitting", ticketError: null });

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-error-ticket`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          error_name: this.state.error?.name ?? "Error",
          error_message: this.state.error?.message ?? "Errore sconosciuto",
          stack: this.state.error?.stack?.substring(0, 2000) ?? "",
          component_stack: this.state.componentStack ?? "",
          url: window.location.href,
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      this.setState({ ticketState: "success" });
    } catch (e) {
      this.setState({
        ticketState: "error",
        ticketError: e instanceof Error ? e.message : "Errore invio ticket",
      });
    }
  };

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
    this.chunkReloadScheduled = false;
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      ticketState: "idle",
      ticketError: null,
    });
  };

  handleGoHome = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      ticketState: "idle",
      ticketError: null,
    });
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

      // ChunkLoadError = new deploy, old chunk hashes gone → auto-reload.
      // v8.6.102 — il vecchio codice era a "1 reload allowed" via sessionStorage
      // boolean: se il reload NON risolveva (Cloudflare CDN ancora serve chunk
      // vecchi) → deadlock infinito su "Aggiornamento in corso…".
      // Ora: counter con TTL 5min + bottone manuale dopo 3 tentativi falliti.
      if (this.isChunkError(this.state.error)) {
        const reloadKey = '_chunk_err_reload_v2';
        let attemptInfo: { count: number; firstAt: number } = { count: 0, firstAt: Date.now() };
        try {
          const raw = sessionStorage.getItem(reloadKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { count: number; firstAt: number };
            // TTL 5min: reset se l'errore è "vecchio"
            if (Date.now() - parsed.firstAt < 5 * 60 * 1000) {
              attemptInfo = parsed;
            }
          }
        } catch { /* parse error → reset */ }

        const MAX_AUTO_ATTEMPTS = 3;
        const tooManyAttempts = attemptInfo.count >= MAX_AUTO_ATTEMPTS;

        const triggerReload = () => {
          try {
            const next = { count: attemptInfo.count + 1, firstAt: attemptInfo.firstAt };
            sessionStorage.setItem(reloadKey, JSON.stringify(next));
          } catch { /* ignore */ }
          const doReload = () => {
            // Cache-bust via query param per forzare Cloudflare a non riusare cache
            const url = new URL(window.location.href);
            url.searchParams.set('_cb', Date.now().toString());
            window.location.replace(url.toString());
          };
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
        };

        // Auto-reload SOLO se sotto la soglia, con backoff crescente: i chunk
        // mancano tipicamente per la finestra di propagazione del deploy
        // (secondi); reload immediati bruciano i 3 tentativi dentro la
        // finestra e portano al blocco manuale senza motivo.
        const RELOAD_BACKOFF_MS = [1500, 5000, 12000];
        if (!tooManyAttempts) {
          if (!this.chunkReloadScheduled) {
            this.chunkReloadScheduled = true;
            window.setTimeout(
              triggerReload,
              RELOAD_BACKOFF_MS[Math.min(attemptInfo.count, RELOAD_BACKOFF_MS.length - 1)],
            );
          }
          return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
              <div className="p-4 rounded-full bg-blue-50 mb-4">
                <RefreshCw className="h-10 w-10 text-blue-500 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Aggiornamento in corso…</h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-md">
                Tentativo {attemptInfo.count + 1} di {MAX_AUTO_ATTEMPTS}. La pagina si ricaricherà
                automaticamente tra pochi secondi.
              </p>
            </div>
          );
        }

        // Dopo 3 tentativi: bottone manuale + reset sessionStorage al click
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <div className="p-4 rounded-full bg-amber-50 mb-4">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Aggiornamento richiesto</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              L&apos;app è stata aggiornata. Clicca per scaricare la nuova versione.
            </p>
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.removeItem(reloadKey); } catch { /* ignore */ }
                triggerReload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" /> Ricarica adesso
            </button>
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

          {/* 2026-05-27: mostro il messaggio di errore SEMPRE (anche in prod
              non solo DEV). Senza dettagli l'utente non può segnalare il vero
              problema. La INSERT policy su system_health_metrics ora permette
              il logging server-side, ma serve anche feedback immediato a
              schermo. Sanitizzo a 300 char + nessun stack trace esposto. */}
          {this.state.error && (
            <details className="mt-3 max-w-lg w-full">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                Dettagli tecnici per assistenza
              </summary>
              <p className="text-xs text-destructive/70 font-mono bg-destructive/5 border border-destructive/20 rounded px-3 py-2 mt-2 break-all text-left">
                <strong>{this.state.error.name}</strong>: {this.state.error.message.substring(0, 300)}
              </p>
            </details>
          )}

          <div className="flex gap-3 mt-6 flex-wrap justify-center">
            <Button onClick={this.handleReset} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
            <Button variant="outline" size="sm" onClick={this.handleGoHome}>
              <Home className="h-4 w-4 mr-2" />
              Vai alla home
            </Button>
          </div>

          {/* Bottone "Invia ticket assistenza" — chiama send-error-ticket
              che logga su system_health_metrics + manda email a flo.andriciuc@gmail.com */}
          <div className="mt-6 pt-6 border-t border-border w-full max-w-md">
            {this.state.ticketState === "success" ? (
              <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5" />
                <span>Ticket inviato. Florin ha ricevuto la notifica.</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3 text-center">
                  Hai bisogno di assistenza immediata? Florin (super admin) riceverà subito un'email con tutti i dettagli per intervenire.
                </p>
                <Button
                  onClick={this.handleSendTicket}
                  disabled={this.state.ticketState === "submitting"}
                  size="sm"
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                >
                  {this.state.ticketState === "submitting" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Invio in corso…
                    </>
                  ) : (
                    <>
                      <LifeBuoy className="h-4 w-4 mr-2" />
                      Invia ticket assistenza al super admin
                    </>
                  )}
                </Button>
                {this.state.ticketState === "error" && this.state.ticketError && (
                  <p className="text-xs text-destructive mt-2 text-center">
                    Errore invio: {this.state.ticketError}. Riprova o contatta l'assistenza via WhatsApp.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
