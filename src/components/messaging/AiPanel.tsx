import { useAiRuns, useConfirmAiAction, useIgnoreAiRun } from "@/hooks/useMessagingData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Target,
  Gauge,
  Lightbulb,
  AlertTriangle,
  ClipboardList,
  FileText,
  ArrowRightCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const intentLabels: Record<string, string> = {
  problema_cantiere: "Problema cantiere",
  materiale_mancante: "Materiale mancante",
  report_lavoro: "Report lavoro",
  aggiornamento_stato: "Aggiornamento stato",
  urgenza_ordine: "Urgenza ordine",
  richiesta_informazioni: "Richiesta informazioni",
  altro: "Altro",
};

const intentIcons: Record<string, React.ReactNode> = {
  problema_cantiere: <AlertTriangle className="h-4 w-4 text-destructive" />,
  materiale_mancante: <ClipboardList className="h-4 w-4 text-warning" />,
  report_lavoro: <FileText className="h-4 w-4 text-primary" />,
  aggiornamento_stato: <ArrowRightCircle className="h-4 w-4 text-primary" />,
  urgenza_ordine: <AlertTriangle className="h-4 w-4 text-destructive" />,
  richiesta_informazioni: <Lightbulb className="h-4 w-4 text-muted-foreground" />,
  altro: <Bot className="h-4 w-4 text-muted-foreground" />,
};

const actionTypeLabels: Record<string, string> = {
  create_task: "Crea attività",
  create_daily_report: "Crea report giornaliero",
  change_order_status: "Cambia stato ordine",
  notify: "Invia notifica",
  none: "Nessuna azione",
};

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-green-500/10 text-green-700 border-green-200"
    : pct >= 50 ? "bg-yellow-500/10 text-yellow-700 border-yellow-200"
    : "bg-red-500/10 text-red-700 border-red-200";

  return (
    <Badge variant="outline" className={cn("font-mono", color)}>
      {pct}%
    </Badge>
  );
}

interface AiPanelProps {
  selectedMessageId: string | null;
}

export function AiPanel({ selectedMessageId }: AiPanelProps) {
  const { data: aiRuns, isLoading } = useAiRuns(selectedMessageId);
  const confirmAction = useConfirmAiAction();
  const ignoreRun = useIgnoreAiRun();

  if (!selectedMessageId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground border-l">
        <div className="text-center p-6">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seleziona un messaggio per vedere l'analisi AI</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border-l p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!aiRuns?.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground border-l">
        <div className="text-center p-6">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessuna analisi AI per questo messaggio</p>
          <p className="text-xs mt-1">Clicca "Analizza con AI" nella chat</p>
        </div>
      </div>
    );
  }

  const latestRun = aiRuns[0] as any;
  const output = latestRun.ai_output;
  const isCompleted = latestRun.status === "completed";
  const isConfirmed = latestRun.status === "confirmed";
  const isIgnored = latestRun.status === "ignored";
  const isPending = latestRun.status === "pending";

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground border-l">
        <div className="text-center p-6">
          <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin opacity-50" />
          <p className="text-sm">AI in elaborazione...</p>
        </div>
      </div>
    );
  }

  if (!output || latestRun.status === "error") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground border-l">
        <div className="text-center p-6">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive opacity-50" />
          <p className="text-sm">Errore nell'analisi AI</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full border-l">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Analisi AI</h3>
          {isConfirmed && <Badge className="bg-green-500/10 text-green-700 text-xs">Confermato</Badge>}
          {isIgnored && <Badge variant="secondary" className="text-xs">Ignorato</Badge>}
        </div>

        {/* Entity */}
        {output.matched_entity && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Entità trovata</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium capitalize">{output.matched_entity.type}</p>
                {output.matched_entity.name && (
                  <p className="text-xs text-muted-foreground">{output.matched_entity.name}</p>
                )}
              </div>
              <ConfidenceBadge value={output.matched_entity.confidence} />
            </div>
          </div>
        )}

        {/* Intent */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Intent rilevato</span>
          </div>
          <div className="flex items-center gap-2">
            {intentIcons[output.intent] || intentIcons.altro}
            <span className="text-sm font-medium">{intentLabels[output.intent] || output.intent}</span>
          </div>
          {output.priority && (
            <Badge variant={output.priority === "urgente" || output.priority === "alta" ? "destructive" : "secondary"} className="text-xs">
              Priorità: {output.priority}
            </Badge>
          )}
        </div>

        {/* Summary */}
        {output.summary && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Riepilogo</span>
            </div>
            <p className="text-sm">{output.summary}</p>
          </div>
        )}

        {/* Actions */}
        {output.action_suggestions?.length > 0 && (
          <div className="rounded-lg border p-3 space-y-3">
            <span className="text-xs font-medium text-muted-foreground">Azioni suggerite</span>
            {output.action_suggestions.map((action: any, idx: number) => (
              <div key={idx} className="border rounded-md p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{actionTypeLabels[action.type] || action.type}</span>
                </div>
                <p className="text-sm">{action.title}</p>
                {action.description && <p className="text-xs text-muted-foreground">{action.description}</p>}

                {isCompleted && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => confirmAction.mutate({ aiRunId: latestRun.id, action })}
                      disabled={confirmAction.isPending}
                    >
                      {confirmAction.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Conferma
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => ignoreRun.mutate(latestRun.id)}
                      disabled={ignoreRun.isPending}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Ignora
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confirmed actions */}
        {isConfirmed && latestRun.created_actions && (
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-1">
            <span className="text-xs font-medium text-green-700">Azioni eseguite:</span>
            {(latestRun.created_actions as any[]).map((a: any, i: number) => (
              <p key={i} className="text-xs text-green-600">✅ {a.type} creato (ID: {a.id?.slice(0, 8)}...)</p>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
