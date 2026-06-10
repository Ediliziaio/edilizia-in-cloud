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
  readinessChecks?: { label: string; ok: boolean }[];
}

export function FlowBuilderSidebar({ activePanel, onPanelChange, flowId, errors = [], readinessChecks = [] }: FlowBuilderSidebarProps) {
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
        <div className="w-[280px] border-r bg-background flex flex-col max-md:fixed max-md:inset-y-0 max-md:left-12 max-md:z-40 max-md:w-[min(80vw,300px)] max-md:shadow-2xl">
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
            <WorkflowErrorsPanel errors={errors} readinessChecks={readinessChecks} />
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
            <div className="flex-1 space-y-3 p-4 text-sm">
              <div className="rounded-lg border bg-primary/5 p-3">
                <div className="mb-1 flex items-center gap-2 font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Assistente workflow
                </div>
                <p className="text-xs text-muted-foreground">
                  Usa questo pannello come checklist mentre costruisci il flusso: trigger, condizioni, azioni e controlli finali.
                </p>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Sequenza consigliata</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Scegli un solo trigger chiaro.</li>
                  <li>Aggiungi condizioni prima delle azioni critiche.</li>
                  <li>Configura mittenti, template e variabili.</li>
                  <li>Controlla il pannello Errori prima di pubblicare.</li>
                  <li>Esegui un test su un contatto reale di prova.</li>
                </ol>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                Per generare un intero flusso da una descrizione, usa il pulsante “Crea tramite AI” nella lista automazioni: l’AI prepara una bozza completa che poi rifinisci qui.
              </div>
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
