/**
 * RichTextEditorSafe — wrapper difensivo del RichTextEditor (TipTap).
 *
 * Carica `RichTextEditor` in modo LAZY + Suspense + ErrorBoundary:
 *  - se il bundle TipTap fallisce a caricarsi (es. cache Vite corrotta in dev,
 *    versione incompatibile post-aggiornamento, network error sul chunk), la
 *    pagina NON si rompe → fallback automatico al Textarea plain.
 *  - in produzione: una volta caricato funziona normalmente.
 *
 * Senza questo wrapper, un import statico di TipTap che fallisce bloccava
 * l'INTERA pagina template-preventivi con "Errore nel caricamento della pagina".
 */
import { Component, lazy, Suspense, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const LazyRichTextEditor = lazy(() =>
  import("./rich-text-editor").then((m) => ({ default: m.RichTextEditor })),
);

interface Props {
  value: string | null | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  readOnly?: boolean;
}

export function RichTextEditorSafe(props: Props) {
  return (
    <RichTextErrorBoundary fallback={<TextareaFallback {...props} />}>
      <Suspense fallback={<LoadingFallback minHeight={props.minHeight} />}>
        <LazyRichTextEditor {...props} />
      </Suspense>
    </RichTextErrorBoundary>
  );
}

// ─── Fallback states ─────────────────────────────────────────────────────────

function LoadingFallback({ minHeight }: { minHeight?: number }) {
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50/60 flex items-center justify-center text-xs text-muted-foreground gap-2"
      style={{ minHeight: minHeight ?? 120 }}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Caricamento editor…
    </div>
  );
}

function TextareaFallback({
  value, onChange, placeholder, minHeight, className, readOnly,
}: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Editor avanzato non disponibile — uso campo testo semplice.
      </div>
      <Textarea
        value={stripHtml(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ minHeight: minHeight ?? 120 }}
        className="text-xs"
      />
    </div>
  );
}

/** Estrae solo il testo da una stringa HTML (fallback senza formattazione). */
function stripHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent ?? html;
  } catch {
    return html.replace(/<[^>]+>/g, "");
  }
}

// ─── Error boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class RichTextErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[RichTextEditor] caricamento fallito, fallback Textarea:", error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
