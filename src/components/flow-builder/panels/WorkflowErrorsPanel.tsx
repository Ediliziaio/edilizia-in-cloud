import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface WorkflowError {
  nodeId: string;
  nodeLabel: string;
  tipo: "errore" | "avviso";
  messaggio: string;
}

interface Props {
  errors: WorkflowError[];
}

export function WorkflowErrorsPanel({ errors }: Props) {
  const erroriCount = errors.filter((e) => e.tipo === "errore").length;
  const avvisiCount = errors.filter((e) => e.tipo === "avviso").length;

  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-500" />
        </div>
        <p className="text-lg font-semibold text-foreground">0 errori</p>
        <p className="text-sm text-muted-foreground mt-1">Sei a posto</p>
        <p className="text-xs text-muted-foreground mt-3">
          Il flusso di lavoro non ha errori di configurazione.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          {erroriCount > 0 && (
            <div className="flex items-center gap-2 bg-destructive/10 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-lg font-bold text-destructive">{erroriCount}</p>
                <p className="text-xs text-destructive/80">Errori</p>
              </div>
            </div>
          )}
          {avvisiCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-lg font-bold text-amber-700">{avvisiCount}</p>
                <p className="text-xs text-amber-600">Avvisi</p>
              </div>
            </div>
          )}
        </div>

        {/* Error list */}
        {errors.map((err, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 border ${
              err.tipo === "errore"
                ? "bg-destructive/5 border-destructive/20"
                : "bg-amber-500/5 border-amber-500/20"
            }`}
          >
            <div className="flex items-start gap-2">
              {err.tipo === "errore" ? (
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={`text-xs font-semibold ${
                    err.tipo === "errore" ? "text-destructive" : "text-amber-700"
                  }`}
                >
                  {err.nodeLabel}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    err.tipo === "errore" ? "text-destructive/80" : "text-amber-600"
                  }`}
                >
                  {err.messaggio}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
