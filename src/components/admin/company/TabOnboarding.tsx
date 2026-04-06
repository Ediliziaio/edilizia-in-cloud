import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Play, SkipForward, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOnboardingTask, type OnboardingTask } from "@/hooks/useOnboardingTask";

interface TabOnboardingProps {
  companyId: string;
}

const statoConfig: Record<
  OnboardingTask["stato"],
  { label: string; icon: React.ElementType; className: string }
> = {
  da_fare: { label: "Da fare", icon: Circle, className: "text-muted-foreground" },
  in_corso: { label: "In corso", icon: Play, className: "text-blue-600" },
  completato: { label: "Completato", icon: CheckCircle2, className: "text-green-600" },
  saltato: { label: "Saltato", icon: SkipForward, className: "text-orange-500" },
};

function TaskItem({
  task,
  onChangeStato,
  isLoading,
}: {
  task: OnboardingTask;
  onChangeStato: (stato: OnboardingTask["stato"]) => void;
  isLoading: boolean;
}) {
  const cfg = statoConfig[task.stato];
  const Icon = cfg.icon;
  const isCompleted = task.stato === "completato";

  return (
    <div className={`flex items-start gap-3 py-3 border-b last:border-b-0 ${isCompleted ? "opacity-60" : ""}`}>
      <button
        className={`mt-0.5 flex-shrink-0 ${cfg.className} hover:scale-110 transition-transform`}
        onClick={() => !isCompleted && onChangeStato("completato")}
        disabled={isLoading || isCompleted}
        title={isCompleted ? "Completato" : "Segna come completato"}
      >
        <Icon className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? "line-through" : ""}`}>
          {task.titolo}
        </p>
        {task.descrizione && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.descrizione}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {task.scadenza && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Scadenza: {format(new Date(task.scadenza), "dd/MM/yyyy", { locale: it })}</span>
            </div>
          )}
          {task.assegnato_a_nome && (
            <span className="text-xs text-muted-foreground">· {task.assegnato_a_nome}</span>
          )}
          {task.completato_at && (
            <span className="text-xs text-green-600">
              Completato il {format(new Date(task.completato_at), "dd/MM/yyyy", { locale: it })}
            </span>
          )}
        </div>
      </div>

      {!isCompleted && (
        <Select
          value={task.stato}
          onValueChange={(v) => onChangeStato(v as OnboardingTask["stato"])}
          disabled={isLoading}
        >
          <SelectTrigger className="h-7 w-32 text-xs flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="da_fare" className="text-xs">Da fare</SelectItem>
            <SelectItem value="in_corso" className="text-xs">In corso</SelectItem>
            <SelectItem value="completato" className="text-xs">Completato</SelectItem>
            <SelectItem value="saltato" className="text-xs">Saltato</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function TabOnboarding({ companyId }: TabOnboardingProps) {
  const { tasks, isLoading, aggiornaStato, creaTask, completionePct } =
    useOnboardingTask(companyId);
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [nuovoTitolo, setNuovoTitolo] = useState("");
  const [nuovoDescrizione, setNuovoDescrizione] = useState("");
  const [nuovoScadenza, setNuovoScadenza] = useState("");

  const handleCreate = () => {
    if (!nuovoTitolo.trim()) return;
    creaTask.mutate(
      {
        titolo: nuovoTitolo.trim(),
        descrizione: nuovoDescrizione.trim() || undefined,
        scadenza: nuovoScadenza || undefined,
      },
      {
        onSuccess: () => {
          setNuovoTitolo("");
          setNuovoDescrizione("");
          setNuovoScadenza("");
          setNuovoOpen(false);
        },
      }
    );
  };

  const pending = tasks.filter((t) => t.stato !== "completato" && t.stato !== "saltato");
  const completed = tasks.filter((t) => t.stato === "completato" || t.stato === "saltato");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Onboarding Playbook</h3>
          <p className="text-xs text-muted-foreground">Task CS per questa azienda</p>
        </div>
        <Button size="sm" onClick={() => setNuovoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Task
        </Button>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Completamento onboarding</span>
            <span className="font-medium">{completionePct}%</span>
          </div>
          <Progress value={completionePct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {tasks.filter((t) => t.stato === "completato").length} di {tasks.length} task completati
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-5 w-5 rounded-full flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Nessun task onboarding per questa azienda
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                I task vengono creati automaticamente alla registrazione oppure puoi aggiungerli manualmente
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setNuovoOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi il primo task
              </Button>
            </div>
          ) : (
            <div>
              {/* Task attivi */}
              {pending.length > 0 && (
                <div>
                  {pending.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      onChangeStato={(stato) => aggiornaStato.mutate({ taskId: t.id, stato })}
                      isLoading={aggiornaStato.isPending}
                    />
                  ))}
                </div>
              )}

              {/* Task completati */}
              {completed.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Completati
                  </p>
                  {completed.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      onChangeStato={(stato) => aggiornaStato.mutate({ taskId: t.id, stato })}
                      isLoading={aggiornaStato.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog nuovo task */}
      <Dialog open={nuovoOpen} onOpenChange={setNuovoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuovo Task</DialogTitle>
            <DialogDescription>Aggiungi un task di onboarding manuale</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-titolo">
                Titolo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-titolo"
                value={nuovoTitolo}
                onChange={(e) => setNuovoTitolo(e.target.value)}
                placeholder="Titolo del task"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Descrizione</Label>
              <Textarea
                id="task-desc"
                value={nuovoDescrizione}
                onChange={(e) => setNuovoDescrizione(e.target.value)}
                rows={2}
                className="resize-none"
                placeholder="Dettagli opzionali..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-scad">Scadenza</Label>
              <Input
                id="task-scad"
                type="date"
                value={nuovoScadenza}
                onChange={(e) => setNuovoScadenza(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuovoOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!nuovoTitolo.trim() || creaTask.isPending}>
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
