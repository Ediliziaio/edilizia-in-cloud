import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Play, Undo2, Redo2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AutomationFlow } from "@/types/automationBuilder";

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
