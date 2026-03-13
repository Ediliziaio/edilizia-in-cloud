import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Play, Undo2, Redo2, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AutomationFlow } from "@/types/automationBuilder";
import { useLatestFlowExecution } from "@/hooks/useFlowExecutions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FlowBuilderHeaderProps {
  flow: AutomationFlow | null | undefined;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePublish: () => void;
}

export function FlowBuilderHeader({
  flow,
  isSaving,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  onSave,
  onUndo,
  onRedo,
  onTogglePublish,
}: FlowBuilderHeaderProps) {
  const navigate = useNavigate();
  const isPublished = flow?.status === "published";
  const { data: lastRun } = useLatestFlowExecution(flow?.id);

  return (
    <div className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/automazioni?tab=marketing")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-sm font-semibold leading-tight">
            {flow?.name || "Nuova Automazione"}
          </h1>
          <div className="flex items-center gap-1.5">
            <Badge variant={isPublished ? "default" : "secondary"} className="text-[10px] h-4">
              {isPublished ? "Pubblicata" : "Bozza"}
            </Badge>
            {hasUnsavedChanges && (
              <span className="text-[10px] text-muted-foreground">• Modifiche non salvate</span>
            )}
            {lastRun && <LastRunBadge run={lastRun} />}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="Annulla (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} title="Ripeti (Ctrl+Y)">
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving || !hasUnsavedChanges}>
          {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Salva
        </Button>

        <Button size="sm" onClick={onTogglePublish} disabled={isSaving}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {isPublished ? "Metti in bozza" : "Pubblica"}
        </Button>
      </div>
    </div>
  );
}

function LastRunBadge({ run }: { run: { status: string; started_at: string; duration_ms: number | null; error_message: string | null } }) {
  const timeAgo = getTimeAgo(run.started_at);

  const config = {
    completed: { icon: CheckCircle2, label: "Completata", className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200" },
    error: { icon: XCircle, label: "Errore", className: "text-destructive bg-destructive/10 border-destructive/20" },
    running: { icon: Loader2, label: "In corso", className: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200" },
  }[run.status] ?? { icon: Clock, label: run.status, className: "text-muted-foreground bg-muted border-border" };

  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${config.className}`}>
          <Icon className={`h-3 w-3 ${run.status === "running" ? "animate-spin" : ""}`} />
          {timeAgo}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p>Ultima esecuzione: {config.label}</p>
        {run.duration_ms != null && <p>Durata: {run.duration_ms}ms</p>}
        {run.error_message && <p className="text-destructive max-w-60 truncate">{run.error_message}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}
