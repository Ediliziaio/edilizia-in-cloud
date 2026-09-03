import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TaskStatusBadge } from "./TaskStatusBadge";
import {
  TASK_STATUS_TONE_CLASSES,
  type TaskStatusDefinition,
  type TaskStatusStage,
  type TaskStatusTone,
  makeTaskStatusValue,
  toneForStage,
} from "@/lib/taskStatuses";

const STAGE_OPTIONS: { value: TaskStatusStage; label: string }[] = [
  // "In attesa" non e' una scelta: e' il meccanismo del flusso di lavoro
  // (l'attivita aspetta che si chiuda il passo precedente). Compare qui solo
  // perche' il suo stato esiste nella lista, ma il select resta bloccato.
  { value: "blocked", label: "In attesa (flusso)" },
  { value: "todo", label: "Da fare" },
  { value: "active", label: "Operativa" },
  { value: "review", label: "Revisione" },
  { value: "done", label: "Chiusura" },
];

const TONE_OPTIONS: { value: TaskStatusTone; label: string }[] = [
  { value: "slate", label: "Neutro" },
  { value: "blue", label: "Blu" },
  { value: "amber", label: "Ambra" },
  { value: "emerald", label: "Verde" },
  { value: "violet", label: "Viola" },
  { value: "rose", label: "Rosso" },
];

interface TaskStatusSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: TaskStatusDefinition[];
  onSave: (statuses: TaskStatusDefinition[]) => void;
  onReset: () => void;
}

export function TaskStatusSettingsDialog({
  open,
  onOpenChange,
  statuses,
  onSave,
  onReset,
}: TaskStatusSettingsDialogProps) {
  const [rows, setRows] = useState<TaskStatusDefinition[]>(statuses);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (open) setRows(statuses);
  }, [open, statuses]);

  const existingValues = useMemo(() => rows.map((row) => row.value), [rows]);

  const updateRow = (value: string, updates: Partial<TaskStatusDefinition>) => {
    setRows((current) => current.map((row) => {
      if (row.value !== value) return row;
      const nextStage = updates.stage || row.stage;
      return {
        ...row,
        ...updates,
        tone: updates.tone || (updates.stage && row.tone === toneForStage(row.stage) ? toneForStage(nextStage) : row.tone),
      };
    }));
  };

  const addStatus = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = makeTaskStatusValue(label, existingValues);
    setRows((current) => [
      ...current,
      {
        value,
        label,
        shortLabel: label,
        description: "Stato personalizzato",
        stage: "active",
        tone: "violet",
        order: (current.length + 1) * 10,
      },
    ]);
    setNewLabel("");
  };

  const removeStatus = (value: string) => {
    setRows((current) => current.filter((row) => row.value !== value));
  };

  const handleSave = () => {
    const normalized = rows
      .map((row, index) => ({
        ...row,
        label: row.label.trim(),
        shortLabel: (row.shortLabel || row.label).trim(),
        order: (index + 1) * 10,
      }))
      .filter((row) => row.value && row.label);

    if (!normalized.some((row) => row.stage === "done")) {
      toast.error("Serve almeno uno stato di chiusura");
      return;
    }

    onSave(normalized);
    toast.success("Stati attivita aggiornati");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Stati attivita</DialogTitle>
          <DialogDescription>
            Personalizza il flusso operativo. Gli stati in revisione sono pensati per il controllo del responsabile prima della chiusura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 grid grid-cols-[1.1fr_0.8fr_0.7fr_0.9fr_40px] gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Nome</span>
              <span>Fase</span>
              <span>Colore</span>
              <span>Anteprima</span>
              <span />
            </div>
            <div className="space-y-2">
              {rows.map((row) => {
                const tone = TASK_STATUS_TONE_CLASSES[row.tone] || TASK_STATUS_TONE_CLASSES.slate;
                return (
                  <div key={row.value} className="grid grid-cols-[1.1fr_0.8fr_0.7fr_0.9fr_40px] items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(event) => updateRow(row.value, { label: event.target.value, shortLabel: event.target.value })}
                      className="h-9"
                      maxLength={40}
                    />
                    <Select
                      value={row.stage}
                      disabled={row.stage === "blocked"}
                      onValueChange={(stage) => updateRow(row.value, { stage: stage as TaskStatusStage })}
                    >
                      <SelectTrigger className="h-9" title={row.stage === "blocked" ? "Stato gestito dal flusso di lavoro commessa" : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={row.tone} onValueChange={(toneValue) => updateRow(row.value, { tone: toneValue as TaskStatusTone })}>
                      <SelectTrigger className="h-9">
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TaskStatusBadge status={row.value} statuses={rows} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStatus(row.value)}
                      disabled={row.locked}
                      title={row.locked ? "Gli stati base non si eliminano" : "Elimina stato"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-task-status">Aggiungi stato</Label>
              <Input
                id="new-task-status"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addStatus();
                  }
                }}
                placeholder="Es. Bloccata, Da validare, In attesa cliente"
                maxLength={40}
              />
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={addStatus} disabled={!newLabel.trim()}>
              <Plus className="h-4 w-4" />
              Aggiungi
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="mr-auto gap-2"
            onClick={() => {
              onReset();
              toast.success("Stati ripristinati");
              onOpenChange(false);
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Ripristina default
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button type="button" onClick={handleSave}>
            Salva stati
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
