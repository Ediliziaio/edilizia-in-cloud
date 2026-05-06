/**
 * ToolExecutionViewer — MP-AIE-02 v2
 *
 * Mostra timeline dei tool eseguiti dall'AI in una conversazione, in formato
 * compatto e collapsible. Inserito sotto i messaggi assistant che hanno
 * invocato tool del registry.
 */
import { useState } from "react";
import { AlertCircle, CheckCircle, ChevronDown, Loader2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AIToolCall } from "@/components/ai/shared/useAIChat";

const DOMAIN_EMOJI: Record<string, string> = {
  crm: "👥",
  cantiere: "🏗️",
  fattura: "📄",
  banking: "🏦",
  email: "📧",
  calendar: "📅",
  compliance: "🛡️",
  hr: "👤",
  kpi: "📊",
  preventivi: "💼",
  filiera: "🚚",
  anomalie: "⚠️",
  generative: "✨",
  knowledge: "📚",
  meta: "🧠",
};

interface ToolExecutionViewerProps {
  toolCalls: AIToolCall[];
}

export function ToolExecutionViewer({ toolCalls }: ToolExecutionViewerProps) {
  const [expanded, setExpanded] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mt-3 rounded border border-border/40 bg-background/50 p-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        <Zap className="h-3 w-3 text-amber-500" />
        <span className="font-medium">
          {toolCalls.length} {toolCalls.length === 1 ? "azione eseguita" : "azioni eseguite"}
        </span>
        <ChevronDown className={`ml-auto h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {toolCalls.map((tc, idx) => (
            <div
              key={`${tc.id ?? "tc"}-${idx}`}
              className="flex items-start gap-2 rounded bg-background p-2 text-xs"
            >
              <StatusIcon status={tc.status ?? "success"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {tc.name}
                  </code>
                  <Badge variant="outline" className="text-[10px]">
                    {tc.status ?? "success"}
                  </Badge>
                </div>
                {tc.arguments != null && Object.keys(tc.arguments).length > 0 && (
                  <details className="mt-1 text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer">Argomenti</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-1 text-[10px]">
                      {safeStringify(tc.arguments, 240)}
                    </pre>
                  </details>
                )}
                {tc.result != null && (
                  <ResultPreview result={tc.result} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle className="mt-0.5 h-3 w-3 text-green-600" />;
  if (status === "error") return <AlertCircle className="mt-0.5 h-3 w-3 text-destructive" />;
  return <Loader2 className="mt-0.5 h-3 w-3 animate-spin text-muted-foreground" />;
}

function ResultPreview({ result }: { result: unknown }) {
  if (
    result &&
    typeof result === "object" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any).success === false &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any).error
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (result as any).error;
    const msg = typeof err === "string" ? err : err.message ?? "Errore sconosciuto";
    return <p className="mt-1 text-xs text-destructive">{msg}</p>;
  }
  return (
    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-1.5 text-[10px] text-muted-foreground">
      {safeStringify(result, 600)}
    </pre>
  );
}

function safeStringify(value: unknown, maxChars: number): string {
  try {
    const str = JSON.stringify(value, null, 2);
    return str.length > maxChars ? str.slice(0, maxChars) + "…" : str;
  } catch {
    return String(value);
  }
}

export { DOMAIN_EMOJI };
