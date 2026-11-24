import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Il titolo dell'errore, nella lingua di chi guarda (la classe non può usare gli hook). */
function TitoloErrore({ sezione }: { sezione: string }) {
  const t = useT();
  return <>{t("Errore nel caricamento: {sezione}", { sezione })}</>;
}

interface Props {
  children: ReactNode;
  sectionName: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-semibold text-destructive">
              <TitoloErrore sezione={this.props.sectionName} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
