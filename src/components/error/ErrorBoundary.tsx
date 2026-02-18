import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

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
 *
 * Uso:
 *   <ErrorBoundary title="Errore nella Dashboard">
 *     <Dashboard />
 *   </ErrorBoundary>
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
    // In produzione qui si potrebbe inviare a Sentry o Supabase logs
    console.error("[ErrorBoundary] Errore catturato:", error.message);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
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

          {/* Mostra il messaggio tecnico solo in development */}
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
