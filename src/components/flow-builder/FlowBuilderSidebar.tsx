import {
  MessageSquare, AlertCircle, Clock, BarChart2, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkflowNotesPanel } from "./panels/WorkflowNotesPanel";
import { WorkflowErrorsPanel, type WorkflowError } from "./panels/WorkflowErrorsPanel";
import { WorkflowVersionsPanel } from "./panels/WorkflowVersionsPanel";

export type LeftPanel = "none" | "notes" | "errors" | "versions" | "history" | "stats" | "ai";

interface SidebarItem {
  key: LeftPanel;
  icon: React.ReactNode;
  label: string;
  badgeCount?: number;
}

interface FlowBuilderSidebarProps {
  activePanel: LeftPanel;
  onPanelChange: (p: LeftPanel) => void;
  flowId?: string;
  errors?: WorkflowError[];
}

export function FlowBuilderSidebar({ activePanel, onPanelChange, flowId, errors = [] }: FlowBuilderSidebarProps) {
  const toggle = (key: LeftPanel) => onPanelChange(activePanel === key ? "none" : key);

  const erroriCount = errors.filter(e => e.tipo === "errore").length;

  const ITEMS: SidebarItem[] = [
    { key: "notes", icon: <MessageSquare className="h-4 w-4" />, label: "Note" },
    { key: "errors", icon: <AlertCircle className="h-4 w-4" />, label: "Errori", badgeCount: erroriCount },
    { key: "versions", icon: <Clock className="h-4 w-4" />, label: "Versioni" },
    { key: "stats", icon: <BarChart2 className="h-4 w-4" />, label: "Statistiche" },
    { key: "ai", icon: <Sparkles className="h-4 w-4" />, label: "AI" },
  ];

  return (
    <div className="flex h-full shrink-0">
      {/* Icon bar */}
      <div className="flex w-12 flex-col items-center gap-1 border-r bg-muted/30 py-2">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            title={item.label}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              activePanel === item.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.icon}
            {item.badgeCount != null && item.badgeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                {item.badgeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sliding panel */}
      {activePanel !== "none" && (
        <div className="w-[280px] border-r bg-background flex flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">
              {ITEMS.find((i) => i.key === activePanel)?.label}
            </h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPanelChange("none")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Render real panels */}
          {activePanel === "notes" && flowId && (
            <WorkflowNotesPanel flowId={flowId} />
          )}
          {activePanel === "errors" && (
            <WorkflowErrorsPanel errors={errors} />
          )}
          {activePanel === "versions" && flowId && (
            <WorkflowVersionsPanel flowId={flowId} />
          )}
          {activePanel === "stats" && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-muted-foreground text-center">
                Le statistiche di esecuzione verranno mostrate qui.
              </p>
            </div>
          )}
          {activePanel === "ai" && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-muted-foreground text-center">
                L'assistente AI per la creazione automatica di workflow sarà disponibile a breve.
              </p>
            </div>
          )}
          {/* Fallback for panels without flowId */}
          {(activePanel === "notes" || activePanel === "versions") && !flowId && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-muted-foreground text-center">
                Salva il flusso per accedere a questa funzione.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
