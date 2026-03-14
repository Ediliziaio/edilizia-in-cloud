import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Save, Undo2, Redo2, Loader2, Edit2, Check, X,
  Archive, FlaskConical, Play, Pause,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AutomationFlow } from "@/types/automationBuilder";
import { useLatestFlowExecution } from "@/hooks/useFlowExecutions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

export type BuilderTab = "builder" | "impostazioni" | "cronologia" | "registro";

interface FlowBuilderHeaderProps {
  flow: AutomationFlow | null | undefined;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeTab: BuilderTab;
  onTabChange: (tab: BuilderTab) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePublish: () => void;
  onUpdateName: (name: string) => void;
  onArchive: () => void;
}

const TABS: { key: BuilderTab; label: string }[] = [
  { key: "builder", label: "Builder" },
  { key: "impostazioni", label: "Impostazioni" },
  { key: "cronologia", label: "Cronologia" },
  { key: "registro", label: "Registro" },
];

export function FlowBuilderHeader({
  flow,
  isSaving,
  hasUnsavedChanges,
  canUndo,
  canRedo,
  activeTab,
  onTabChange,
  onSave,
  onUndo,
  onRedo,
  onTogglePublish,
  onUpdateName,
  onArchive,
}: FlowBuilderHeaderProps) {
  const navigate = useNavigate();
  const isPublished = flow?.status === "published";
  const { data: lastRun } = useLatestFlowExecution(flow?.id);

  const [editingName, setEditingName] = useState(false);
  const [nameTemp, setNameTemp] = useState("");

  const startEditing = () => {
    setNameTemp(flow?.name || "");
    setEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameTemp.trim();
    if (trimmed) onUpdateName(trimmed);
    setEditingName(false);
  };

  return (
    <div className="flex h-12 items-center border-b bg-background px-3 gap-2">
      {/* Left: back + name */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground gap-1.5 shrink-0"
        onClick={() => navigate("/azienda/automazioni?tab=marketing")}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">Flussi</span>
      </Button>

      <div className="h-5 w-px bg-border shrink-0" />

      {/* Editable name */}
      {editingName ? (
        <div className="flex items-center gap-1">
          <Input
            value={nameTemp}
            onChange={(e) => setNameTemp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
            className="h-7 text-sm font-medium w-[200px] border-primary"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveName}>
            <Check className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingName(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          onClick={startEditing}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors group min-w-0"
        >
          <span className="truncate max-w-[180px]">{flow?.name || "Nuova Automazione"}</span>
          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      )}

      {/* Center: tabs */}
      <div className="flex items-center ml-4 bg-muted rounded-lg p-0.5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Annulla (Ctrl+Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Ripeti (Ctrl+Y)</TooltipContent>
        </Tooltip>

        <div className="h-5 w-px bg-border mx-1" />

        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled>
          <FlaskConical className="h-3.5 w-3.5" />
          Test
        </Button>

        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 relative" onClick={onSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salva
          {hasUnsavedChanges && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-orange-500 border-2 border-background" />
          )}
        </Button>

        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          variant={isPublished ? "secondary" : "default"}
          onClick={onTogglePublish}
          disabled={isSaving}
        >
          {isPublished ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Bozza
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Pubblica
            </>
          )}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Archivia</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
